// Mock backend, member `groups` — part 2: parent calls (docs/spec/06-teacher-groups-calls-stats.md §1.4,
// §3.9 – §3.11, §4.4; 00 §2.11; 90-addendum-1 A.10; 90-addendum-2 B.2).
// Node's test runner and assert are typed by referencing only their declaration files: the project does not
// load `@types/node` globally (it would change DOM / React Native globals such as the timer return types).
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError } from "../src/api/errors";
import type { AnyApiErrorCode } from "../src/api/errors";
import type { ParentCallOutcome, RealtimeEvent } from "../src/api/types";
import { DAY_MS, HOUR_MS } from "../src/domain/moscow-time";
import { TEST_T0, createTestMock, type TestMock } from "../src/mock/testing";

const T0 = Date.parse(TEST_T0);
const iso = (ms: number) => new Date(ms).toISOString();

/** Awaits a rejection and returns the `ApiError`, asserting its code and status. */
async function rejects(promise: Promise<unknown>, code: AnyApiErrorCode, status: number): Promise<ApiError> {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof ApiError, `expected ApiError, got ${String(error)}`);
    assert.equal(error.code, code);
    assert.equal(error.status, status);
    return error;
  }
  throw new assert.AssertionError({ message: `expected a rejection with "${code}"` });
}

/** Lets queued microtasks (realtime delivery, saves) run. */
async function settle(): Promise<void> {
  for (let index = 0; index < 5; index += 1) await Promise.resolve();
}

async function asUser(login: string): Promise<TestMock> {
  const mock = createTestMock();
  await mock.signIn(login);
  return mock;
}

async function switchTo(mock: TestMock, login: string): Promise<void> {
  mock.signOut();
  await mock.signIn(login);
}

const ANNA = "teacher@example.com";

