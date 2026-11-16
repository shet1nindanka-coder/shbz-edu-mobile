// `teacherStudents` member of the mock backend, part 2: issuing and cancelling a homework, number statuses
// (single and batch), per-number deadlines and the progress history (docs/spec/04-teacher-students.md §3.4 –
// §3.8, §3.16, §4.1 – §4.5; 00 §2.8; 90-addendum-2 A.2.8, A.2.19; 90-addendum-6 §6.1).
//
// Node's test runner and assert are typed by referencing only their declaration files: the project does not
// load `@types/node` globally (it would change DOM / React Native globals such as the timer return types).
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError } from "../src/api/errors";
import type { AnyApiErrorCode } from "../src/api/errors";
import type { HomeworkNumberStatus, IssueHomeworkRequest, RealtimeEvent, SetDeadlinesRequest } from "../src/api/types";
import { DAY_MS, MINUTE_MS } from "../src/domain/moscow-time";
import { getDictionary } from "../src/i18n/get-dictionary";
import { format } from "../src/lib/i18n/format";
import { MOCK_COVERAGE } from "../src/mock/fixtures/coverage";
import { TEST_T0, createTestMock, type TestMock } from "../src/mock/testing";

const T0 = Date.parse(TEST_T0);
const ru = getDictionary("ru");
const en = getDictionary("en");

const ANNA = "teacher@example.com";
const IGOR = "teacher2@example.com";
const DEV = "dev@example.com";

const iso = (ms: number) => new Date(ms).toISOString();
const IN_THREE_DAYS = iso(T0 + 3 * DAY_MS);

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

/** Lets queued microtasks (realtime delivery) run. */
async function settle(turns = 20): Promise<void> {
  for (let index = 0; index < turns; index += 1) await Promise.resolve();
}

/** Subscribes to the realtime stream of the signed-in user and collects what is delivered (without the timestamp). */
async function listen(mock: TestMock): Promise<{ events: RealtimeEvent[]; seen: () => Record<string, unknown>[] }> {
  const events: RealtimeEvent[] = [];
  mock.api.shell.subscribeRealtime((event) => events.push(event));
  await settle();
  return {
    events,
    seen: () =>
      events.map((event) => {
        const { occurredAt, ...rest } = event;
        assert.equal(typeof occurredAt, "string");
        return rest;
      }),
  };
}

const coverage = (key: string) => {
  const row = MOCK_COVERAGE.find((entry) => entry.key === key);
  assert.ok(row, `coverage row "${key}"`);
  return row;
};

const statusOf = (mock: TestMock, studentId: string, label: string) => mock.store.statuses.findUnique("studentNumber", `${studentId}|num_${label}`);
const eventsOf = (mock: TestMock, studentId: string, label: string) => mock.store.progressEvents.by("studentNumber", `${studentId}|num_${label}`);
const ids = (...labels: string[]) => labels.map((label) => `num_${label}`);

/** Row counts that must not move when a request is refused. */
const snapshot = (mock: TestMock) => ({
  homeworks: mock.store.homeworks.size,
  links: mock.store.homeworkNumbers.size,
  statuses: mock.store.statuses.size,
  events: mock.store.progressEvents.size,
  notifications: mock.store.notifications.size,
  audits: mock.store.auditLogs.size,
});

const issue = (mock: TestMock, input: Partial<IssueHomeworkRequest>) =>
  mock.api.teacherStudents.issueHomework({ studentId: "usr_ilya", topicId: "top_linear", homeworkNumberIds: [], deadlineAt: IN_THREE_DAYS, ...input });

