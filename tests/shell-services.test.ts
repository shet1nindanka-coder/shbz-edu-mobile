// Pure rules of the shell services: the API guard (sessionExpired / role refusal), realtime → query
// invalidation, what the query cache may persist, local reminders, the biometric lock and the cached user.
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { API_MEMBERS, type ApiClient } from "@/api/client";
import { ApiError } from "@/api/errors";
import type { GetLessonResponse, HomeworkDeadlinesResponse, ParentCallsOverviewResponse, RealtimeEvent } from "@/api/types";
import { createTestMock } from "@/mock/testing";
import { BIOMETRIC_GRACE_MS, isLockActive, shouldLockOnLaunch, shouldLockOnResume } from "@/services/biometrics/lock-policy";
import {
  MAX_SCHEDULED_REMINDERS,
  REMINDER_ID_PREFIX,
  diffReminders,
  moscowHourAhead,
  planHomeworkReminders,
  planLessonReminders,
  planParentCallReminders,
  reminderIdentifier,
  selectReminders,
  type LocalReminder,
  type ReminderTexts,
} from "@/services/notifications/reminders";
import { isPersistableQueryKey } from "@/services/query/persist-policy";
import { dedupePrefixes, invalidationPrefixesAfterGap, invalidationPrefixesFor, prefixId } from "@/services/realtime/invalidation";
import { guardApiClient } from "@/services/session/guard-api-client";
import { parseCachedUser } from "@/services/session/session-cache";

// ───────────────────────────── API guard ─────────────────────────────

describe("guardApiClient (90-addendum-1 A.3 rules 1 – 2)", () => {
  const expired = () => new ApiError({ code: "sessionExpired", status: 401, message: "Сессия истекла. Войдите заново." });

  it("reports sessionExpired once per failed call and still rejects the caller", async () => {
    const mock = createTestMock();
    const seen: string[] = [];
    const api = guardApiClient(mock.api, { onSessionExpired: (error) => seen.push(error.code) });
    // No token installed: every authenticated call is a 401 sessionExpired.
    await assert.rejects(api.shell.getMe(), (error: unknown) => error instanceof ApiError && error.code === "sessionExpired");
    assert.deepEqual(seen, ["sessionExpired"]);
  });

  it("does not treat a wrong password as a lost session", async () => {
    const mock = createTestMock();
    const seen: string[] = [];
    const api = guardApiClient(mock.api, { onSessionExpired: (error) => seen.push(error.code) });
    await assert.rejects(api.shell.login({ login: "ilya@example.com", password: "wrong" }), (error: unknown) => {
      return error instanceof ApiError && error.code === "invalidCredentials" && error.status === 401;
    });
    assert.deepEqual(seen, []);
  });

  it("reports a role refusal separately and passes successes through", async () => {
    const mock = createTestMock();
    await mock.signIn("teacher@example.com");
    const expiredSeen: string[] = [];
    const roleSeen: string[] = [];
    const api = guardApiClient(mock.api, {
      onSessionExpired: (error) => expiredSeen.push(error.code),
      onRoleRefused: (error) => roleSeen.push(error.code),
    });
    const me = await api.shell.getMe();
    assert.equal(me.user.email, "teacher@example.com");
    // A teacher asks for the student-only streak: 403, the session stays.
    await assert.rejects(api.shell.getStreak(), (error: unknown) => error instanceof ApiError && error.status === 403);
    assert.deepEqual(expiredSeen, []);
    assert.equal(roleSeen.length, 1);
  });

  it("wraps every member, keeps synchronous methods synchronous and the client's own extras", () => {
    const calls: string[] = [];
    const member = (name: string) => ({
      ping: async () => {
        calls.push(name);
        return name;
      },
    });
    const fake = Object.fromEntries(API_MEMBERS.map((name) => [name, member(name)])) as unknown as ApiClient;
    (fake.shell as unknown as { subscribeRealtime: () => () => void }).subscribeRealtime = () => () => undefined;
    const extended = Object.assign(fake, { extra: 42 });
    const guarded = guardApiClient(extended, { onSessionExpired: () => undefined });
    assert.equal(guarded.extra, 42);
    for (const name of API_MEMBERS) assert.notEqual(guarded[name], fake[name]);
    const unsubscribe = guarded.shell.subscribeRealtime(() => undefined);
    assert.equal(typeof unsubscribe, "function");
  });

  it("ignores failures that are not API errors", async () => {
    const seen: unknown[] = [];
    const fake = Object.fromEntries(
      API_MEMBERS.map((name) => [
        name,
        {
          boom: async () => {
            throw new TypeError("bug");
          },
          gone: async () => {
            throw expired();
          },
        },
      ]),
    ) as unknown as ApiClient;
    const guarded = guardApiClient(fake, { onSessionExpired: (error) => seen.push(error) }) as unknown as Record<
      string,
      { boom: () => Promise<void>; gone: () => Promise<void> }
    >;
    await assert.rejects(guarded.shell!.boom(), TypeError);
    assert.equal(seen.length, 0);
    await assert.rejects(guarded.planner!.gone());
    assert.equal(seen.length, 1);
  });
});