/** Reminders of a teacher about one student, oldest first. */
function remindersAbout(mock: TestMock, studentId: string) {
  return mock.store.notifications
    .by("userId", "usr_anna")
    .filter((row) => row.type === "parent_call_due" && row.href === `/teacher/calls?studentId=${studentId}`)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

let callSeq = 0;
/** A journal row placed straight into the store (the API cannot back-date a call). */
function addCall(mock: TestMock, studentId: string, outcome: ParentCallOutcome, at: number, comment: string | null = null): string {
  callSeq += 1;
  const id = `call_test_${callSeq}`;
  mock.store.parentCalls.insert({ id, studentId, teacherId: "usr_anna", outcome, comment, calledAt: iso(at), createdAt: iso(at) });
  return id;
}

describe("parent calls: overview", () => {
  it("lists a teacher's students in every reminder state, most urgent first", async () => {
    const mock = await asUser(ANNA);
    const overview = await mock.api.groups.getParentCallsOverview();
    assert.equal(overview.canRecord, true);
    assert.deepEqual(overview.counts, { overdue: 1, due: 2, total: 7 });
    assert.deepEqual(overview.students.map((row) => [row.studentName, row.reminder.state, row.reminder.daysSinceAnchor, row.reminder.daysUntilDue, row.reminder.hasReachedCall]), [
      ["Кирилл Зайцев", "overdue", 50, 0, true],
      ["Артём Кузнецов", "due", 35, 0, false],
      // Exactly at the boundary: 30 days after the last successful call.
      ["Мария Волкова", "due", 30, 0, true],
      // One day before it is time to call.
      ["Илья Смирнов", "ok", 29, 1, true],
      ["Полина Морозова", "ok", 10, 20, true],
      // New students without calls: the countdown starts at the creation of the account.
      ["Даша Белова", "ok", 5, 25, false],
      ["Тимур Новиков", "ok", 0, 30, false],
    ]);

    const [kirill, artem, maria, , polina] = overview.students;
    // An unanswered attempt after the last successful call is shown, and does not move the anchor.
    assert.deepEqual([kirill!.attemptAfterLastReached, kirill!.attemptDaysAgo, kirill!.totalCalls], [true, 3, 2]);
    assert.deepEqual(kirill!.history.map((call) => [call.outcome, call.comment, call.teacherName]), [
      ["NO_ANSWER", null, "Анна Петрова"],
      ["REACHED", "Мама просит присылать ДЗ в мессенджер.", "Анна Петрова"],
    ]);
    assert.equal(kirill!.lastReachedAt, kirill!.history[1]!.calledAt);
    assert.deepEqual([kirill!.teacherId, kirill!.teacherName, kirill!.studentCreatedAt], ["usr_anna", "Анна Петрова", mock.store.users.get("usr_kirill")!.createdAt]);

    assert.deepEqual([artem!.lastReachedAt, artem!.attemptAfterLastReached, artem!.attemptDaysAgo, artem!.totalCalls, artem!.history], [null, false, null, 0, []]);
    assert.deepEqual([maria!.totalCalls, maria!.history[0]!.comment, maria!.attemptAfterLastReached], [1, null, false]);

    // The button counts the whole journal, the overview carries the 20 newest entries.
    assert.deepEqual([polina!.totalCalls, polina!.history.length], [23, 20]);
    const times = polina!.history.map((call) => call.calledAt);
    assert.deepEqual(times, [...times].sort().reverse());
    assert.equal(polina!.history[0]!.calledAt, polina!.lastReachedAt);
    assert.deepEqual(Object.keys(polina!.history[0]!).sort(), ["calledAt", "comment", "id", "outcome", "teacherName"]);
  });

  it("creates the teacher's lazy reminders on entering the section, without duplicates and without comments", async () => {
    const mock = await asUser(ANNA);
    assert.equal(remindersAbout(mock, "usr_maria").length, 0);
    await mock.api.groups.getParentCallsOverview();

    const created = remindersAbout(mock, "usr_maria");
    assert.equal(created.length, 1);
    assert.deepEqual([created[0]!.params, created[0]!.readAt, created[0]!.createdAt], [{ state: "due", name: "Мария Волкова", days: 30, hasReachedCall: true }, null, TEST_T0]);
    // Артём and Кирилл were reminded already during this period.
    assert.deepEqual([remindersAbout(mock, "usr_artem").length, remindersAbout(mock, "usr_kirill").length], [1, 2]);

    mock.clock.advance(5 * 60_000);
    await mock.api.groups.getParentCallsOverview();
    assert.equal(mock.store.notifications.by("userId", "usr_anna").length, 4);

    const comments = mock.store.parentCalls.filter((call) => call.comment !== null).map((call) => call.comment!);
    const notifications = JSON.stringify(mock.store.notifications.all());
    for (const comment of comments) assert.equal(notifications.includes(comment), false);
  });

  it("shows a developer every student read-only, with the owning teacher", async () => {
    const mock = await asUser("dev@example.com");
    const before = mock.store.notifications.size;
    const overview = await mock.api.groups.getParentCallsOverview();
    assert.equal(overview.canRecord, false);
    assert.deepEqual(overview.counts, { overdue: 1, due: 3, total: 10 });
    assert.deepEqual(overview.students.map((row) => [row.studentName, row.teacherName, row.reminder.state]), [
      ["Кирилл Зайцев", "Анна Петрова", "overdue"],
      ["Софья Орлова", "Игорь Соколов", "due"],
      ["Артём Кузнецов", "Анна Петрова", "due"],
      ["Мария Волкова", "Анна Петрова", "due"],
      ["Илья Смирнов", "Анна Петрова", "ok"],
      ["Лев Без-Учителя", null, "ok"],
      ["Егор Лебедев", "Игорь Соколов", "ok"],
      ["Полина Морозова", "Анна Петрова", "ok"],
      ["Даша Белова", "Анна Петрова", "ok"],
      ["Тимур Новиков", "Анна Петрова", "ok"],
    ]);
    assert.equal(overview.students.find((row) => row.studentId === "usr_orphan")!.teacherId, null);
    // A developer reads the comments too.
    assert.equal(overview.students[0]!.history[1]!.comment, "Мама просит присылать ДЗ в мессенджер.");
    // Reminders are generated for teachers only.
    assert.equal(mock.store.notifications.size, before);
  });

  it("keeps the name order inside equal rows and answers an empty teacher with nothing", async () => {
    const mock = await asUser(ANNA);
    // Two more students created together with Тимур: same state, same number of days.
    const createdAt = mock.store.users.get("usr_timur")!.createdAt;
    for (const [id, name] of [["usr_t_y", "Яна Новая"], ["usr_t_b", "Борис Новый"]] as const) {
      mock.store.users.insert({ id, name, email: `${id}@example.com`, role: "STUDENT", teacherId: "usr_anna", createdAt, updatedAt: createdAt, password: "student123" });
    }
    const names = (await mock.api.groups.getParentCallsOverview()).students.map((row) => row.studentName);
    assert.deepEqual(names.slice(-3), ["Борис Новый", "Тимур Новиков", "Яна Новая"]);

    await switchTo(mock, "teacher3@example.com");
    assert.deepEqual(await mock.api.groups.getParentCallsOverview(), { canRecord: true, students: [], counts: { overdue: 0, due: 0, total: 0 } });
    assert.deepEqual(await mock.api.groups.getParentCallCounts(), { due: 0, overdue: 0 });
  });

  it("finds the last successful call even when it is older than the 20 newest entries", async () => {
    const mock = await asUser(ANNA);
    // Даша: one successful call 40 days ago, then 21 unanswered attempts.
    const reached = T0 - 40 * DAY_MS;
    addCall(mock, "usr_dasha", "REACHED", reached, "Договорились о времени занятий.");
    for (let index = 0; index < 21; index += 1) addCall(mock, "usr_dasha", "NO_ANSWER", T0 - (21 - index) * DAY_MS);

    const dasha = (await mock.api.groups.getParentCallsOverview()).students.find((row) => row.studentId === "usr_dasha")!;
    assert.deepEqual([dasha.totalCalls, dasha.history.length, dasha.history.every((call) => call.outcome === "NO_ANSWER")], [22, 20, true]);
    assert.equal(dasha.lastReachedAt, iso(reached));
    assert.deepEqual(dasha.reminder, { state: "due", daysSinceAnchor: 40, daysUntilDue: 0, hasReachedCall: true });
    assert.deepEqual([dasha.attemptAfterLastReached, dasha.attemptDaysAgo], [true, 1]);
  });

  it("moves between the states at 30 and 45 calendar days, Moscow time", async () => {
    const mock = await asUser(ANNA);
    const state = async () => (await mock.api.groups.getParentCallsOverview()).students.find((row) => row.studentId === "usr_ilya")!.reminder;
    // Илья: last successful call 29 days ago at 18:15 Moscow; T0 is 12:00 Moscow.
    assert.deepEqual(await state(), { state: "ok", daysSinceAnchor: 29, daysUntilDue: 1, hasReachedCall: true });
    // 23:59 the same Moscow day: still 29.
    mock.clock.advance(12 * HOUR_MS - 60_000);
    assert.equal((await state()).daysSinceAnchor, 29);
    // Midnight: day 30, although fewer than 30 × 24 h have passed.
    mock.clock.advance(60_000);
    assert.deepEqual(await state(), { state: "due", daysSinceAnchor: 30, daysUntilDue: 0, hasReachedCall: true });
    mock.clock.advance(14 * DAY_MS);
    assert.deepEqual([(await state()).state, (await state()).daysSinceAnchor], ["due", 44]);
    mock.clock.advance(DAY_MS);
    assert.deepEqual([(await state()).state, (await state()).daysSinceAnchor], ["overdue", 45]);
  });

  it("counts due and overdue students for the overview widget, numbers only", async () => {
    const mock = await asUser(ANNA);
    const counts = await mock.api.groups.getParentCallCounts();
    assert.deepEqual(counts, { due: 2, overdue: 1 });
    assert.deepEqual(Object.keys(counts).sort(), ["due", "overdue"]);
    // The widget read does not generate reminders.
    assert.equal(remindersAbout(mock, "usr_maria").length, 0);

    await switchTo(mock, "dev@example.com");
    assert.deepEqual(await mock.api.groups.getParentCallCounts(), { due: 3, overdue: 1 });
  });

  it("refuses a student and a missing session everywhere", async () => {
    const mock = createTestMock();
    await rejects(mock.api.groups.getParentCallsOverview(), "sessionExpired", 401);
    await rejects(mock.api.groups.recordParentCall({ studentId: "usr_kirill", outcome: "REACHED" }), "sessionExpired", 401);
    await mock.signIn("kirill@example.com");
    await rejects(mock.api.groups.getParentCallsOverview(), "unauthorized", 403);
    await rejects(mock.api.groups.getParentCallCounts(), "unauthorized", 403);
    await rejects(mock.api.groups.getParentCallHistory("usr_kirill"), "unauthorized", 403);
    await rejects(mock.api.groups.recordParentCall({ studentId: "usr_kirill", outcome: "REACHED" }), "unauthorized", 403);
    assert.equal(mock.store.parentCalls.by("studentId", "usr_kirill").length, 2);
  });
});

describe("parent calls: full history", () => {
  it("returns the whole journal of a student, newest first, with who called", async () => {
    const mock = await asUser(ANNA);
    const history = await mock.api.groups.getParentCallHistory("usr_polina");
    assert.deepEqual([history.studentId, history.calls.length, history.hasMore], ["usr_polina", 23, false]);
    assert.deepEqual(history.calls.map((call) => call.id), Array.from({ length: 23 }, (_, index) => `call_polina_${23 - index}`));
    // The oldest call was made by a teacher who does not exist any more.
    assert.equal(history.calls[22]!.teacherName, null);
    assert.equal(history.calls[0]!.teacherName, "Анна Петрова");
    const stored = mock.store.parentCalls.get("call_polina_23")!;
    assert.deepEqual(history.calls[0], { id: stored.id, outcome: stored.outcome, comment: stored.comment, calledAt: stored.calledAt, teacherName: "Анна Петрова" });

    assert.deepEqual(await mock.api.groups.getParentCallHistory("usr_timur"), { studentId: "usr_timur", calls: [], hasMore: false });
  });

  it("pages with limit and before", async () => {
    const mock = await asUser(ANNA);
    const all = (await mock.api.groups.getParentCallHistory("usr_polina")).calls.map((call) => call.id);

    const first = await mock.api.groups.getParentCallHistory("usr_polina", { limit: 10 });
    assert.deepEqual([first.calls.length, first.hasMore], [10, true]);
    const second = await mock.api.groups.getParentCallHistory("usr_polina", { limit: 10, before: first.calls[9]!.id });
    assert.deepEqual([second.calls.length, second.hasMore], [10, true]);
    const third = await mock.api.groups.getParentCallHistory("usr_polina", { limit: 10, before: second.calls[9]!.id });
    assert.deepEqual([third.calls.length, third.hasMore], [3, false]);
    assert.deepEqual([...first.calls, ...second.calls, ...third.calls].map((call) => call.id), all);

    // Boundaries of a page.
    assert.equal((await mock.api.groups.getParentCallHistory("usr_polina", { limit: 23 })).hasMore, false);
    assert.equal((await mock.api.groups.getParentCallHistory("usr_polina", { limit: 22 })).hasMore, true);
    assert.deepEqual(await mock.api.groups.getParentCallHistory("usr_polina", { before: all[22]! }), { studentId: "usr_polina", calls: [], hasMore: false });
    // A limit below 1 is one entry; a non-number is the default.
    assert.equal((await mock.api.groups.getParentCallHistory("usr_polina", { limit: 0 })).calls.length, 1);
    assert.equal((await mock.api.groups.getParentCallHistory("usr_polina", { limit: "many" as never })).calls.length, 23);
  });

  it("returns at most 100 entries per page", async () => {
    const mock = await asUser(ANNA);
    for (let index = 0; index < 80; index += 1) addCall(mock, "usr_polina", "NO_ANSWER", T0 - 400 * DAY_MS - index * HOUR_MS);
    const page = await mock.api.groups.getParentCallHistory("usr_polina");
    assert.deepEqual([page.calls.length, page.hasMore], [100, true]);
    assert.equal((await mock.api.groups.getParentCallHistory("usr_polina", { limit: 1000 })).calls.length, 100);
    const rest = await mock.api.groups.getParentCallHistory("usr_polina", { before: page.calls[99]!.id });
    assert.deepEqual([rest.calls.length, rest.hasMore], [3, false]);
  });

  it("rejects a cursor that is not a call of this student, a blank id and a foreign student", async () => {
    const mock = await asUser(ANNA);
    await rejects(mock.api.groups.getParentCallHistory("usr_polina", { before: "call_nope" }), "invalidData", 400);
    await rejects(mock.api.groups.getParentCallHistory("usr_polina", { before: "call_kirill_1" }), "invalidData", 400);
    assert.equal((await rejects(mock.api.groups.getParentCallHistory("  "), "studentRequired", 400)).message, "Укажите ученика.");

    // A teacher must not learn whether a foreign student exists.
    const foreign = await rejects(mock.api.groups.getParentCallHistory("usr_egor"), "studentNotFound", 404);
    const missing = await rejects(mock.api.groups.getParentCallHistory("usr_nobody"), "studentNotFound", 404);
    assert.deepEqual([foreign.message, missing.message], ["Ученик не найден.", "Ученик не найден."]);
    await rejects(mock.api.groups.getParentCallHistory("usr_orphan"), "studentNotFound", 404);
    await rejects(mock.api.groups.getParentCallHistory("usr_igor"), "studentNotFound", 404);

    await switchTo(mock, "teacher2@example.com");
    await rejects(mock.api.groups.getParentCallHistory("usr_kirill"), "studentNotFound", 404);
    assert.equal((await mock.api.groups.getParentCallHistory("usr_egor")).calls[0]!.comment, "Всё по плану.");

    await switchTo(mock, "dev@example.com");
    assert.equal((await mock.api.groups.getParentCallHistory("usr_egor")).calls.length, 1);
    assert.equal((await mock.api.groups.getParentCallHistory("usr_kirill")).calls[1]!.comment, "Мама просит присылать ДЗ в мессенджер.");
  });
});

describe("parent calls: recording", () => {
  it("records a successful call: the countdown restarts and the reminders about the student are read", async () => {
    const mock = await asUser(ANNA);
    await mock.api.groups.getParentCallsOverview();
    mock.clock.advance(90_000);
    const unreadBefore = remindersAbout(mock, "usr_kirill").filter((row) => row.readAt === null).length;
    assert.equal(unreadBefore, 1);

    const result = await mock.api.groups.recordParentCall({ studentId: "usr_kirill", outcome: "REACHED", comment: "Обсудили пропуски." });
    assert.deepEqual(result.call, { id: result.call.id, outcome: "REACHED", comment: "Обсудили пропуски.", calledAt: iso(T0 + 90_000), teacherName: "Анна Петрова" });
    assert.deepEqual(result.reminder, { state: "ok", daysSinceAnchor: 0, daysUntilDue: 30, hasReachedCall: true });
    assert.deepEqual(mock.store.parentCalls.get(result.call.id), {
      id: result.call.id,
      studentId: "usr_kirill",
      teacherId: "usr_anna",
      outcome: "REACHED",
      comment: "Обсудили пропуски.",
      calledAt: iso(T0 + 90_000),
      createdAt: iso(T0 + 90_000),
    });

    // Every reminder about Кирилл is read now; the ones about other students are untouched.
    assert.equal(remindersAbout(mock, "usr_kirill").every((row) => row.readAt !== null), true);
    assert.equal(remindersAbout(mock, "usr_kirill")[1]!.readAt, iso(T0 + 90_000));
    assert.equal(remindersAbout(mock, "usr_artem")[0]!.readAt, null);
    assert.equal(remindersAbout(mock, "usr_maria")[0]!.readAt, null);

    const overview = await mock.api.groups.getParentCallsOverview();
    assert.deepEqual(overview.counts, { overdue: 0, due: 2, total: 7 });
    const kirill = overview.students.find((row) => row.studentId === "usr_kirill")!;
    assert.deepEqual([kirill.reminder.state, kirill.lastReachedAt, kirill.attemptAfterLastReached, kirill.attemptDaysAgo, kirill.totalCalls, kirill.history[0]!.id], ["ok", iso(T0 + 90_000), false, null, 3, result.call.id]);
    // He moved to the end of the list together with the other fresh rows.
    assert.equal(overview.students[0]!.studentId, "usr_artem");
    assert.deepEqual(await mock.api.groups.getParentCallCounts(), { due: 2, overdue: 0 });
    // No new reminder appears for him in the new period.
    mock.clock.advance(5 * 60_000);
    await mock.api.groups.getParentCallsOverview();
    assert.equal(remindersAbout(mock, "usr_kirill").length, 2);
  });

  it("keeps the countdown and the reminders after an unanswered attempt", async () => {
    const mock = await asUser(ANNA);
    const result = await mock.api.groups.recordParentCall({ studentId: "usr_artem", outcome: "NO_ANSWER" });
    assert.deepEqual([result.call.outcome, result.call.comment], ["NO_ANSWER", null]);
    assert.deepEqual(result.reminder, { state: "due", daysSinceAnchor: 35, daysUntilDue: 0, hasReachedCall: false });
    assert.equal(remindersAbout(mock, "usr_artem")[0]!.readAt, null);

    const artem = (await mock.api.groups.getParentCallsOverview()).students.find((row) => row.studentId === "usr_artem")!;
    assert.deepEqual([artem.lastReachedAt, artem.attemptAfterLastReached, artem.attemptDaysAgo, artem.totalCalls], [null, true, 0, 1]);
    mock.clock.advance(DAY_MS);
    assert.equal((await mock.api.groups.getParentCallsOverview()).students.find((row) => row.studentId === "usr_artem")!.attemptDaysAgo, 1);
  });

  it("normalises the comment, cuts it at 4000 characters and stores an empty one as null", async () => {
    const mock = await asUser(ANNA);
    const record = (comment?: string) => mock.api.groups.recordParentCall({ studentId: " usr_dasha ", outcome: "NO_ANSWER", ...(comment === undefined ? {} : { comment }) });

    assert.equal((await record("  Первая строка   \r\nвторая\u0007 строка\t \r\n\r\nтретья  ")).call.comment, "Первая строка\nвторая строка\n\nтретья");
    assert.equal((await record("   \n \t ")).call.comment, null);
    assert.equal((await record()).call.comment, null);

    const exact = "к".repeat(4000);
    assert.equal((await record(exact)).call.comment, exact);
    assert.equal((await record(`${exact}!`)).call.comment, exact);
    assert.equal(mock.store.parentCalls.by("studentId", "usr_dasha").length, 5);
  });

  it("validates the student and the outcome before looking the student up", async () => {
    const mock = await asUser(ANNA);
    const size = mock.store.parentCalls.size;
    assert.equal((await rejects(mock.api.groups.recordParentCall({ studentId: "  ", outcome: "REACHED" }), "studentRequired", 400)).message, "Укажите ученика.");
    // The student is checked first.
    await rejects(mock.api.groups.recordParentCall({ studentId: "", outcome: "LATER" as never }), "studentRequired", 400);
    await rejects(mock.api.groups.recordParentCall({} as never), "studentRequired", 400);

    for (const outcome of ["reached", "", "CALLED", undefined, null]) {
      const error = await rejects(mock.api.groups.recordParentCall({ studentId: "usr_kirill", outcome: outcome as never }), "outcomeRequired", 400);
      assert.equal(error.message, "Укажите исход звонка.");
    }
    // A foreign student with a bad outcome is still a 400: nothing about the student leaks.
    await rejects(mock.api.groups.recordParentCall({ studentId: "usr_egor", outcome: "x" as never }), "outcomeRequired", 400);

    mock.setLocale("en");
    assert.equal((await rejects(mock.api.groups.recordParentCall({ studentId: "", outcome: "REACHED" }), "studentRequired", 400)).message, "Specify a student.");
    assert.equal((await rejects(mock.api.groups.recordParentCall({ studentId: "usr_kirill", outcome: "?" as never }), "outcomeRequired", 400)).message, "Specify the call outcome.");
    assert.equal(mock.store.parentCalls.size, size);
  });

  it("answers 404 for a foreign student and 403 for a developer, who is read-only", async () => {
    const mock = await asUser(ANNA);
    const size = mock.store.parentCalls.size;
    assert.equal((await rejects(mock.api.groups.recordParentCall({ studentId: "usr_egor", outcome: "REACHED" }), "studentNotFound", 404)).message, "Ученик не найден.");
    await rejects(mock.api.groups.recordParentCall({ studentId: "usr_orphan", outcome: "REACHED" }), "studentNotFound", 404);
    await rejects(mock.api.groups.recordParentCall({ studentId: "usr_nobody", outcome: "REACHED" }), "studentNotFound", 404);
    await rejects(mock.api.groups.recordParentCall({ studentId: "usr_igor", outcome: "REACHED" }), "studentNotFound", 404);

    await switchTo(mock, "dev@example.com");
    const error = await rejects(mock.api.groups.recordParentCall({ studentId: "usr_kirill", outcome: "REACHED" }), "unauthorized", 403);
    assert.equal(error.message, "Нет доступа.");
    assert.equal(mock.store.parentCalls.size, size);
    // The refusal comes before the rate limit: no bucket is touched for the developer.
    assert.equal(mock.api.controls.listLimiters().some((bucket) => bucket.scope === "api:parent-calls" && bucket.identifier === "usr_dev"), false);
  });

  it("allows 60 saves a minute; refused and invalid requests use the same bucket", async () => {
    const mock = await asUser(ANNA);
    mock.clock.advance(20_000);
    // Invalid requests consume the limit too: it is checked first.
    await rejects(mock.api.groups.recordParentCall({ studentId: "", outcome: "REACHED" }), "studentRequired", 400);
    await rejects(mock.api.groups.recordParentCall({ studentId: "usr_egor", outcome: "REACHED" }), "studentNotFound", 404);
    for (let call = 0; call < 58; call += 1) await mock.api.groups.recordParentCall({ studentId: "usr_timur", outcome: "NO_ANSWER" });

    const error = await rejects(mock.api.groups.recordParentCall({ studentId: "usr_timur", outcome: "REACHED" }), "rateLimited", 429);
    assert.deepEqual([error.retryAfterSeconds, error.message], [40, "Слишком много запросов. Подождите немного и попробуйте снова."]);
    // Nothing is stored by a refused call, and the reads are not limited.
    assert.equal(mock.store.parentCalls.by("studentId", "usr_timur").length, 58);
    assert.equal((await mock.api.groups.getParentCallHistory("usr_timur")).calls.length, 58);

    mock.clock.advance(40_000);
    assert.equal((await mock.api.groups.recordParentCall({ studentId: "usr_timur", outcome: "REACHED" })).reminder.hasReachedCall, true);
  });

  it("keeps two calls saved in the same instant in the order they were made", async () => {
    const mock = await asUser(ANNA);
    const first = await mock.api.groups.recordParentCall({ studentId: "usr_timur", outcome: "NO_ANSWER", comment: "первый" });
    const second = await mock.api.groups.recordParentCall({ studentId: "usr_timur", outcome: "REACHED", comment: "второй" });
    assert.equal(first.call.calledAt, second.call.calledAt);
    assert.notEqual(first.call.id, second.call.id);
    assert.deepEqual((await mock.api.groups.getParentCallHistory("usr_timur")).calls.map((call) => call.comment), ["второй", "первый"]);
    const timur = (await mock.api.groups.getParentCallsOverview()).students.find((row) => row.studentId === "usr_timur")!;
    // The newest entry is the successful call, so there is no "attempt after it".
    assert.deepEqual([timur.attemptAfterLastReached, timur.history[0]!.comment], [false, "второй"]);
  });
});

describe("parent calls: privacy", () => {
  it("never lets a comment into notifications, the journal, realtime, counters or statistics", async () => {
    const SECRET = "СЕКРЕТ-о-семье-4711";
    const mock = await asUser(ANNA);
    const events: RealtimeEvent[] = [];
    const unsubscribe = mock.api.shell.subscribeRealtime((event) => events.push(event));
    await settle();
    const journalBefore = mock.store.auditLogs.size;

    await mock.api.groups.getParentCallsOverview();
    await mock.api.groups.recordParentCall({ studentId: "usr_maria", outcome: "REACHED", comment: SECRET });
    await mock.api.groups.recordParentCall({ studentId: "usr_artem", outcome: "NO_ANSWER", comment: SECRET });
    await settle();

    // Recording a call publishes no realtime event and writes no journal row.
    assert.deepEqual(events, []);
    assert.equal(mock.store.auditLogs.size, journalBefore);
    assert.equal(JSON.stringify(mock.store.auditLogs.all()).includes(SECRET), false);
    assert.equal(JSON.stringify(mock.store.notifications.all()).includes(SECRET), false);
    assert.equal(JSON.stringify(await mock.api.shell.listNotifications()).includes(SECRET), false);
    assert.equal(JSON.stringify(await mock.api.groups.getParentCallCounts()).includes(SECRET), false);
    unsubscribe();

    // Only the owning teacher and the developer receive it.
    assert.equal(JSON.stringify(await mock.api.groups.getParentCallsOverview()).includes(SECRET), true);
    await switchTo(mock, "teacher2@example.com");
    assert.equal(JSON.stringify(await mock.api.groups.getParentCallsOverview()).includes(SECRET), false);
    await rejects(mock.api.groups.getParentCallHistory("usr_maria"), "studentNotFound", 404);

    await switchTo(mock, "dev@example.com");
    assert.equal((await mock.api.groups.getParentCallHistory("usr_maria")).calls[0]!.comment, SECRET);
    // The statistics show counts only.
    assert.equal(JSON.stringify(await mock.api.groups.getStatisticsTeachers()).includes(SECRET), false);
    assert.equal(JSON.stringify(await mock.api.groups.getStatisticsPlatform()).includes(SECRET), false);
    assert.equal(JSON.stringify(await mock.api.shell.listNotifications()).includes(SECRET), false);

    // The student the call was about has no way to read it.
    await switchTo(mock, "maria@example.com");
    await rejects(mock.api.groups.getParentCallHistory("usr_maria"), "unauthorized", 403);
    assert.equal(JSON.stringify(await mock.api.shell.listNotifications()).includes(SECRET), false);
  });

  it("fails on demand without storing anything", async () => {
    const mock = await asUser(ANNA);
    const size = mock.store.parentCalls.size;
    mock.api.controls.set("forceNextError", { method: "groups.recordParentCall", error: "notFound", times: 1 });
    await rejects(mock.api.groups.recordParentCall({ studentId: "usr_kirill", outcome: "REACHED", comment: "не сохранится" }), "studentNotFound", 404);
    mock.api.controls.set("forceNextError", { method: "groups.getParentCallHistory", error: "notFound", times: 1 });
    await rejects(mock.api.groups.getParentCallHistory("usr_kirill"), "studentNotFound", 404);
    mock.api.controls.set("forceNextError", { method: "groups.getParentCallsOverview", error: "rateLimited", times: 1 });
    assert.equal((await rejects(mock.api.groups.getParentCallsOverview(), "rateLimited", 429)).retryAfterSeconds, 30);
    assert.equal(mock.store.parentCalls.size, size);
    assert.equal(remindersAbout(mock, "usr_maria").length, 0);
  });
});