describe("teacherStudents.issueHomework", () => {
  it("issues RED and unmarked numbers again: assignment, mirror, notification, realtime event", async () => {
    const mock = createTestMock();
    await mock.signIn(ANNA);
    const realtime = await listen(mock);
    const before = snapshot(mock);
    const row = coverage("homework.issue.reissue");
    assert.deepEqual([row.kind, row.fixtureIds], ["script", ["usr_ilya", "hw_ilya_overdue"]]);

    // 118 is RED and 120 unmarked; both already belong to hw_ilya_overdue.
    const result = await issue(mock, { homeworkNumberIds: ids("118", "120"), deadlineAt: "2026-11-19T17:00:00+00:00" });
    assert.deepEqual(Object.keys(result).sort(), ["assignmentId", "deadlineAt", "homeworkNumberIds"]);
    assert.deepEqual([result.deadlineAt, result.homeworkNumberIds], [IN_THREE_DAYS.replace("09:00", "17:00"), ids("118", "120")]);

    const stored = mock.store.homeworks.get(result.assignmentId)!;
    assert.deepEqual([stored.studentId, stored.topicId, stored.title, stored.deadlineAt, stored.createdAt], ["usr_ilya", "top_linear", null, result.deadlineAt, TEST_T0]);
    assert.equal(mock.store.homeworkNumbers.by("assignmentId", result.assignmentId).length, 2);

    // The 4th linear assignment of Илья by createdAt → «ДЗ 4».
    const { assignments } = await mock.api.teacherStudents.getStudentHomeworks("usr_ilya");
    const created = assignments.find((assignment) => assignment.id === result.assignmentId)!;
    assert.deepEqual([created.orderInTopic, created.title, created.totalNumbers], [4, null, 2]);
    assert.equal((await mock.api.teacherStudents.getStudentCard("usr_ilya")).activeHomeworksCount, 9);

    // The mirror keeps the EARLIEST deadline among the assignments that contain the number.
    const overdue = mock.store.homeworks.get("hw_ilya_overdue")!.deadlineAt;
    assert.equal(statusOf(mock, "usr_ilya", "118")!.deadlineAt, overdue);
    assert.equal(statusOf(mock, "usr_ilya", "120")!.deadlineAt, overdue);
    // The colour is not touched by issuing.
    assert.equal(statusOf(mock, "usr_ilya", "118")!.status, "RED");

    const after = snapshot(mock);
    assert.deepEqual(after, { ...before, homeworks: before.homeworks + 1, links: before.links + 2, notifications: before.notifications + 1 });
    const notification = mock.store.notifications.all().at(-1)!;
    assert.deepEqual([notification.userId, notification.type, notification.href, notification.readAt], ["usr_ilya", "homework-assigned", "/student/homeworks", null]);
    assert.deepEqual(notification.params, { variant: "assigned", topic: "Линейные уравнения", numbers: "118, 120", count: 2, deadlineAt: result.deadlineAt });

    await settle();
    assert.deepEqual(realtime.seen(), [{ kind: "student-deadlines-changed", studentId: "usr_ilya", topicId: "top_linear" }]);
  });

  it("normalises ids and the title, creates missing status rows and accepts a deadline in the past", async () => {
    const mock = createTestMock();
    await mock.signIn(ANNA);
    const past = iso(T0 - 5 * DAY_MS);
    assert.equal(mock.store.statuses.by("studentId", "usr_timur").length, 0);

    const first = await mock.api.teacherStudents.issueHomework({
      studentId: " usr_timur ",
      topicId: " top_linear ",
      homeworkNumberIds: [" num_112 ", "num_112", "", "num_118"],
      deadlineAt: past,
      title: `  ${"Т".repeat(210)}  `,
    });
    assert.deepEqual(first.homeworkNumberIds, ids("112", "118"));
    assert.equal(first.deadlineAt, past);
    assert.equal(mock.store.homeworks.get(first.assignmentId)!.title, "Т".repeat(200));
    // Rows are created empty, with the mirrored deadline.
    for (const label of ["112", "118"]) {
      const row = statusOf(mock, "usr_timur", label)!;
      assert.deepEqual([row.status, row.note, row.deadlineAt, row.statusChangedAt], [null, null, past, null]);
    }

    // A blank title is «ДЗ N»; an earlier deadline of a second assignment moves the mirror.
    const earlier = iso(T0 - 9 * DAY_MS);
    const second = await mock.api.teacherStudents.issueHomework({ studentId: "usr_timur", topicId: "top_linear", homeworkNumberIds: ids("118"), deadlineAt: earlier, title: "   " });
    assert.equal(mock.store.homeworks.get(second.assignmentId)!.title, null);
    assert.equal(statusOf(mock, "usr_timur", "118")!.deadlineAt, earlier);
    assert.equal(statusOf(mock, "usr_timur", "112")!.deadlineAt, past);
    const { assignments } = await mock.api.teacherStudents.getStudentHomeworks("usr_timur");
    assert.deepEqual(assignments.map((assignment) => assignment.orderInTopic).sort(), [1, 2]);
  });

  it("refuses solved numbers with 409 solvedConflict and creates nothing (one number)", async () => {
    const mock = createTestMock();
    await mock.signIn(ANNA);
    const realtime = await listen(mock);
    const before = snapshot(mock);
    assert.equal(coverage("homework.issue.solvedConflict.one").kind, "script");

    const error = await rejects(issue(mock, { homeworkNumberIds: ids("112", "120") }), "solvedConflict", 409);
    assert.equal(error.message, format(ru.apiPlanner.homeworkIssue.solvedConflictOne, { numbers: "112" }));
    assert.ok(error.message.includes("Номер 112 "));
    assert.deepEqual(error.params, { numbers: "112" });
    assert.deepEqual(error.details, { conflictNumbers: ["112"] });
    assert.deepEqual(snapshot(mock), before);
    await settle();
    assert.deepEqual(realtime.seen(), []);

    // `issue.conflict.fix`: without the solved number the same request passes.
    const fixed = await issue(mock, { homeworkNumberIds: ids("120") });
    assert.deepEqual(fixed.homeworkNumberIds, ids("120"));
  });

  it("lists several solved numbers in numeric order, leading zeros kept", async () => {
    const mock = createTestMock();
    await mock.signIn(ANNA);
    const before = snapshot(mock);
    assert.equal(coverage("homework.issue.solvedConflict.many").kind, "script");

    // 112 GREEN, 113 YELLOW, 121 GREEN; 120 is unmarked.
    const linear = await rejects(issue(mock, { homeworkNumberIds: ids("121", "112", "120", "113") }), "solvedConflict", 409);
    assert.equal(linear.message, format(ru.apiPlanner.homeworkIssue.solvedConflictMany, { numbers: "112, 113, 121" }));
    assert.deepEqual(linear.details, { conflictNumbers: ["112", "113", "121"] });
    assert.deepEqual(linear.params, { numbers: "112, 113, 121" });

    const log = await rejects(issue(mock, { topicId: "top_log", homeworkNumberIds: ids("010204", "010203", "010208") }), "solvedConflict", 409);
    assert.deepEqual(log.details, { conflictNumbers: ["010203", "010204"] });
    assert.ok(log.message.includes("010203, 010204"));

    mock.setLocale("en");
    const english = await rejects(issue(mock, { homeworkNumberIds: ids("112") }), "solvedConflict", 409);
    assert.equal(english.message, format(en.apiPlanner.homeworkIssue.solvedConflictOne, { numbers: "112" }));
    assert.deepEqual(snapshot(mock), before);
  });

  it("answers 400 invalidData for a broken request, before anything is looked up", async () => {
    const mock = createTestMock();
    await mock.signIn(ANNA);
    const before = snapshot(mock);
    const broken: Partial<IssueHomeworkRequest>[] = [
      { homeworkNumberIds: ids("120"), deadlineAt: "" },
      { homeworkNumberIds: ids("120"), deadlineAt: "   " },
      { homeworkNumberIds: ids("120"), deadlineAt: "послезавтра" },
      { homeworkNumberIds: ids("120"), deadlineAt: undefined as unknown as string },
      { homeworkNumberIds: ids("120"), deadlineAt: 1794819600000 as unknown as string },
      { homeworkNumberIds: [] },
      { homeworkNumberIds: ["", "  "] },
      { homeworkNumberIds: "num_120" as unknown as string[] },
      { homeworkNumberIds: ids("120"), topicId: " " },
      { homeworkNumberIds: ids("120"), studentId: "" },
      // A foreign student with a broken body is still a 400.
      { homeworkNumberIds: [], studentId: "usr_sofia" },
    ];
    for (const input of broken) {
      const error = await rejects(issue(mock, input), "invalidData", 400);
      assert.equal(error.message, ru.apiPlanner.homeworkIssue.invalidData);
    }
    assert.deepEqual(snapshot(mock), before);
  });

  it("answers 404 studentOrNumberNotFound for a foreign student or a number outside the topic", async () => {
    const mock = createTestMock();
    await mock.signIn(ANNA);
    const before = snapshot(mock);
    const missing: Partial<IssueHomeworkRequest>[] = [
      { studentId: "usr_sofia", homeworkNumberIds: ids("120") },
      { studentId: "usr_orphan", homeworkNumberIds: ids("120") },
      { studentId: "usr_igor", homeworkNumberIds: ids("120") },
      { studentId: "nope", homeworkNumberIds: ids("120") },
      // One number of another topic spoils the whole request.
      { homeworkNumberIds: ids("120", "204") },
      { homeworkNumberIds: ["num_999999"] },
      { topicId: "top_nope", homeworkNumberIds: ids("120") },
    ];
    for (const input of missing) {
      const error = await rejects(issue(mock, input), "studentOrNumberNotFound", 404);
      assert.equal(error.message, ru.apiCommon.studentOrNumberNotFound);
    }
    // "Not found" wins over the conflict: 112 is solved, but 204 is not a linear number.
    await rejects(issue(mock, { homeworkNumberIds: ids("112", "204") }), "studentOrNumberNotFound", 404);
    assert.deepEqual(snapshot(mock), before);
  });

  it("lets a developer issue to any student", async () => {
    const mock = createTestMock();
    await mock.signIn(DEV);
    const realtime = await listen(mock);
    const sofia = await issue(mock, { studentId: "usr_sofia", topicId: "top_derivative", homeworkNumberIds: ids("312") });
    const orphan = await issue(mock, { studentId: "usr_orphan", homeworkNumberIds: ids("118") });
    assert.equal(mock.store.homeworks.get(sofia.assignmentId)!.studentId, "usr_sofia");
    assert.equal(mock.store.homeworks.get(orphan.assignmentId)!.studentId, "usr_orphan");
    await settle();
    assert.deepEqual(realtime.seen().map((event) => event.studentId), ["usr_sofia", "usr_orphan"]);
  });

  it("reaches the student: the bell shows the new homework and the deadline in the student's language", async () => {
    const mock = createTestMock();
    await mock.signIn(ANNA);
    mock.clock.advance(MINUTE_MS);
    const issued = await issue(mock, { homeworkNumberIds: ids("118", "120") });
    mock.clock.advance(MINUTE_MS);
    await mock.api.teacherStudents.setNumberDeadlines("usr_ilya", { topicId: "top_quadratic", homeworkNumberIds: ids("218"), deadlineAt: IN_THREE_DAYS });

    await mock.signIn("ilya@example.com");
    const ruBell = await mock.api.shell.listNotifications();
    const [deadline, assigned] = ruBell.notifications;
    assert.deepEqual([assigned!.type, assigned!.title, assigned!.readAt], ["homework-assigned", format(ru.notifications.homeworkAssigned.titleAssigned, { topic: "Линейные уравнения" }), null]);
    assert.ok(assigned!.body?.includes("118, 120"));
    assert.equal(deadline!.title, format(ru.notifications.homeworkAssigned.titleDeadline, { topic: "Квадратные функции" }));
    assert.ok(deadline!.body?.includes("218"));
    // The site path is resolved to a screen of the student's app.
    assert.deepEqual([assigned!.href, assigned!.target?.screen, deadline!.target?.screen], ["/student/homeworks", "student.homeworks", "student.homeworks"]);

    mock.setLocale("en");
    const enBell = await mock.api.shell.listNotifications();
    assert.equal(enBell.notifications[1]!.title, format(en.notifications.homeworkAssigned.titleAssigned, { topic: "Линейные уравнения" }));
    // The student sees the homework itself in the deadlines of the number.
    assert.equal(mock.store.homeworks.get(issued.assignmentId)!.studentId, "usr_ilya");
  });

  it("shares 120 requests per minute with cancelling; refused requests count", async () => {
    const mock = createTestMock();
    await mock.signIn(ANNA);
    for (let index = 0; index < 119; index += 1) await rejects(issue(mock, { homeworkNumberIds: [] }), "invalidData", 400);
    await rejects(mock.api.teacherStudents.cancelHomework("nope"), "homeworkNotFound", 404);

    const error = await rejects(issue(mock, { homeworkNumberIds: ids("120") }), "rateLimited", 429);
    assert.equal(error.message, ru.apiCommon.rateLimited);
    assert.equal(error.retryAfterSeconds, 60);
    assert.equal((await rejects(mock.api.teacherStudents.cancelHomework("hw_ilya_far"), "rateLimited", 429)).retryAfterSeconds, 60);
    assert.equal(mock.store.homeworks.has("hw_ilya_far"), true);

    mock.clock.advance(MINUTE_MS);
    await issue(mock, { homeworkNumberIds: ids("120") });
    await mock.api.teacherStudents.cancelHomework("hw_ilya_far");
  });
});