// ───────────────────────────── realtime → invalidation ─────────────────────────────

describe("realtime invalidation (01 §5.7, 00 §2.3)", () => {
  const at = "2026-11-16T10:00:00.000Z";
  const ids = (event: RealtimeEvent, role: "STUDENT" | "TEACHER" | "DEVELOPER") => invalidationPrefixesFor(event, role).map(prefixId);

  it("refreshes the bell on every event, for every role", () => {
    const event: RealtimeEvent = { kind: "topic-content-changed", occurredAt: at };
    for (const role of ["STUDENT", "TEACHER", "DEVELOPER"] as const) assert.ok(ids(event, role).includes("shell/listNotifications"));
  });

  it("maps a student's events to the queries the site would re-render", () => {
    assert.deepEqual(ids({ kind: "student-progress-changed", occurredAt: at, studentId: "s" }, "STUDENT"), [
      "shell/listNotifications",
      "shell/getStreak",
      "studentStudy/getNumberDetail",
      "studentWork/listHomeworks",
      "studentWork/getHomework",
      "studentStudy/getHomeworkDeadlines",
    ]);
    assert.deepEqual(ids({ kind: "student-deadlines-changed", occurredAt: at, studentId: "s" }, "STUDENT"), [
      "shell/listNotifications",
      "studentWork/listHomeworks",
      "studentWork/getHomework",
      "studentStudy/getHomeworkDeadlines",
      // The number card shows the deadline that issuing / cancelling mirrors onto the number row.
      "studentStudy/getNumberDetail",
    ]);
    assert.deepEqual(ids({ kind: "lesson-activity", occurredAt: at, lessonId: "l", teacherId: "t", studentId: "s" }, "STUDENT"), [
      "shell/listNotifications",
      "studentWork/getLiveLesson",
      "studentWork/getLiveLessonState",
    ]);
    const content = ids({ kind: "topic-content-changed", occurredAt: at }, "STUDENT");
    // A content change reaches every student response — the open homework list too (topic titles, number
    // counts, assignments of a deleted topic), as the site re-renders whichever page is open.
    assert.deepEqual(content, ["shell/listNotifications", "studentStudy", "studentWork"]);
    // The streak is refreshed only by the student's own progress.
    assert.ok(!content.includes("shell/getStreak"));
  });

  it("marks every staff member stale on any event, and never the student members", () => {
    const staff = ids({ kind: "students-changed", occurredAt: at }, "TEACHER");
    assert.deepEqual(staff, ["shell/listNotifications", "teacherStudents", "accounts", "planner", "groups", "content", "developer"]);
    assert.ok(!staff.some((id) => id.startsWith("studentWork") || id.startsWith("studentStudy")));
  });

  it("invalidates everything a role shows after a gap", () => {
    assert.deepEqual(invalidationPrefixesAfterGap("STUDENT").map(prefixId), ["shell/listNotifications", "studentStudy", "studentWork", "shell/getStreak"]);
    assert.ok(invalidationPrefixesAfterGap("DEVELOPER").map(prefixId).includes("developer"));
  });

  it("drops repeats and method prefixes covered by their member", () => {
    assert.deepEqual(
      dedupePrefixes([["shell", "getStreak"], ["studentWork"], ["studentWork", "getHomework"], ["shell", "getStreak"]]).map(prefixId),
      ["shell/getStreak", "studentWork"],
    );
  });
});

// ───────────────────────────── persisted cache ─────────────────────────────