describe("teacherStudents.cancelHomework", () => {
  it("deletes the homework with its photos, takes the deadline off its numbers and keeps the statuses", async () => {
    const mock = createTestMock();
    await mock.signIn(ANNA);
    const realtime = await listen(mock);
    const { store } = mock;
    const before = snapshot(mock);
    const removedFiles: string[] = [];
    const photoFiles = store.homeworkPhotos.by("assignmentId", "hw_ilya_open").map((photo) => photo.fileId);
    assert.equal(photoFiles.length, 3);
    assert.equal(statusOf(mock, "usr_ilya", "302")!.deadlineAt, store.homeworks.get("hw_ilya_open")!.deadlineAt);

    assert.equal(await mock.api.teacherStudents.cancelHomework("hw_ilya_open"), undefined);

    assert.equal(store.homeworks.has("hw_ilya_open"), false);
    assert.equal(store.homeworkNumbers.by("assignmentId", "hw_ilya_open").length, 0);
    assert.equal(store.homeworkPhotos.by("assignmentId", "hw_ilya_open").length, 0);
    for (const fileId of photoFiles) {
      if (!store.files.has(fileId)) removedFiles.push(fileId);
    }
    assert.deepEqual(removedFiles, photoFiles);

    // 301 keeps its colour without a deadline; the two empty rows are gone.
    const kept = statusOf(mock, "usr_ilya", "301")!;
    assert.deepEqual([kept.status, kept.deadlineAt], ["YELLOW", null]);
    assert.equal(statusOf(mock, "usr_ilya", "302"), undefined);
    assert.equal(statusOf(mock, "usr_ilya", "305"), undefined);

    // No notification for the student and no journal row.
    assert.deepEqual(snapshot(mock), { ...before, homeworks: before.homeworks - 1, links: before.links - 3, statuses: before.statuses - 2 });
    await settle();
    assert.deepEqual(realtime.seen(), [{ kind: "student-deadlines-changed", studentId: "usr_ilya", topicId: "top_derivative" }]);

    const { assignments } = await mock.api.teacherStudents.getStudentHomeworks("usr_ilya");
    assert.equal(assignments.some((assignment) => assignment.id === "hw_ilya_open"), false);
    await rejects(mock.api.teacherStudents.cancelHomework("hw_ilya_open"), "homeworkNotFound", 404);
  });

  it("deletes the checks with their results and snapshot photos", async () => {
    const mock = createTestMock();
    await mock.signIn(ANNA);
    const { store } = mock;
    const checks = store.homeworkChecks.by("assignmentId", "hw_ilya_done");
    assert.equal(checks.length, 3);
    const checkFiles = checks.flatMap((check) => store.homeworkCheckPhotos.by("checkId", check.id).map((photo) => photo.fileId));
    assert.equal(checkFiles.length, 6);

    await mock.api.teacherStudents.cancelHomework("hw_ilya_done");

    assert.equal(store.homeworkChecks.by("assignmentId", "hw_ilya_done").length, 0);
    for (const check of checks) {
      assert.equal(store.homeworkCheckResults.by("checkId", check.id).length, 0);
      assert.equal(store.homeworkCheckPhotos.by("checkId", check.id).length, 0);
    }
    assert.ok(checkFiles.every((fileId) => !store.files.has(fileId)));
    // The colours the checks produced stay.
    assert.deepEqual([statusOf(mock, "usr_ilya", "112")!.status, statusOf(mock, "usr_ilya", "112")!.deadlineAt], ["GREEN", null]);
    assert.deepEqual([statusOf(mock, "usr_ilya", "113")!.status, statusOf(mock, "usr_ilya", "113")!.note], ["YELLOW", "Перепутал знак при раскрытии скобок"]);
  });

  it("removes the jobs of a running check with it", async () => {
    const mock = createTestMock();
    await mock.signIn(ANNA);
    assert.equal(mock.store.jobs.by("refId", "chk_artem_running_1").length, 1);
    await mock.api.teacherStudents.cancelHomework("hw_artem_running");
    assert.equal(mock.store.homeworkChecks.has("chk_artem_running_1"), false);
    assert.equal(mock.store.jobs.by("refId", "chk_artem_running_1").length, 0);
    assert.equal(mock.store.rowScripts.has("chk_artem_running_1"), false);
    assert.equal(mock.store.files.has("file_artem_running_photo_1"), false);
  });

  it("recomputes the mirror from the remaining assignments and keeps rows that still carry something", async () => {
    const mock = createTestMock();
    await mock.signIn(ANNA);
    assert.equal(coverage("status.manualClearSurvives").check!(mock.store, T0), true);
    assert.equal(coverage("status.nullWithNote.todayEmptyYesterdayActive").check!(mock.store, T0), true);
    const second = await issue(mock, { homeworkNumberIds: ids("118") });
    const overdue = mock.store.homeworks.get("hw_ilya_overdue")!.deadlineAt;
    assert.equal(statusOf(mock, "usr_ilya", "118")!.deadlineAt, overdue);

    await mock.api.teacherStudents.cancelHomework("hw_ilya_overdue");

    // 118 is still in the second assignment: its deadline takes over.
    assert.equal(statusOf(mock, "usr_ilya", "118")!.deadlineAt, IN_THREE_DAYS);
    // 120: no colour, but the student's note keeps the row. 124: a manual clear (`statusChangedAt`) keeps it.
    const noted = statusOf(mock, "usr_ilya", "120")!;
    assert.deepEqual([noted.status, noted.deadlineAt, noted.note !== null], [null, null, true]);
    const cleared = statusOf(mock, "usr_ilya", "124")!;
    assert.deepEqual([cleared.status, cleared.deadlineAt, cleared.statusChangedAt !== null], [null, null, true]);

    await mock.api.teacherStudents.cancelHomework(second.assignmentId);
    assert.deepEqual([statusOf(mock, "usr_ilya", "118")!.status, statusOf(mock, "usr_ilya", "118")!.deadlineAt], ["RED", null]);
  });

  it("answers 400 for an empty id and 404 homeworkNotFound for a foreign or unknown one", async () => {
    const mock = createTestMock();
    await mock.signIn(ANNA);
    const before = snapshot(mock);
    for (const id of ["", "   "]) {
      const error = await rejects(mock.api.teacherStudents.cancelHomework(id), "invalidData", 400);
      assert.equal(error.message, ru.apiPlanner.homeworks.invalidCancelData);
    }
    for (const id of ["hw_sofia_1", "hw_orphan_1", "nope", "usr_ilya"]) {
      const error = await rejects(mock.api.teacherStudents.cancelHomework(id), "homeworkNotFound", 404);
      assert.equal(error.message, ru.apiCommon.homeworkNotFound);
    }
    assert.deepEqual(snapshot(mock), before);

    await mock.signIn(IGOR);
    await rejects(mock.api.teacherStudents.cancelHomework("hw_ilya_far"), "homeworkNotFound", 404);
    await mock.api.teacherStudents.cancelHomework("hw_sofia_1");
    assert.equal(mock.store.homeworks.has("hw_sofia_1"), false);
  });

  it("lets a developer cancel a homework of any student", async () => {
    const mock = createTestMock();
    await mock.signIn(DEV);
    const realtime = await listen(mock);
    await mock.api.teacherStudents.cancelHomework("hw_orphan_1");
    await mock.api.teacherStudents.cancelHomework("hw_sofia_1");
    assert.equal(mock.store.homeworks.has("hw_orphan_1"), false);
    assert.equal(mock.store.homeworks.has("hw_sofia_1"), false);
    await settle();
    assert.deepEqual(realtime.seen().map((event) => [event.kind, event.studentId]), [["student-deadlines-changed", "usr_orphan"], ["student-deadlines-changed", "usr_sofia"]]);
  });
});

describe("teacherStudents.setNumberStatus", () => {
  it("writes the colour, the history event, the journal row and the realtime event", async () => {
    const mock = createTestMock();
    await mock.signIn(ANNA);
    const realtime = await listen(mock);
    const before = snapshot(mock);
    const note = statusOf(mock, "usr_ilya", "120")!.note;
    const deadline = statusOf(mock, "usr_ilya", "120")!.deadlineAt;

    mock.clock.advance(90_000);
    const result = await mock.api.teacherStudents.setNumberStatus("usr_ilya", "num_120", "GREEN");
    assert.deepEqual(result, { status: "GREEN", statusChangedAt: iso(T0 + 90_000), decision: "changed" });

    const row = statusOf(mock, "usr_ilya", "120")!;
    assert.deepEqual([row.status, row.statusChangedAt, row.updatedAt, row.note, row.deadlineAt], ["GREEN", iso(T0 + 90_000), iso(T0 + 90_000), note, deadline]);

    const event = eventsOf(mock, "usr_ilya", "120").at(-1)!;
    assert.deepEqual(
      [event.source, event.previousStatus, event.requestedStatus, event.status, event.decision, event.actorId, event.actorName, event.actorRole, event.createdAt],
      ["teacher", null, "GREEN", "GREEN", "changed", "usr_anna", "Анна Петрова", "TEACHER", iso(T0 + 90_000)],
    );
    assert.deepEqual(event.context, {});

    assert.deepEqual(snapshot(mock), { ...before, events: before.events + 1, audits: before.audits + 1 });
    const audit = mock.store.auditLogs.all().at(-1)!;
    assert.deepEqual([audit.category, audit.action, audit.actorId, audit.targetType, audit.targetId], ["DATA", "progress.status", "usr_anna", "ProgressStatusEvent", event.id]);

    await settle();
    assert.deepEqual(realtime.seen(), [{ kind: "student-progress-changed", studentId: "usr_ilya", topicId: "top_linear" }]);
    // The student's streak source sees the mark: the review list shows it at once.
    const { assignments } = await mock.api.teacherStudents.getStudentHomeworks("usr_ilya");
    assert.equal(assignments.find((assignment) => assignment.id === "hw_ilya_overdue")!.numbers.find((number) => number.number === "120")!.status, "GREEN");
  });

  it("records a repeated mark as reaffirmed, clears with null and never protects against a downgrade", async () => {
    const mock = createTestMock();
    await mock.signIn(ANNA);
    const api = mock.api.teacherStudents;
    const set = async (status: HomeworkNumberStatus | null) => {
      mock.clock.advance(MINUTE_MS);
      return api.setNumberStatus("usr_ilya", "num_112", status);
    };

    // 112 is GREEN: the same colour again bumps the time and says "reaffirmed".
    const changedAt = statusOf(mock, "usr_ilya", "112")!.statusChangedAt;
    const again = await set("GREEN");
    assert.deepEqual([again.status, again.decision, again.statusChangedAt], ["GREEN", "reaffirmed", iso(T0 + MINUTE_MS)]);
    assert.notEqual(again.statusChangedAt, changedAt);

    // A manual mark may lower the colour (an AI check may not).
    assert.deepEqual(await set("RED"), { status: "RED", statusChangedAt: iso(T0 + 2 * MINUTE_MS), decision: "changed" });
    assert.deepEqual(await set("YELLOW"), { status: "YELLOW", statusChangedAt: iso(T0 + 3 * MINUTE_MS), decision: "changed" });

    // Clearing keeps the row with the time of the clear — it protects the number from an older check's answer.
    assert.deepEqual(await set(null), { status: null, statusChangedAt: iso(T0 + 4 * MINUTE_MS), decision: "changed" });
    const cleared = statusOf(mock, "usr_ilya", "112")!;
    assert.deepEqual([cleared.status, cleared.statusChangedAt], [null, iso(T0 + 4 * MINUTE_MS)]);
    assert.deepEqual(await set(null), { status: null, statusChangedAt: iso(T0 + 5 * MINUTE_MS), decision: "reaffirmed" });

    assert.deepEqual(eventsOf(mock, "usr_ilya", "112").slice(-5).map((event) => [event.previousStatus, event.requestedStatus, event.status, event.decision]), [
      ["GREEN", "GREEN", "GREEN", "reaffirmed"],
      ["GREEN", "RED", "RED", "changed"],
      ["RED", "YELLOW", "YELLOW", "changed"],
      ["YELLOW", null, null, "changed"],
      [null, null, null, "reaffirmed"],
    ]);
  });

  it("works for a number that is in no homework and has no row yet", async () => {
    const mock = createTestMock();
    await mock.signIn(ANNA);
    assert.equal(statusOf(mock, "usr_timur", "520"), undefined);
    const result = await mock.api.teacherStudents.setNumberStatus("usr_timur", "num_520", "YELLOW");
    assert.deepEqual([result.status, result.decision], ["YELLOW", "changed"]);
    const row = statusOf(mock, "usr_timur", "520")!;
    assert.deepEqual([row.status, row.note, row.deadlineAt, row.statusChangedAt], ["YELLOW", null, null, TEST_T0]);
    // A clear of a number that never had a row still leaves the protecting row behind.
    assert.equal((await mock.api.teacherStudents.setNumberStatus("usr_timur", "num_521", null)).decision, "reaffirmed");
    assert.deepEqual([statusOf(mock, "usr_timur", "521")!.status, statusOf(mock, "usr_timur", "521")!.statusChangedAt], [null, TEST_T0]);
  });

  it("validates the body before the student is looked up, and answers 404 studentOrNumberNotFound after", async () => {
    const mock = createTestMock();
    await mock.signIn(ANNA);
    const api = mock.api.teacherStudents;
    const before = snapshot(mock);
    const bad = ["BLUE", "green", undefined, 1, ""] as unknown as HomeworkNumberStatus[];
    for (const status of bad) {
      for (const studentId of ["usr_ilya", "usr_sofia"]) {
        const error = await rejects(api.setNumberStatus(studentId, "num_120", status), "invalidData", 400);
        assert.equal(error.message, ru.apiPlanner.numberStatus.invalidData);
      }
    }
    await rejects(api.setNumberStatus("", "num_120", "GREEN"), "invalidData", 400);
    await rejects(api.setNumberStatus("usr_ilya", "  ", "GREEN"), "invalidData", 400);

    for (const [studentId, numberId] of [["usr_sofia", "num_120"], ["usr_orphan", "num_120"], ["usr_igor", "num_120"], ["nope", "num_120"], ["usr_ilya", "num_999999"], ["usr_ilya", "top_linear"]] as const) {
      const error = await rejects(api.setNumberStatus(studentId, numberId, "GREEN"), "studentOrNumberNotFound", 404);
      assert.equal(error.message, ru.apiCommon.studentOrNumberNotFound);
    }
    assert.deepEqual(snapshot(mock), before);
  });

  it("refuses a developer with 403 and allows 240 writes per minute", async () => {
    const mock = createTestMock();
    await mock.signIn(DEV);
    await rejects(mock.api.teacherStudents.setNumberStatus("usr_ilya", "num_120", "GREEN"), "unauthorized", 403);
    assert.equal(statusOf(mock, "usr_ilya", "120")!.status, null);

    await mock.signIn(ANNA);
    mock.api.controls.exhaust("api:teacher-number-status", "usr_anna");
    const error = await rejects(mock.api.teacherStudents.setNumberStatus("usr_ilya", "num_120", "GREEN"), "rateLimited", 429);
    assert.deepEqual([error.message, error.retryAfterSeconds], [ru.apiCommon.rateLimited, 60]);
    // The batch shares the bucket.
    await rejects(mock.api.teacherStudents.setNumberStatuses("usr_ilya", [{ homeworkNumberId: "num_120", status: "GREEN" }]), "rateLimited", 429);
    assert.equal(statusOf(mock, "usr_ilya", "120")!.status, null);
    mock.clock.advance(MINUTE_MS);
    assert.equal((await mock.api.teacherStudents.setNumberStatus("usr_ilya", "num_120", "GREEN")).status, "GREEN");
  });
});