describe("persisted query cache policy", () => {
  it("keeps what makes the app readable offline", () => {
    assert.equal(isPersistableQueryKey(["studentStudy", "getTheoryLibrary"]), true);
    assert.equal(isPersistableQueryKey(["studentStudy", "getNumberDetail", "010203"]), true);
    assert.equal(isPersistableQueryKey(["studentWork", "listHomeworks"]), true);
    assert.equal(isPersistableQueryKey(["studentWork", "getHomework", "hw_1"]), true);
    assert.equal(isPersistableQueryKey(["content", "getTopic", "t1"]), true);
    assert.equal(isPersistableQueryKey(["shell", "listNotifications"]), true);
  });

  it("never writes personal data, developer tooling or polled states to disk", () => {
    assert.equal(isPersistableQueryKey(["groups", "getParentCallsOverview"]), false);
    assert.equal(isPersistableQueryKey(["groups", "getParentCallHistory", "usr_ilya"]), false);
    assert.equal(isPersistableQueryKey(["developer", "getJournal"]), false);
    assert.equal(isPersistableQueryKey(["accounts", "getAccounts"]), false);
    assert.equal(isPersistableQueryKey(["studentWork", "getLatestHomeworkCheck", "hw_1"]), false);
    assert.equal(isPersistableQueryKey(["studentWork", "getLiveLessonState", "l"]), false);
    assert.equal(isPersistableQueryKey(["planner", "getLessonStatus", "l"]), false);
    assert.equal(isPersistableQueryKey(["shell", "getMe"]), false);
  });

  it("ignores keys that do not come from the API layer", () => {
    assert.equal(isPersistableQueryKey(["something"]), false);
    assert.equal(isPersistableQueryKey([1, 2]), false);
    assert.equal(isPersistableQueryKey([]), false);
  });
});

// ───────────────────────────── local reminders ─────────────────────────────

const TEXTS: ReminderTexts = {
  homeworkTitle: "Скоро дедлайн",
  homeworkBody: "{homework} · {topic} — сдать до {deadline}",
  lessonSoonTitle: "Урок через 10 минут",
  lessonStartTitle: "Урок начался",
  lessonBody: "{title}",
  lessonBodyWithGroup: "{title} · {group}",
  parentCallTitle: "Пора позвонить родителям",
  parentCallBody: "{name}: последний звонок был {days} дн. назад.",
  parentCallBodyNoCalls: "{name}: успешных звонков ещё не было.",
};
const FORMATTERS = {
  homeworkLabel: (homework: { title: string | null; orderInTopic: number }) => homework.title ?? `ДЗ ${homework.orderInTopic}`,
  dateTime: (iso: string) => iso.slice(0, 16),
};
const HOUR = 3_600_000;
const NOW = Date.parse("2026-11-16T09:00:00.000Z"); // 12:00 Moscow

function deadlines(items: Partial<HomeworkDeadlinesResponse["items"][number]>[]): HomeworkDeadlinesResponse {
  return {
    serverNow: new Date(NOW).toISOString(),
    today: "2026-11-16",
    items: items.map((item, index) => ({
      id: `hw_${index}`,
      title: null,
      orderInTopic: index + 1,
      topicTitle: "Линейные уравнения",
      deadlineAt: null,
      totalNumbers: 4,
      solvedCount: 0,
      ...item,
    })),
  };
}