describe("teacherStudents.setNumberStatuses", () => {
  it("accepts AI verdicts in one call — one history event per item — and undoes them, null included", async () => {
    const mock = createTestMock();
    await mock.signIn(ANNA);
    const realtime = await listen(mock);
    const api = mock.api.teacherStudents;
    const before = snapshot(mock);
    const previous = ["118", "120", "124"].map((label) => statusOf(mock, "usr_ilya", label)!.status);
    assert.deepEqual(previous, ["RED", null, null]);

    mock.clock.advance(MINUTE_MS);
    const accepted = await api.setNumberStatuses("usr_ilya", [
      { homeworkNumberId: "num_118", status: "YELLOW" },
      { homeworkNumberId: "num_120", status: "RED" },
      { homeworkNumberId: "num_124", status: "GREEN" },
    ]);
    assert.deepEqual(accepted, {
      results: [
        { homeworkNumberId: "num_118", status: "YELLOW" },
        { homeworkNumberId: "num_120", status: "RED" },
        { homeworkNumberId: "num_124", status: "GREEN" },
      ],
    });
    assert.deepEqual(["118", "120", "124"].map((label) => statusOf(mock, "usr_ilya", label)!.status), ["YELLOW", "RED", "GREEN"]);
    assert.deepEqual(snapshot(mock), { ...before, events: before.events + 3, audits: before.audits + 3 });
    for (const label of ["118", "120", "124"]) {
      const event = eventsOf(mock, "usr_ilya", label).at(-1)!;
      assert.deepEqual([event.source, event.actorId, event.decision, event.createdAt], ["teacher", "usr_anna", "changed", iso(T0 + MINUTE_MS)]);
    }
    // One hit of the shared bucket for the whole batch.
    assert.equal(mock.api.controls.listLimiters().find((bucket) => bucket.scope === "api:teacher-number-status")!.hits, 1);
    await settle();
    assert.deepEqual(realtime.seen(), [{ kind: "student-progress-changed", studentId: "usr_ilya", topicId: "top_linear" }]);

    // Undo: every number back to what it was.
    const undone = await api.setNumberStatuses("usr_ilya", [
      { homeworkNumberId: "num_118", status: "RED" },
      { homeworkNumberId: "num_120", status: null },
      { homeworkNumberId: "num_124", status: null },
    ]);
    assert.deepEqual(undone.results.map((entry) => entry.status), previous);
    assert.deepEqual(["118", "120", "124"].map((label) => statusOf(mock, "usr_ilya", label)!.status), previous);
    assert.equal(snapshot(mock).events, before.events + 6);
  });

  it("publishes one event per topic touched and keeps the order of duplicates", async () => {
    const mock = createTestMock();
    await mock.signIn(ANNA);
    const realtime = await listen(mock);
    const { results } = await mock.api.teacherStudents.setNumberStatuses("usr_ilya", [
      { homeworkNumberId: "num_120", status: "RED" },
      { homeworkNumberId: "num_211", status: "GREEN" },
      { homeworkNumberId: "num_120", status: "GREEN" },
    ]);
    assert.deepEqual(results.map((entry) => entry.status), ["RED", "GREEN", "GREEN"]);
    assert.equal(statusOf(mock, "usr_ilya", "120")!.status, "GREEN");
    assert.deepEqual(eventsOf(mock, "usr_ilya", "120").slice(-2).map((event) => [event.previousStatus, event.status]), [[null, "RED"], ["RED", "GREEN"]]);
    await settle();
    assert.deepEqual(realtime.seen().map((event) => event.topicId), ["top_linear", "top_quadratic"]);
  });

  it("takes 1..100 changes and nothing else", async () => {
    const mock = createTestMock();
    await mock.signIn(ANNA);
    const api = mock.api.teacherStudents;
    const before = snapshot(mock);
    const numbers = mock.store.numbers.all();
    const many = (count: number) => Array.from({ length: count }, (_, index) => ({ homeworkNumberId: numbers[index % numbers.length]!.id, status: "RED" as const }));

    const invalid = async (changes: unknown) => {
      const error = await rejects(api.setNumberStatuses("usr_timur", changes as { homeworkNumberId: string; status: HomeworkNumberStatus | null }[]), "invalidData", 400);
      assert.equal(error.message, ru.apiPlanner.numberStatus.invalidData);
    };
    await invalid([]);
    await invalid(many(101));
    await invalid(null);
    await invalid({ homeworkNumberId: "num_112", status: "GREEN" });
    await invalid([{ homeworkNumberId: "num_112", status: "PURPLE" }]);
    await invalid([{ homeworkNumberId: "num_112" }]);
    await invalid([{ homeworkNumberId: "", status: "GREEN" }]);
    await invalid([{ homeworkNumberId: "num_112", status: "GREEN" }, null]);
    await rejects(api.setNumberStatuses(" ", many(1)), "invalidData", 400);
    assert.deepEqual(snapshot(mock), before);

    assert.equal((await api.setNumberStatuses("usr_timur", many(1))).results.length, 1);
    const full = await api.setNumberStatuses("usr_timur", many(100));
    assert.equal(full.results.length, 100);
    assert.ok(full.results.every((entry) => entry.status === "RED"));
    assert.equal(snapshot(mock).events, before.events + 101);
    assert.equal(mock.store.statuses.by("studentId", "usr_timur").length, numbers.length);
  });

  it("is all-or-nothing: one unknown number or a foreign student writes nothing", async () => {
    const mock = createTestMock();
    await mock.signIn(ANNA);
    const realtime = await listen(mock);
    const api = mock.api.teacherStudents;
    const before = snapshot(mock);

    const unknown = await rejects(
      api.setNumberStatuses("usr_ilya", [{ homeworkNumberId: "num_120", status: "GREEN" }, { homeworkNumberId: "num_999999", status: "RED" }]),
      "studentOrNumberNotFound",
      404,
    );
    assert.equal(unknown.message, ru.apiCommon.studentOrNumberNotFound);
    for (const studentId of ["usr_sofia", "usr_orphan", "nope"]) {
      await rejects(api.setNumberStatuses(studentId, [{ homeworkNumberId: "num_120", status: "GREEN" }]), "studentOrNumberNotFound", 404);
    }
    assert.deepEqual(snapshot(mock), before);
    assert.equal(statusOf(mock, "usr_ilya", "120")!.status, null);
    await settle();
    assert.deepEqual(realtime.seen(), []);

    await mock.signIn(DEV);
    await rejects(api.setNumberStatuses("usr_ilya", [{ homeworkNumberId: "num_120", status: "GREEN" }]), "unauthorized", 403);
  });
});

describe("teacherStudents.setNumberDeadlines", () => {
  const deadlines = (mock: TestMock, studentId: string, input: Partial<SetDeadlinesRequest>) =>
    mock.api.teacherStudents.setNumberDeadlines(studentId, { topicId: "top_linear", homeworkNumberIds: [], deadlineAt: IN_THREE_DAYS, ...input });

  it("sets a deadline on one number: row, notification «deadline», realtime event", async () => {
    const mock = createTestMock();
    await mock.signIn(ANNA);
    const realtime = await listen(mock);
    const before = snapshot(mock);

    const result = await deadlines(mock, "usr_timur", { homeworkNumberIds: [" num_113 ", "num_113"], deadlineAt: "2026-11-19T12:00:00+03:00" });
    assert.deepEqual(result, { deadlineAt: IN_THREE_DAYS, homeworkNumberIds: ["num_113"] });

    const row = statusOf(mock, "usr_timur", "113")!;
    assert.deepEqual([row.status, row.note, row.deadlineAt, row.statusChangedAt], [null, null, IN_THREE_DAYS, null]);
    assert.deepEqual(snapshot(mock), { ...before, statuses: before.statuses + 1, notifications: before.notifications + 1 });
    const notification = mock.store.notifications.all().at(-1)!;
    assert.deepEqual([notification.userId, notification.type, notification.href], ["usr_timur", "homework-assigned", "/student/homeworks"]);
    assert.deepEqual(notification.params, { variant: "deadline", topic: "Линейные уравнения", numbers: "113", count: 1, deadlineAt: IN_THREE_DAYS });
    await settle();
    assert.deepEqual(realtime.seen(), [{ kind: "student-deadlines-changed", studentId: "usr_timur", topicId: "top_linear" }]);

    // The assign board shows it as "already assigned with a deadline".
    const board = await mock.api.teacherStudents.getAssignBoard("usr_timur");
    assert.equal(board.topics[0]!.numbers.find((number) => number.number === "113")!.deadlineAt, IN_THREE_DAYS);
  });

  it("sets several numbers at once with the «assigned» notification in bank order", async () => {
    const mock = createTestMock();
    await mock.signIn(ANNA);
    const result = await deadlines(mock, "usr_timur", { homeworkNumberIds: ids("121", "112", "118") });
    assert.deepEqual(result.homeworkNumberIds, ids("121", "112", "118"));
    assert.deepEqual(mock.store.notifications.all().at(-1)!.params, { variant: "assigned", topic: "Линейные уравнения", numbers: "112, 118, 121", count: 3, deadlineAt: IN_THREE_DAYS });
    for (const label of ["112", "118", "121"]) assert.equal(statusOf(mock, "usr_timur", label)!.deadlineAt, IN_THREE_DAYS);
  });

  it("clears with null without creating or deleting rows and without a notification", async () => {
    const mock = createTestMock();
    await mock.signIn(ANNA);
    const realtime = await listen(mock);
    await deadlines(mock, "usr_timur", { homeworkNumberIds: ids("112") });
    const before = snapshot(mock);

    // 112: an empty row with a deadline → the deadline goes, the row stays. 113: no row → none is created.
    const result = await deadlines(mock, "usr_timur", { homeworkNumberIds: ids("112", "113"), deadlineAt: null });
    assert.deepEqual(result, { deadlineAt: null, homeworkNumberIds: ids("112", "113") });
    assert.deepEqual([statusOf(mock, "usr_timur", "112")!.status, statusOf(mock, "usr_timur", "112")!.deadlineAt], [null, null]);
    assert.equal(statusOf(mock, "usr_timur", "113"), undefined);
    assert.deepEqual(snapshot(mock), before);

    // A coloured row and a row with a note lose only the deadline.
    await deadlines(mock, "usr_ilya", { homeworkNumberIds: ids("118", "120"), deadlineAt: null });
    assert.deepEqual([statusOf(mock, "usr_ilya", "118")!.status, statusOf(mock, "usr_ilya", "118")!.deadlineAt], ["RED", null]);
    assert.deepEqual([statusOf(mock, "usr_ilya", "120")!.note !== null, statusOf(mock, "usr_ilya", "120")!.deadlineAt], [true, null]);
    await settle();
    assert.deepEqual(realtime.seen().map((event) => [event.kind, event.studentId]), [
      ["student-deadlines-changed", "usr_timur"],
      ["student-deadlines-changed", "usr_timur"],
      ["student-deadlines-changed", "usr_ilya"],
    ]);
  });

  it("is not reconciled with the homework mirror until the next issue or cancel", async () => {
    const mock = createTestMock();
    await mock.signIn(ANNA);
    const overdue = mock.store.homeworks.get("hw_ilya_overdue")!.deadlineAt;
    await deadlines(mock, "usr_ilya", { homeworkNumberIds: ids("118") });
    assert.equal(statusOf(mock, "usr_ilya", "118")!.deadlineAt, IN_THREE_DAYS);
    assert.equal(mock.store.homeworks.get("hw_ilya_overdue")!.deadlineAt, overdue);
    // Issuing a homework that contains the number recomputes the mirror from the assignments.
    await issue(mock, { homeworkNumberIds: ids("118"), deadlineAt: iso(T0 + 9 * DAY_MS) });
    assert.equal(statusOf(mock, "usr_ilya", "118")!.deadlineAt, overdue);
  });

  it("validates the body, then the student and the topic of every number", async () => {
    const mock = createTestMock();
    await mock.signIn(ANNA);
    const before = snapshot(mock);
    const broken: Partial<SetDeadlinesRequest>[] = [
      { homeworkNumberIds: ids("112"), deadlineAt: undefined as unknown as null },
      { homeworkNumberIds: ids("112"), deadlineAt: "" },
      { homeworkNumberIds: ids("112"), deadlineAt: "скоро" },
      { homeworkNumberIds: [] },
      { homeworkNumberIds: ["  "] },
      { homeworkNumberIds: ids("112"), topicId: "" },
    ];
    for (const input of broken) {
      for (const studentId of ["usr_timur", "usr_sofia"]) {
        const error = await rejects(deadlines(mock, studentId, input), "invalidData", 400);
        assert.equal(error.message, ru.apiPlanner.studentDeadlines.invalidData);
      }
    }
    await rejects(deadlines(mock, "", { homeworkNumberIds: ids("112") }), "invalidData", 400);

    for (const [studentId, input] of [
      ["usr_sofia", { homeworkNumberIds: ids("112") }],
      ["usr_orphan", { homeworkNumberIds: ids("112") }],
      ["nope", { homeworkNumberIds: ids("112") }],
      ["usr_timur", { homeworkNumberIds: ids("112", "204") }],
      ["usr_timur", { homeworkNumberIds: ["num_999999"] }],
      ["usr_timur", { topicId: "top_quadratic", homeworkNumberIds: ids("112") }],
    ] as const) {
      const error = await rejects(deadlines(mock, studentId, { ...input, homeworkNumberIds: [...input.homeworkNumberIds] }), "studentOrNumberNotFound", 404);
      assert.equal(error.message, ru.apiCommon.studentOrNumberNotFound);
    }
    assert.deepEqual(snapshot(mock), before);
  });

  it("refuses a developer with 403 and allows 240 writes per minute", async () => {
    const mock = createTestMock();
    await mock.signIn(DEV);
    await rejects(deadlines(mock, "usr_timur", { homeworkNumberIds: ids("112") }), "unauthorized", 403);
    await mock.signIn(ANNA);
    mock.api.controls.exhaust("api:student-deadlines", "usr_anna");
    const error = await rejects(deadlines(mock, "usr_timur", { homeworkNumberIds: ids("112") }), "rateLimited", 429);
    assert.equal(error.retryAfterSeconds, 60);
    assert.equal(statusOf(mock, "usr_timur", "112"), undefined);
    // The status bucket is a different one.
    await mock.api.teacherStudents.setNumberStatus("usr_timur", "num_112", "GREEN");
  });
});