describe("local reminders", () => {
  it("plans 24 h and 2 h before the deadline of an unfinished homework", () => {
    const deadlineAt = new Date(NOW + 30 * HOUR).toISOString();
    const reminders = planHomeworkReminders(deadlines([{ deadlineAt, title: "Проценты" }]), NOW, TEXTS, FORMATTERS);
    assert.deepEqual(
      reminders.map((reminder) => [reminder.id, reminder.fireAt - NOW]),
      [
        ["hw_0:24h", 6 * HOUR],
        ["hw_0:2h", 28 * HOUR],
      ],
    );
    assert.equal(reminders[0]?.title, "Скоро дедлайн");
    assert.equal(reminders[0]?.body, `Проценты · Линейные уравнения — сдать до ${deadlineAt.slice(0, 16)}`);
    assert.deepEqual(reminders[0]?.link, { screen: "student.homework", assignmentId: "hw_0" });
  });

  it("skips lead times that have passed, finished homeworks and homeworks without a deadline", () => {
    const soon = new Date(NOW + 3 * HOUR).toISOString();
    const reminders = planHomeworkReminders(
      deadlines([
        { deadlineAt: soon },
        { deadlineAt: new Date(NOW + 48 * HOUR).toISOString(), solvedCount: 4 },
        { deadlineAt: null },
        { deadlineAt: new Date(NOW - HOUR).toISOString() },
        { deadlineAt: "not a date" },
      ]),
      NOW,
      TEXTS,
      FORMATTERS,
    );
    assert.deepEqual(
      reminders.map((reminder) => reminder.id),
      ["hw_0:2h"],
    );
    assert.deepEqual(planHomeworkReminders(undefined, NOW, TEXTS, FORMATTERS), []);
  });

  it("announces the upcoming lesson 10 minutes ahead and at its start", () => {
    const lesson = (startsIn: number, groupName: string | null): GetLessonResponse => ({
      serverNow: new Date(NOW).toISOString(),
      limits: { maxPhotosPerSubmission: 3 },
      lessonCheckAvailable: true,
      active: null,
      upcoming: { lessonId: "les_1", title: "Занятие от 16 ноября", startsAt: new Date(NOW + startsIn).toISOString(), durationMinutes: 60, groupName },
    });
    const both = planLessonReminders(lesson(HOUR, "8А"), NOW, TEXTS);
    assert.deepEqual(
      both.map((reminder) => [reminder.id, reminder.title, reminder.fireAt - NOW]),
      [
        ["les_1:soon", "Урок через 10 минут", 50 * 60_000],
        ["les_1:start", "Урок начался", HOUR],
      ],
    );
    assert.equal(both[0]?.body, "Занятие от 16 ноября · 8А");
    assert.deepEqual(both[0]?.link, { screen: "student.lesson" });
    // Less than ten minutes left: only the start is announced.
    const late = planLessonReminders(lesson(5 * 60_000, null), NOW, TEXTS);
    assert.deepEqual(
      late.map((reminder) => reminder.id),
      ["les_1:start"],
    );
    assert.equal(late[0]?.body, "Занятие от 16 ноября");
    assert.deepEqual(planLessonReminders({ ...lesson(HOUR, null), upcoming: null }, NOW, TEXTS), []);
  });

  it("reminds a teacher at 10:00 Moscow time on the day a call becomes due", () => {
    const student = (id: string, state: "ok" | "due" | "overdue", daysUntilDue: number, hasReachedCall = true) => ({
      studentId: id,
      studentName: `Ученик ${id}`,
      teacherId: "t",
      teacherName: "Анна",
      reminder: { state, daysSinceAnchor: 30 - daysUntilDue, daysUntilDue, hasReachedCall },
    });
    const overview = {
      canRecord: true,
      students: [student("a", "ok", 3), student("b", "due", 0), student("c", "ok", 40), student("d", "ok", 1, false)],
      counts: { overdue: 0, due: 1, total: 4 },
    } as unknown as ParentCallsOverviewResponse;
    const reminders = planParentCallReminders(overview, NOW, TEXTS);
    assert.deepEqual(
      reminders.map((reminder) => reminder.id),
      ["a:due", "d:due"],
    );
    // 16 Nov 12:00 MSK + 3 days → 19 Nov 10:00 MSK = 07:00 UTC.
    assert.equal(new Date(reminders[0]!.fireAt).toISOString(), "2026-11-19T07:00:00.000Z");
    assert.equal(reminders[0]?.body, "Ученик a: последний звонок был 30 дн. назад.");
    assert.equal(reminders[1]?.body, "Ученик d: успешных звонков ещё не было.");
    assert.deepEqual(reminders[0]?.link, { screen: "calls.list", studentId: "a" });
    // A read-only viewer (developer) gets none.
    assert.deepEqual(planParentCallReminders({ ...overview, canRecord: false }, NOW, TEXTS), []);
  });

  it("computes Moscow clock times without the device time zone", () => {
    // 23:30 UTC on the 15th is already the 16th in Moscow.
    const lateEvening = Date.parse("2026-11-15T23:30:00.000Z");
    assert.equal(new Date(moscowHourAhead(lateEvening, 0, 10)).toISOString(), "2026-11-16T07:00:00.000Z");
    assert.equal(new Date(moscowHourAhead(lateEvening, 1, 10)).toISOString(), "2026-11-17T07:00:00.000Z");
  });

  const reminder = (id: string, fireAt: number, category: LocalReminder["category"] = "homeworkDeadlines"): LocalReminder => ({
    id,
    category,
    fireAt,
    title: "t",
    body: "b",
    link: { screen: "student.lesson" },
  });

  it("keeps only enabled categories, soonest first, within the device budget", () => {
    const all = [reminder("b", 200), reminder("a", 100), reminder("c", 50, "lessonStart"), reminder("d", 10, "parentCalls")];
    const enabled = { homeworkDeadlines: true, lessonStart: true, parentCalls: false };
    assert.deepEqual(
      selectReminders(all, enabled).map((item) => item.id),
      ["c", "a", "b"],
    );
    assert.deepEqual(
      selectReminders(all, enabled, 1).map((item) => item.id),
      ["c"],
    );
    const many = Array.from({ length: 80 }, (_, index) => reminder(`r${index}`, index));
    assert.equal(selectReminders(many, enabled).length, MAX_SCHEDULED_REMINDERS);
  });

  it("cancels what is no longer wanted, schedules what is missing and leaves foreign notifications alone", () => {
    const keep = reminder("keep", 100);
    const moved = reminder("moved", 200);
    const fresh = reminder("fresh", 300);
    const scheduled = [reminderIdentifier(keep), reminderIdentifier({ ...moved, fireAt: 150 }), "someone-else:1"];
    const plan = diffReminders(scheduled, [keep, moved, fresh]);
    assert.deepEqual(plan.cancel, [reminderIdentifier({ ...moved, fireAt: 150 })]);
    assert.deepEqual(
      plan.schedule.map((item) => item.id),
      ["moved", "fresh"],
    );
    assert.ok(reminderIdentifier(keep).startsWith(`${REMINDER_ID_PREFIX}:`));
    // A language switch changes the text, hence the identifier: the old notification is replaced.
    assert.notEqual(reminderIdentifier(keep), reminderIdentifier({ ...keep, title: "other" }));
    assert.deepEqual(diffReminders(scheduled, []), { cancel: scheduled.slice(0, 2), schedule: [] });
  });
});

// ───────────────────────────── biometric lock ─────────────────────────────

describe("biometric lock policy", () => {
  const on = { enabled: true, available: true, signedIn: true };

  it("locks a restored session only when the lock is on and usable", () => {
    assert.equal(shouldLockOnLaunch(on), true);
    assert.equal(shouldLockOnLaunch({ ...on, enabled: false }), false);
    // Nothing enrolled any more: the switch is ignored rather than locking the user out.
    assert.equal(shouldLockOnLaunch({ ...on, available: false }), false);
    assert.equal(isLockActive({ ...on, signedIn: false }), false);
  });

  it("locks again only after the grace period in the background", () => {
    const left = 1_000_000;
    assert.equal(shouldLockOnResume(on, left, left + BIOMETRIC_GRACE_MS - 1), false);
    assert.equal(shouldLockOnResume(on, left, left + BIOMETRIC_GRACE_MS), true);
    assert.equal(shouldLockOnResume(on, null, left), false);
    assert.equal(shouldLockOnResume({ ...on, enabled: false }, left, left + 10 * BIOMETRIC_GRACE_MS), false);
    // A clock that went backwards must not keep the app open.
    assert.equal(shouldLockOnResume(on, left, left - 5000), true);
  });
});

// ───────────────────────────── cached user ─────────────────────────────

describe("cached session user", () => {
  it("accepts only a complete, well-typed snapshot", () => {
    const user = { id: "usr_ilya", name: "Илья Смирнов", email: "ilya@example.com", role: "STUDENT", createdAt: "2026-09-01T00:00:00.000Z" };
    assert.deepEqual(parseCachedUser(JSON.stringify(user)), user);
    assert.deepEqual(parseCachedUser(JSON.stringify({ ...user, extra: 1 })), user);
    assert.equal(parseCachedUser(JSON.stringify({ ...user, role: "ADMIN" })), null);
    assert.equal(parseCachedUser(JSON.stringify({ ...user, id: "" })), null);
    assert.equal(parseCachedUser(JSON.stringify({ ...user, createdAt: 5 })), null);
    assert.equal(parseCachedUser("nope"), null);
    assert.equal(parseCachedUser(null), null);
    assert.equal(parseCachedUser("[]"), null);
  });
});