describe("teacherStudents.getProgressHistory", () => {
  it("pages the 25 events of (Илья, 118): 20 newest, then 5, codes instead of labels", async () => {
    const mock = createTestMock();
    await mock.signIn(ANNA);
    assert.equal(coverage("progressHistory.pagination.sourcesAndDecisions").check!(mock.store, T0), true);
    const api = mock.api.teacherStudents;

    const first = await api.getProgressHistory("usr_ilya", "num_118");
    assert.deepEqual([first.studentName, first.number, first.topicTitle, first.currentStatus], ["Илья Смирнов", "118", "Линейные уравнения", "RED"]);
    assert.equal(first.entries.length, 20);
    assert.equal(first.nextCursor, first.entries[19]!.id);
    assert.equal(first.nextCursor, "pse_ilya_118_06");
    // Newest first.
    assert.deepEqual(first.entries.map((entry) => entry.createdAt), [...first.entries.map((entry) => entry.createdAt)].sort().reverse());

    const newest = first.entries[0]!;
    assert.deepEqual(Object.keys(newest).sort(), ["actorName", "createdAt", "decision", "id", "previousStatus", "reference", "requestedStatus", "source", "status"]);
    assert.deepEqual(
      [newest.id, newest.source, newest.actorName, newest.previousStatus, newest.requestedStatus, newest.status, newest.decision],
      ["pse_ilya_118_25", "homework_check", null, null, "RED", "RED", "changed"],
    );
    // A decision that wrote nothing keeps the previous status and still says what was requested.
    const blocked = (await api.getProgressHistory("usr_ilya", "num_118", first.nextCursor!)).entries.find((entry) => entry.decision === "downgrade_blocked")!;
    assert.deepEqual([blocked.previousStatus, blocked.requestedStatus, blocked.status], ["YELLOW", "RED", "YELLOW"]);

    const second = await api.getProgressHistory("usr_ilya", "num_118", first.nextCursor!);
    assert.equal(second.entries.length, 5);
    assert.equal(second.nextCursor, null);
    assert.deepEqual(second.entries.map((entry) => entry.id), ["pse_ilya_118_05", "pse_ilya_118_04", "pse_ilya_118_03", "pse_ilya_118_02", "pse_ilya_118_01"]);
    assert.deepEqual([second.currentStatus, second.number], ["RED", "118"]);

    const all = [...first.entries, ...second.entries];
    assert.equal(new Set(all.map((entry) => entry.id)).size, 25);
    assert.deepEqual(new Set(all.map((entry) => entry.source)), new Set(["teacher", "homework_check", "lesson_teacher", "lesson_check", "lesson_end"]));
    for (const decision of ["changed", "reaffirmed", "unchanged", "uncertain", "downgrade_blocked", "newer_status", "no_status", "lesson_result_preserved"]) {
      assert.ok(all.some((entry) => entry.decision === decision), decision);
    }
    // The system's entries carry no actor; the teacher's carry the name.
    assert.equal(all.find((entry) => entry.source === "lesson_end")!.actorName, null);
    assert.ok(all.filter((entry) => entry.source === "teacher").every((entry) => entry.actorName === "Анна Петрова"));
  });

  it("links an entry to the lesson or the homework it came from when the viewer may open it", async () => {
    const mock = createTestMock();
    await mock.signIn(ANNA);
    const api = mock.api.teacherStudents;
    const all = async () => {
      const first = await api.getProgressHistory("usr_ilya", "num_118");
      const second = await api.getProgressHistory("usr_ilya", "num_118", first.nextCursor!);
      return new Map([...first.entries, ...second.entries].map((entry) => [entry.id, entry.reference] as const));
    };

    const teacher = await all();
    assert.deepEqual(teacher.get("pse_ilya_118_25"), { kind: "homework", assignmentId: "hw_ilya_overdue" });
    assert.deepEqual(teacher.get("pse_ilya_118_23"), { kind: "homework", assignmentId: "hw_ilya_overdue" });
    assert.deepEqual(teacher.get("pse_ilya_118_24"), { kind: "lesson", lessonId: "les_d2" });
    assert.deepEqual(teacher.get("pse_ilya_118_21"), { kind: "lesson", lessonId: "les_d1" });
    assert.deepEqual(teacher.get("pse_ilya_118_20"), { kind: "lesson", lessonId: "les_d1" });
    // A lesson that no longer exists, a cancelled homework and a plain manual mark have no link.
    assert.equal(teacher.get("pse_ilya_118_09"), null);
    assert.equal(teacher.get("pse_ilya_118_03"), null);
    assert.equal(teacher.get("pse_ilya_118_01"), null);
    assert.equal([...teacher.values()].filter((reference) => reference !== null).length, 5);

    // Cancelling the homework removes its links; a lesson taught by someone else is not linked for a teacher.
    await api.cancelHomework("hw_ilya_overdue");
    mock.store.lessons.update("les_d2", { teacherId: "usr_igor" });
    const later = await all();
    assert.equal(later.get("pse_ilya_118_25"), null);
    assert.equal(later.get("pse_ilya_118_24"), null);
    assert.deepEqual(later.get("pse_ilya_118_21"), { kind: "lesson", lessonId: "les_d1" });
  });

  it("never sends the homework kind to a developer, who may read any student's history", async () => {
    const mock = createTestMock();
    await mock.signIn(DEV);
    const api = mock.api.teacherStudents;
    const first = await api.getProgressHistory("usr_ilya", "num_118");
    assert.equal(first.entries.length, 20);
    assert.equal(first.entries[0]!.reference, null);
    assert.deepEqual(first.entries.map((entry) => entry.reference).filter((reference) => reference !== null), [
      { kind: "lesson", lessonId: "les_d2" },
      { kind: "lesson", lessonId: "les_d1" },
      { kind: "lesson", lessonId: "les_d1" },
    ]);
    // Any student, the unattributed one included.
    const orphan = await api.getProgressHistory("usr_orphan", "num_112");
    assert.deepEqual([orphan.studentName, orphan.entries.length, orphan.nextCursor], ["Лев Без-Учителя", 0, null]);
  });

  it("puts a new mark first; marks written at the same instant keep the newest first", async () => {
    const mock = createTestMock();
    await mock.signIn(ANNA);
    const api = mock.api.teacherStudents;
    // Three writes at one instant, then one a minute later.
    await api.setNumberStatuses("usr_timur", [
      { homeworkNumberId: "num_112", status: "RED" },
      { homeworkNumberId: "num_112", status: "YELLOW" },
      { homeworkNumberId: "num_112", status: "GREEN" },
    ]);
    mock.clock.advance(MINUTE_MS);
    await api.setNumberStatus("usr_timur", "num_112", null);

    const page = await api.getProgressHistory("usr_timur", "num_112");
    assert.deepEqual([page.studentName, page.number, page.currentStatus, page.nextCursor], ["Тимур Новиков", "112", null, null]);
    assert.deepEqual(page.entries.map((entry) => [entry.previousStatus, entry.status, entry.decision]), [
      ["GREEN", null, "changed"],
      ["YELLOW", "GREEN", "changed"],
      ["RED", "YELLOW", "changed"],
      [null, "RED", "changed"],
    ]);
    assert.ok(page.entries.every((entry) => entry.source === "teacher" && entry.actorName === "Анна Петрова" && entry.reference === null));
    // The cursor continues after the given entry, also inside one instant.
    const rest = await api.getProgressHistory("usr_timur", "num_112", page.entries[1]!.id);
    assert.deepEqual(rest.entries.map((entry) => entry.id), page.entries.slice(2).map((entry) => entry.id));

    // A number without history: an empty page with the header.
    const empty = await api.getProgressHistory("usr_timur", "num_204");
    assert.deepEqual(empty, { studentName: "Тимур Новиков", number: "204", topicTitle: "Квадратные функции", currentStatus: null, entries: [], nextCursor: null });
  });

  it("returns exactly 20 entries without a cursor when there is no 21st", async () => {
    const mock = createTestMock();
    await mock.signIn(ANNA);
    const api = mock.api.teacherStudents;
    for (let index = 0; index < 20; index += 1) {
      mock.clock.advance(1000);
      await api.setNumberStatus("usr_timur", "num_112", index % 2 === 0 ? "GREEN" : "RED");
    }
    const exact = await api.getProgressHistory("usr_timur", "num_112");
    assert.deepEqual([exact.entries.length, exact.nextCursor], [20, null]);
    mock.clock.advance(1000);
    await api.setNumberStatus("usr_timur", "num_112", null);
    const more = await api.getProgressHistory("usr_timur", "num_112");
    assert.deepEqual([more.entries.length, more.nextCursor], [20, more.entries[19]!.id]);
    assert.equal((await api.getProgressHistory("usr_timur", "num_112", more.nextCursor!)).entries.length, 1);
  });

  it("answers 400 paramsRequired, 404 historyNotFound and 429 with the endpoint's own texts", async () => {
    const mock = createTestMock();
    await mock.signIn(ANNA);
    const api = mock.api.teacherStudents;
    for (const [studentId, numberId] of [["", "num_118"], ["usr_ilya", ""], ["  ", "  "]] as const) {
      const error = await rejects(api.getProgressHistory(studentId, numberId), "paramsRequired", 400);
      assert.equal(error.message, ru.apiContent.progressHistory.paramsRequired);
    }
    const missing: [string, string, string | undefined][] = [
      ["usr_sofia", "num_118", undefined],
      ["usr_orphan", "num_118", undefined],
      ["usr_igor", "num_118", undefined],
      ["nope", "num_118", undefined],
      ["usr_ilya", "num_999999", undefined],
      ["usr_ilya", "num_118", "pse_nope"],
      // An entry of another number is not a cursor of this history.
      ["usr_ilya", "num_112", "pse_ilya_118_06"],
    ];
    for (const [studentId, numberId, cursor] of missing) {
      const error = await rejects(api.getProgressHistory(studentId, numberId, cursor), "historyNotFound", 404);
      assert.equal(error.message, ru.apiContent.progressHistory.notFound);
    }

    await mock.signIn(IGOR);
    await rejects(api.getProgressHistory("usr_ilya", "num_118"), "historyNotFound", 404);
    assert.equal((await api.getProgressHistory("usr_sofia", "num_301")).studentName, "Софья Орлова");

    mock.setLocale("en");
    assert.equal((await rejects(api.getProgressHistory("usr_ilya", "num_118"), "historyNotFound", 404)).message, en.apiContent.progressHistory.notFound);
    mock.api.controls.exhaust("api:progress-history", "usr_igor");
    const limited = await rejects(api.getProgressHistory("usr_sofia", "num_301"), "rateLimited", 429);
    assert.deepEqual([limited.message, limited.retryAfterSeconds], [en.apiCommon.rateLimited, 60]);
  });

  it("allows 90 reads per minute", async () => {
    const mock = createTestMock();
    await mock.signIn(ANNA);
    for (let index = 0; index < 90; index += 1) await mock.api.teacherStudents.getProgressHistory("usr_timur", "num_112");
    await rejects(mock.api.teacherStudents.getProgressHistory("usr_timur", "num_112"), "rateLimited", 429);
    mock.clock.advance(MINUTE_MS);
    await mock.api.teacherStudents.getProgressHistory("usr_timur", "num_112");
  });
});
