// Node's test runner and assert are typed by referencing only their declaration files: the project does not
// load `@types/node` globally (it would change DOM / React Native globals such as the timer return types).
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError } from "../src/api/errors";
import type { AnyApiErrorCode } from "../src/api/errors";
import type { DashboardRealtimeEvent, HomeworkNumberStatus, RealtimeEvent, SolutionVerdict } from "../src/api/types";
import { AI_BUDGET_WINDOW_MS } from "../src/api/types";
import { homeworkAssignmentLabel } from "../src/domain/homework-label";
import { decideAutoLessonResult } from "../src/domain/lesson-live";
import { DAY_MS, HOUR_MS, MINUTE_MS } from "../src/domain/moscow-time";
import { decideProgressChange } from "../src/domain/progress-policy";
import { classifySolutionCheckError } from "../src/domain/solution-check-error-text";
import { shouldReceiveRealtimeEvent } from "../src/mock/rules";
import { TEST_T0, createTestMock, type TestMock } from "../src/mock/testing";
import { failedCheckError, failureRefundsBudget, scriptHomeworkCheck, scriptLessonSubmission, scriptVerdict, selectFoundNumbers } from "../src/mock/verdict-script";

const T0 = Date.parse(TEST_T0);

/** Asserts that `work` throws an `ApiError` with this code and status, and returns it. */
function throwsApi(work: () => unknown, code: AnyApiErrorCode, status: number): ApiError {
  try {
    work();
  } catch (error) {
    assert.ok(error instanceof ApiError, `expected ApiError, got ${String(error)}`);
    assert.equal(error.code, code);
    assert.equal(error.status, status);
    return error;
  }
  throw new assert.AssertionError({ message: `expected "${code}" to be thrown` });
}

async function ready(options?: Parameters<typeof createTestMock>[0]): Promise<TestMock> {
  const mock = createTestMock(options);
  await mock.api.ready();
  return mock;
}

const user = (mock: TestMock, id: string) => mock.store.users.get(id)!;
const statusOf = (mock: TestMock, studentId: string, label: string) => mock.ctx.q.status(studentId, `num_${label}`);

describe("rules: roles and ownership", () => {
  it("tells no session, wrong role and developer-only apart", async () => {
    const mock = await ready();
    throwsApi(() => mock.ctx.auth.requireUser(), "sessionExpired", 401);
    throwsApi(() => mock.ctx.auth.requireDeveloper(), "sessionExpired", 401);
    assert.equal(mock.ctx.auth.currentUser(), null);

    await mock.signIn("teacher@example.com");
    assert.equal(mock.ctx.auth.requireUser().id, "usr_anna");
    assert.equal(mock.ctx.auth.requireStaff().id, "usr_anna");
    assert.equal(mock.ctx.auth.requireUser(["TEACHER", "DEVELOPER"]).id, "usr_anna");
    throwsApi(() => mock.ctx.auth.requireStudent(), "unauthorized", 403);
    assert.equal(throwsApi(() => mock.ctx.auth.requireDeveloper(), "developerRightsRequired", 403).message, "Нужны права разработчика.");

    await mock.signIn("dev@example.com");
    assert.equal(mock.ctx.auth.requireDeveloper().role, "DEVELOPER");
    throwsApi(() => mock.ctx.auth.requireTeacher(), "unauthorized", 403);
  });

  it("answers 404 with the entity code for a foreign resource, never 403", async () => {
    const mock = await ready();
    const anna = user(mock, "usr_anna");
    const igor = user(mock, "usr_igor");
    const dev = user(mock, "usr_dev");
    const { guard } = mock.ctx;

    // Students.
    assert.equal(guard.student(anna, "usr_ilya").id, "usr_ilya");
    assert.equal(throwsApi(() => guard.student(anna, "usr_sofia"), "studentNotFound", 404).message, "Ученик не найден.");
    throwsApi(() => guard.student(anna, "usr_orphan"), "studentNotFound", 404);
    throwsApi(() => guard.student(anna, "usr_igor"), "studentNotFound", 404);
    throwsApi(() => guard.student(anna, "missing"), "studentNotFound", 404);
    throwsApi(() => guard.student(anna, "usr_sofia", "studentOrNumberNotFound"), "studentOrNumberNotFound", 404);
    assert.equal(guard.student(igor, "usr_sofia").id, "usr_sofia");
    assert.equal(guard.student(dev, "usr_sofia").id, "usr_sofia");
    assert.equal(guard.student(dev, "usr_orphan").id, "usr_orphan");
    // A student never acts on a student through the staff guard — not even on themself.
    throwsApi(() => guard.student(user(mock, "usr_ilya"), "usr_ilya"), "studentNotFound", 404);

    // Groups.
    assert.equal(guard.group(anna, "grp_8a").name, "8А — алгебра");
    assert.equal(throwsApi(() => guard.group(anna, "grp_10b"), "groupNotFound", 404).message, "Группа не найдена.");
    assert.equal(guard.group(dev, "grp_10b").teacherId, "usr_igor");

    // Lessons and drafts: a foreign id and an id of the other kind are both "not found".
    assert.equal(guard.lesson(anna, "les_live", "LESSON").id, "les_live");
    assert.equal(throwsApi(() => guard.lesson(anna, "les_igor_1", "LESSON"), "lessonNotFound", 404).message, "Урок не найден.");
    throwsApi(() => guard.lesson(anna, "hp_ready", "LESSON"), "lessonNotFound", 404);
    assert.equal(throwsApi(() => guard.lesson(anna, "les_live", "HOMEWORK"), "draftNotFound", 404).message, "Черновик не найден.");
    throwsApi(() => guard.lesson(igor, "hp_ready", "HOMEWORK"), "draftNotFound", 404);
    // A lesson created by the developer is visible to the developer only.
    throwsApi(() => guard.lesson(anna, "les_dev_demo", "LESSON"), "lessonNotFound", 404);
    assert.equal(guard.lesson(dev, "les_dev_demo", "LESSON").teacherId, "usr_dev");
    assert.equal(guard.lesson(dev, "les_igor_1", "LESSON").id, "les_igor_1");

    // Participants and items.
    assert.equal(guard.participant(anna, "hp_ready", "lp_hp_ready_ilya").participant.studentId, "usr_ilya");
    throwsApi(() => guard.participant(anna, "hp_ready", "lp_les_live_artem"), "participantNotFound", 404);
    throwsApi(() => guard.participant(igor, "les_live", "lp_les_live_artem"), "participantNotFound", 404);
    assert.equal(guard.lessonItem(anna, "les_live", "lp_les_live_artem", "li_les_live_artem_010203").item.result, "SOLVED");
    throwsApi(() => guard.lessonItem(anna, "les_live", "lp_les_live_artem", "li_les_live_polina_010203"), "itemNotFound", 404);

    // Homework.
    assert.equal(guard.homeworkOfVisibleStudent(anna, "hw_ilya_done").student.id, "usr_ilya");
    assert.equal(throwsApi(() => guard.homeworkOfVisibleStudent(anna, "hw_sofia_1"), "homeworkNotFound", 404).message, "ДЗ не найдено.");
    assert.equal(guard.homeworkOfVisibleStudent(dev, "hw_orphan_1").assignment.id, "hw_orphan_1");
    assert.equal(guard.ownHomework(user(mock, "usr_ilya"), "hw_ilya_done").id, "hw_ilya_done");
    throwsApi(() => guard.ownHomework(user(mock, "usr_maria"), "hw_ilya_done"), "homeworkNotFound", 404);
    assert.equal(guard.ownLesson(user(mock, "usr_polina"), "les_live").participant.id, "lp_les_live_polina");
    throwsApi(() => guard.ownLesson(user(mock, "usr_maria"), "les_live"), "lessonNotFound", 404);
    throwsApi(() => guard.ownLesson(user(mock, "usr_ilya"), "hp_ready"), "lessonNotFound", 404);

    // Shared content.
    assert.equal(guard.topicWithNumbers("top_log").numbers.length, 12);
    throwsApi(() => guard.topic("missing"), "topicNotFound", 404);
    throwsApi(() => guard.number("missing"), "numberNotFound", 404);

    mock.setLocale("en");
    assert.equal(throwsApi(() => guard.student(anna, "usr_sofia"), "studentNotFound", 404).message, "Student not found.");
  });

  it("reads with the site's ordering", async () => {
    const mock = await ready();
    const { q } = mock.ctx;
    assert.deepEqual(q.studentsOfTeacher("usr_anna").map((row) => row.name), ["Артём Кузнецов", "Даша Белова", "Илья Смирнов", "Кирилл Зайцев", "Мария Волкова", "Полина Морозова", "Тимур Новиков"]);
    assert.equal(q.visibleStudents(user(mock, "usr_dev")).length, 10);
    assert.equal(q.visibleStudents(user(mock, "usr_olga")).length, 0);
    assert.deepEqual(q.groupMembers("grp_8a").map((row) => row.id), ["usr_artem", "usr_kirill", "usr_maria", "usr_polina"]);
    assert.deepEqual(q.topicsOrdered().map((topic) => topic.id), ["top_linear", "top_quadratic", "top_derivative", "top_log", "top_systems", "top_empty", "top_word"]);
    assert.deepEqual(q.numbersOfTopic("top_log").map((number) => number.number).slice(0, 3), ["010203", "010204", "010205"]);
    assert.deepEqual(q.participants("les_live").map((row) => row.studentId), ["usr_artem", "usr_kirill", "usr_polina"]);
    assert.deepEqual(q.items("lp_les_live_polina").map((item) => item.isExtra), [false, false, false, false, false, false, false, true, true]);
    assert.equal(q.lessonStatus(mock.store.lessons.get("les_live")!), "ACTIVE");
    assert.equal(q.homeworkChecks("hw_ilya_done").length, 3);
    assert.equal(q.latestHomeworkCheck("hw_ilya_done")!.status, "DONE");
    assert.equal(q.activeHomeworkCheck("hw_artem_running")!.status, "CHECKING");
    assert.equal(q.isHomeworkCompleted("hw_ilya_done"), true);
    assert.equal(q.isHomeworkCompleted("hw_ilya_overdue"), false);
    assert.equal(q.callsOfStudent("usr_polina")[0]!.outcome, "REACHED");
    assert.equal(q.groupOfStudent("usr_maria")!.id, "grp_8a");
    assert.equal(q.groupOfStudent("usr_ilya"), undefined);
    assert.equal(q.profile("usr_timur"), undefined);
  });
});

describe("rules: progress writing", () => {
  it("writes the status, the history event and the journal row for a teacher's mark", async () => {
    const mock = await ready();
    const anna = user(mock, "usr_anna");
    const journal = mock.store.auditLogs.size;
    mock.clock.advance(MINUTE_MS);

    const first = mock.ctx.progress.write({ source: "teacher", status: "GREEN", studentId: "usr_ilya", homeworkNumberId: "num_218", actor: anna });
    assert.deepEqual(first.decision, { write: true, requestedStatus: "GREEN", status: "GREEN", reason: "changed" });
    assert.equal(statusOf(mock, "usr_ilya", "218")!.status, "GREEN");
    assert.equal(statusOf(mock, "usr_ilya", "218")!.statusChangedAt, mock.ctx.nowIso());
    // The mirrored deadline of the homework is untouched.
    assert.equal(statusOf(mock, "usr_ilya", "218")!.deadlineAt, mock.store.homeworks.get("hw_ilya_today")!.deadlineAt);
    assert.equal(first.event.actorName, "Анна Петрова");
    assert.equal(first.event.previousStatus, null);

    // A repeated mark is recorded as a confirmation and bumps the time.
    mock.clock.advance(MINUTE_MS);
    const again = mock.ctx.progress.write({ source: "teacher", status: "GREEN", studentId: "usr_ilya", homeworkNumberId: "num_218", actor: anna });
    assert.equal(again.decision.reason, "reaffirmed");
    assert.equal(statusOf(mock, "usr_ilya", "218")!.statusChangedAt, mock.ctx.nowIso());

    // A manual clear keeps the row with its mark time.
    const cleared = mock.ctx.progress.write({ source: "teacher", status: null, studentId: "usr_ilya", homeworkNumberId: "num_218", actor: anna });
    assert.equal(cleared.decision.reason, "changed");
    assert.equal(cleared.row!.status, null);
    assert.ok(cleared.row!.statusChangedAt);

    assert.equal(mock.store.progressEvents.by("studentNumber", "usr_ilya|num_218").length, 3);
    const rows = mock.store.auditLogs.all().slice(journal);
    assert.equal(rows.length, 3);
    assert.ok(rows.every((row) => row.action === "progress.status" && row.category === "DATA" && row.actorId === "usr_anna"));
    assert.equal(rows[0]!.summary, "Отметка учителя: Без отметки → Решил. Статус изменён");
  });

  it("appends an event also when a homework check writes nothing", async () => {
    const mock = await ready();
    const startedAt = mock.ctx.nowDate();
    const write = (label: string, verdict: SolutionVerdict, checkStartedAt = startedAt) =>
      mock.ctx.progress.write({
        source: "homework_check",
        verdict,
        checkStartedAt,
        studentId: "usr_ilya",
        homeworkNumberId: `num_${label}`,
        references: { assignmentId: "hw_ilya_done", checkId: "chk_x" },
      });
    const events = mock.store.progressEvents.size;

    assert.equal(write("112", "CORRECT").decision.reason, "unchanged"); // GREEN stays GREEN
    assert.equal(write("113", "INCORRECT").decision.reason, "downgrade_blocked"); // YELLOW never drops to RED
    assert.equal(write("120", "UNCERTAIN").decision.reason, "uncertain");
    assert.deepEqual(write("118", "CORRECT").decision, { write: true, requestedStatus: "YELLOW", status: "YELLOW", reason: "changed" }); // RED → YELLOW
    // 124 was cleared by the teacher six days ago; a check started before that loses.
    assert.equal(write("124", "CORRECT", new Date(T0 - 7 * DAY_MS)).decision.reason, "newer_status");
    assert.equal(statusOf(mock, "usr_ilya", "124")!.status, null);

    assert.equal(mock.store.progressEvents.size, events + 5);
    const last = mock.store.progressEvents.all().slice(-1)[0]!;
    assert.deepEqual(last.context, { assignmentId: "hw_ilya_done", checkId: "chk_x", verdict: "CORRECT", checkStartedAt: new Date(T0 - 7 * DAY_MS).toISOString() });
    assert.equal(last.actorId, null);
    assert.equal(mock.store.auditLogs.all().slice(-1)[0]!.actorName, "Автопроверка");
  });

  it("mirrors lesson results, with SKIPPED over a real result clearing the colour", async () => {
    const mock = await ready();
    const anna = user(mock, "usr_anna");
    const base = { studentId: "usr_polina", homeworkNumberId: "num_010209", references: { lessonId: "les_live", itemId: "li_les_live_polina_010209" } };

    assert.equal(mock.ctx.progress.write({ ...base, source: "lesson_check", result: "NOT_SOLVED", verdict: "INCORRECT" }).row!.status, "RED");
    assert.equal(mock.ctx.progress.write({ ...base, source: "lesson_check", result: null, verdict: "UNCERTAIN" }).decision.reason, "uncertain");
    assert.equal(mock.ctx.progress.write({ ...base, source: "lesson_check", result: null, verdict: "CORRECT" }).decision.reason, "lesson_result_preserved");
    assert.equal(mock.ctx.progress.write({ ...base, source: "lesson_teacher", result: "PARTIAL", previousResult: "NOT_SOLVED", actor: anna }).row!.status, "YELLOW");
    assert.equal(mock.ctx.progress.write({ ...base, source: "lesson_teacher", result: "SKIPPED", previousResult: null, actor: anna }).decision.reason, "no_status");
    const cleared = mock.ctx.progress.write({ ...base, source: "lesson_teacher", result: "SKIPPED", previousResult: "PARTIAL", actor: anna });
    assert.deepEqual([cleared.decision.write, cleared.row!.status], [true, null]);
    assert.equal(mock.ctx.progress.write({ ...base, source: "lesson_end", result: "SKIPPED" }).decision.reason, "no_status");
    assert.equal(mock.ctx.progress.write({ ...base, source: "lesson_end", result: "NOT_SOLVED" }).row!.status, "RED");
  });

  it("never deletes a row that carries a mark time, a note or a deadline", async () => {
    const mock = await ready();
    const empty = mock.ctx.progress.ensureRow("usr_ilya", "num_540");
    assert.equal(mock.ctx.progress.ensureRow("usr_ilya", "num_540").id, empty.id);
    mock.ctx.progress.cleanupEmptyRows("usr_ilya", ["num_540", "num_124", "num_120", "num_302"]);
    assert.equal(statusOf(mock, "usr_ilya", "540"), undefined);
    assert.ok(statusOf(mock, "usr_ilya", "124"), "a manual clear survives");
    assert.ok(statusOf(mock, "usr_ilya", "120"), "a note survives");
    assert.ok(statusOf(mock, "usr_ilya", "302"), "a mirrored deadline survives");
  });
});

describe("rules: homework issue (90-addendum-6 §6.1)", () => {
  const deadline = new Date(T0 + 5 * DAY_MS).toISOString();
  const issue = (mock: TestMock, topicId: string, labels: string[], extra: Partial<Parameters<TestMock["ctx"]["homework"]["issue"]>[0]> = {}) =>
    mock.ctx.homework.issue({ studentId: "usr_ilya", issuedBy: user(mock, "usr_anna"), topicId, homeworkNumberIds: labels.map((label) => `num_${label}`), deadlineAt: deadline, title: null, ...extra });

  it("refuses solved numbers and creates nothing", async () => {
    const mock = await ready();
    const before = JSON.stringify(mock.store.snapshot());

    const one = issue(mock, "top_linear", ["112", "120"]);
    assert.deepEqual(one, { ok: false, code: "solvedConflict", status: 409, conflictNumbers: ["112"], message: "Номер 112 ученик уже решил — повторно его не выдаём. Уберите его из набора или сбросьте статус на карточке ученика." });

    const many = issue(mock, "top_linear", ["112", "113", "121", "120"]);
    assert.ok(!many.ok);
    assert.deepEqual(many.conflictNumbers, ["112", "113", "121"]);
    assert.match(many.message, /^Номера 112, 113, 121 ученик уже решил — повторно их не выдаём\./);

    // Labels with leading zeros: numeric order, zeros kept.
    const zeros = issue(mock, "top_log", ["010204", "010203", "010208"]);
    assert.ok(!zeros.ok);
    assert.deepEqual(zeros.conflictNumbers, ["010203", "010204"]);

    assert.equal(JSON.stringify(mock.store.snapshot()), before);

    const error = mock.ctx.homework.toError(many);
    assert.deepEqual([error.status, error.code], [409, "solvedConflict"]);
    assert.deepEqual(error.params, { numbers: "112, 113, 121" });
    assert.deepEqual(error.details, { conflictNumbers: ["112", "113", "121"] });

    mock.setLocale("en");
    const en = issue(mock, "top_linear", ["112", "120"]);
    assert.ok(!en.ok);
    assert.match(en.message, /^The student has already solved problem 112/);
  });

  it("issues RED and unmarked numbers again, even when they belong to another homework", async () => {
    const mock = await ready();
    const events: RealtimeEvent[] = [];
    await mock.signIn("ilya@example.com");
    const unsubscribe = mock.api.shell.subscribeRealtime((event) => events.push(event));
    await Promise.resolve();
    await Promise.resolve();
    const notifications = mock.store.notifications.by("userId", "usr_ilya").length;
    mock.clock.advance(MINUTE_MS);

    const result = issue(mock, "top_linear", ["118", "120", "118"]);
    assert.ok(result.ok);
    assert.deepEqual(result.homeworkNumberIds, ["num_118", "num_120"]);
    assert.equal(result.deadlineAt, deadline);

    // A second assignment with the same numbers: «ДЗ 4» (the fourth linear assignment of Илья).
    const assignment = mock.store.homeworks.get(result.assignmentId)!;
    assert.equal(assignment.title, null);
    assert.equal(homeworkAssignmentLabel({ title: assignment.title, orderInTopic: mock.ctx.q.homeworkOrderInTopic(assignment) }, "ru"), "ДЗ 4");
    assert.equal(mock.store.homeworkNumbers.by("homeworkNumberId", "num_118").filter((link) => mock.store.homeworks.get(link.assignmentId)!.studentId === "usr_ilya").length, 2);

    // The mirror keeps the NEAREST deadline: hw_ilya_overdue's (two days ago) is earlier than the new one.
    assert.equal(statusOf(mock, "usr_ilya", "118")!.deadlineAt, mock.store.homeworks.get("hw_ilya_overdue")!.deadlineAt);
    assert.equal(statusOf(mock, "usr_ilya", "118")!.status, "RED");

    const created = mock.store.notifications.by("userId", "usr_ilya").slice(notifications);
    assert.equal(created.length, 1);
    assert.equal(created[0]!.type, "homework-assigned");
    assert.deepEqual(created[0]!.params, { variant: "assigned", topic: "Линейные уравнения", numbers: "118, 120", count: 2, deadlineAt: deadline });
    assert.equal(created[0]!.href, "/student/homeworks");
    assert.equal(created[0]!.title, "Учитель выдал ДЗ по теме «Линейные уравнения»");

    await Promise.resolve();
    await Promise.resolve();
    assert.deepEqual(events.map((event) => [event.kind, "studentId" in event ? event.studentId : null]), [["student-deadlines-changed", "usr_ilya"]]);
    unsubscribe();

    // After removing the solved number the refused set goes through (issue.conflict.fix).
    assert.ok(!issue(mock, "top_linear", ["112", "120"]).ok);
    const fixed = issue(mock, "top_linear", ["120"], { title: `  ${"т".repeat(250)}  ` });
    assert.ok(fixed.ok);
    assert.equal(mock.store.homeworks.get(fixed.assignmentId)!.title!.length, 200);

    // Cancelling the new homework restores the mirror from what is left.
    mock.ctx.cascade.deleteHomework(result.assignmentId);
    mock.ctx.cascade.deleteHomework(fixed.assignmentId);
    mock.ctx.homework.recomputeDeadlines("usr_ilya", ["num_118", "num_120"]);
    assert.equal(statusOf(mock, "usr_ilya", "120")!.deadlineAt, mock.store.homeworks.get("hw_ilya_overdue")!.deadlineAt);
    mock.ctx.cascade.deleteHomework("hw_ilya_overdue");
    mock.ctx.homework.recomputeDeadlines("usr_ilya", ["num_118", "num_120", "num_124"]);
    assert.equal(statusOf(mock, "usr_ilya", "118")!.deadlineAt, null);
    assert.equal(statusOf(mock, "usr_ilya", "124")!.deadlineAt, null);
    assert.ok(statusOf(mock, "usr_ilya", "124"), "the cleared row survives the cancellation");
  });

  it("checks the shape first, then the student and the topic of every number", async () => {
    const mock = await ready();
    const invalid = (extra: Partial<Parameters<TestMock["ctx"]["homework"]["issue"]>[0]>, labels = ["120"]) => issue(mock, "top_linear", labels, extra);
    for (const result of [invalid({ studentId: " " }), invalid({ topicId: "" }), invalid({}, []), invalid({ deadlineAt: "not a date" }), invalid({ deadlineAt: null })]) {
      assert.deepEqual(result, { ok: false, code: "invalidData", status: 400, message: "Некорректные данные для ДЗ." });
    }

    const notFound = { ok: false, code: "studentOrNumberNotFound", status: 404, message: "Ученик или номер задания не найден." };
    assert.deepEqual(invalid({ studentId: "usr_sofia" }), notFound); // another teacher's student
    assert.deepEqual(invalid({ studentId: "usr_anna" }), notFound); // not a student
    assert.deepEqual(issue(mock, "top_linear", ["120", "204"]), notFound); // 204 belongs to another topic
    assert.deepEqual(issue(mock, "top_linear", ["120", "nope"]), notFound);
    // A developer may issue to any student, an unattributed one included.
    assert.ok(invalid({ studentId: "usr_sofia", issuedBy: user(mock, "usr_dev") }).ok);
    assert.ok(invalid({ studentId: "usr_orphan", issuedBy: user(mock, "usr_dev") }, ["120"]).ok);
    assert.equal(mock.ctx.homework.toError(invalid({ studentId: "usr_sofia" }) as never).code, "studentOrNumberNotFound");
  });

  it("stamps the participant of a draft in the same transaction and refuses a second issue", async () => {
    const mock = await ready();
    const viaDraft = (participantId: string, studentId: string, labels: string[]) =>
      mock.ctx.homework.issue({ studentId, issuedBy: user(mock, "usr_anna"), topicId: "top_linear", homeworkNumberIds: labels.map((label) => `num_${label}`), deadlineAt: deadline, title: "ДЗ из черновика", planParticipantId: participantId });

    // draft.issue.mixed, per participant: Кирилл is issued, Артём conflicts on 127 and 130.
    const kirill = viaDraft("lp_hp_conflict_kirill", "usr_kirill", ["112", "113", "118"]);
    assert.ok(kirill.ok);
    const stamped = mock.store.participants.get("lp_hp_conflict_kirill")!;
    assert.equal(stamped.issuedAssignmentId, kirill.assignmentId);
    assert.equal(stamped.issuedAt, TEST_T0);
    assert.ok(statusOf(mock, "usr_kirill", "113") && statusOf(mock, "usr_kirill", "118"));
    assert.equal(statusOf(mock, "usr_kirill", "112")!.status, "RED");

    const artem = viaDraft("lp_hp_conflict_artem", "usr_artem", ["120", "124", "127", "130"]);
    assert.ok(!artem.ok);
    assert.deepEqual([artem.code, artem.conflictNumbers], ["solvedConflict", ["127", "130"]]);
    assert.equal(mock.store.participants.get("lp_hp_conflict_artem")!.issuedAssignmentId, null);

    // A second click: everything is rolled back, no duplicate homework, no second notification.
    const homeworks = mock.store.homeworks.size;
    const notifications = mock.store.notifications.size;
    const again = viaDraft("lp_hp_conflict_kirill", "usr_kirill", ["112", "113", "118"]);
    assert.deepEqual(again, { ok: false, code: "alreadyIssued", status: 409, message: "Это ДЗ ученику уже выдано." });
    assert.equal(mock.store.homeworks.size, homeworks);
    assert.equal(mock.store.notifications.size, notifications);
    assert.equal(mock.ctx.homework.toError(again as never).code, "homeworkAlreadyIssued");

    // A stale stamp (the assignment was cancelled) still counts as issued.
    const stale = mock.ctx.homework.issue({ studentId: "usr_polina", issuedBy: user(mock, "usr_anna"), topicId: "top_quadratic", homeworkNumberIds: ["num_223", "num_226"], deadlineAt: deadline, title: null, planParticipantId: "lp_hp_issued_polina" });
    assert.ok(!stale.ok);
    assert.equal(stale.code, "alreadyIssued");

    // draft.issue.fixByStatus: after the teacher clears 127 and 130 the whole set is issued.
    for (const label of ["127", "130"]) mock.ctx.progress.write({ source: "teacher", status: null, studentId: "usr_artem", homeworkNumberId: `num_${label}`, actor: user(mock, "usr_anna") });
    assert.ok(viaDraft("lp_hp_conflict_artem", "usr_artem", ["120", "124", "127", "130"]).ok);
  });
});

describe("rules: lazy lesson finalisation", () => {
  it("closes the results of a lesson that ended inside the 48-hour window, once", async () => {
    const mock = await ready();
    await mock.signIn("teacher@example.com");
    const events: RealtimeEvent[] = [];
    mock.api.shell.subscribeRealtime((event) => events.push(event));
    await Promise.resolve();
    await Promise.resolve();
    const journal = mock.store.auditLogs.size;

    mock.ctx.lessons.finalizeDue({ teacherId: "usr_anna" });

    const lesson = mock.store.lessons.get("les_g_unfinalized")!;
    assert.equal(lesson.status, "FINISHED");
    const results = (participantId: string) => Object.fromEntries(mock.ctx.q.items(participantId).map((item) => [mock.store.numbers.get(item.homeworkNumberId)!.number, item.result]));
    // Полина: handed in without a pass → NOT_SOLVED; never handed in → SKIPPED; marked ones untouched.
    assert.deepEqual(results("lp_les_g_unfinalized_polina"), { "301": "SOLVED", "302": "NOT_SOLVED", "305": "SKIPPED", "308": "PARTIAL", "310": "SKIPPED", "312": "SKIPPED" });
    assert.equal(mock.store.participants.get("lp_les_g_unfinalized_polina")!.attendance, "PRESENT");
    assert.equal(statusOf(mock, "usr_polina", "302")!.status, "RED");
    assert.equal(statusOf(mock, "usr_polina", "305"), undefined);
    // Кирилл never opened the lesson → ABSENT, everything SKIPPED, no status touched.
    assert.equal(mock.store.participants.get("lp_les_g_unfinalized_kirill")!.attendance, "ABSENT");
    assert.ok(mock.ctx.q.items("lp_les_g_unfinalized_kirill").every((item) => item.result === "SKIPPED"));
    assert.equal(statusOf(mock, "usr_kirill", "301")!.status, "RED");
    assert.equal(statusOf(mock, "usr_kirill", "301")!.statusChangedAt, new Date(T0 - 9 * DAY_MS + 6 * HOUR_MS).toISOString());

    // One history event per changed item, written by the system.
    const lessonEnd = mock.store.progressEvents.filter((event) => event.source === "lesson_end" && event.context.lessonId === "les_g_unfinalized");
    assert.equal(lessonEnd.length, 4 + 6);
    assert.ok(lessonEnd.every((event) => event.actorId === null && event.actorName === null));
    assert.deepEqual(lessonEnd.filter((event) => event.decision === "changed").map((event) => event.homeworkNumberId), ["num_302"]);

    const auto = mock.store.auditLogs.all().slice(journal).filter((row) => row.action === "lesson.auto_results");
    assert.equal(auto.length, 1);
    assert.equal(auto[0]!.summary, "Итоги закрыты автоматически: не решил — 1, не успел — 9, отметок посещаемости — 1");
    // The site writes lesson.auto_results with no actor (the journal shows «—»); the system name is only
    // on the per-number progress.status rows of source lesson_end.
    assert.deepEqual([auto[0]!.actorId, auto[0]!.actorName, auto[0]!.actorRole], [null, null, null]);
    const statusRows = mock.store.auditLogs.all().slice(journal).filter((row) => row.action === "progress.status");
    assert.ok(statusRows.length > 0);
    assert.ok(statusRows.every((row) => row.actorName === "Автозавершение урока" && row.actorId === null));

    await Promise.resolve();
    await Promise.resolve();
    assert.deepEqual(events.filter((event) => event.kind === "lesson-activity").map((event) => event.lessonId), ["les_g_unfinalized"]);

    // Idempotent; lessons that are running, planned or without a time are left alone.
    const snapshot = JSON.stringify(mock.store.snapshot());
    mock.ctx.lessons.finalizeDue({ teacherId: "usr_anna" });
    mock.ctx.lessons.finalizeDue({});
    mock.ctx.lessons.finalizeDue({ studentId: "usr_polina" });
    assert.deepEqual(mock.ctx.lessons.finalize("les_g_unfinalized"), { finalized: false, notSolved: 0, skipped: 0, attendance: 0 });
    assert.equal(JSON.stringify(mock.store.snapshot()), snapshot);
    assert.equal(mock.store.lessons.get("les_live")!.status, "PLANNED");
    assert.equal(mock.store.lessons.get("les_unscheduled")!.status, "PLANNED");
  });

  it("finalises the live lesson after it ends and leaves a running check alone", async () => {
    const mock = await ready();
    mock.clock.advance(66 * MINUTE_MS); // les_live ends at T0 + 65 min
    mock.ctx.lessons.finalizeDue({ studentId: "usr_artem" });

    const lesson = mock.store.lessons.get("les_live")!;
    assert.equal(lesson.status, "FINISHED");
    // Артём's extra #1 is still being checked: its result is left to the check; extra #2 was never handed in.
    assert.equal(mock.store.lessonItems.get("li_les_live_artem_010212")!.result, null);
    assert.equal(mock.store.lessonItems.get("li_les_live_artem_010213")!.result, "SKIPPED");
    // Полина: UNCERTAIN and FAILED submissions count as "handed in, not passed"; the pending one waits.
    assert.equal(mock.store.lessonItems.get("li_les_live_polina_010206")!.result, "NOT_SOLVED");
    assert.equal(mock.store.lessonItems.get("li_les_live_polina_010207")!.result, "NOT_SOLVED");
    assert.equal(mock.store.lessonItems.get("li_les_live_polina_010208")!.result, null);
    assert.equal(mock.store.lessonItems.get("li_les_live_polina_010209")!.result, "SKIPPED");
    assert.equal(mock.store.participants.get("lp_les_live_kirill")!.attendance, "ABSENT");
    assert.equal(mock.store.participants.get("lp_les_live_artem")!.attendance, "PRESENT");
  });

  it("does not touch a lesson that ended more than 48 hours ago", async () => {
    const mock = await ready();
    mock.clock.advance(3 * DAY_MS);
    mock.ctx.lessons.finalizeDue({});
    // Both ended long before the window (yesterday's lesson is now 4 days old; the live one 3 days).
    assert.equal(mock.store.lessons.get("les_g_unfinalized")!.status, "PLANNED");
    assert.equal(mock.store.lessons.get("les_live")!.status, "PLANNED");
    assert.equal(mock.store.lessonItems.get("li_les_g_unfinalized_polina_305")!.result, null);
  });
});

describe("rules: deferred jobs", () => {
  it("starts the timers of a seeded in-flight row at its first read and runs the handlers when due", async () => {
    const mock = await ready();
    const ran: string[] = [];
    mock.ctx.jobs.handle("lessonSubmission.begin", (job) => {
      ran.push(`begin:${job.refId}@${mock.clock.now() - T0}`);
      mock.store.submissions.update(job.refId, { status: "CHECKING" });
    });
    mock.ctx.jobs.handle("lessonSubmission.finish", (job) => {
      ran.push(`finish:${job.refId}@${mock.clock.now() - T0}`);
      mock.store.submissions.update(job.refId, { status: "DONE", activeSlot: null, verdict: "INCORRECT" });
    });
    const submission = "sub_les_live_polina_010208_1";

    // Nothing happens before the first read, however long the app was closed.
    mock.clock.advance(20_000);
    mock.ctx.jobs.runDue();
    assert.deepEqual(ran, []);
    assert.equal(mock.store.submissions.get(submission)!.status, "PENDING");

    mock.ctx.jobs.touch(submission);
    mock.ctx.jobs.touch(submission); // a second read does not restart the timer
    mock.clock.advance(999);
    mock.ctx.jobs.runDue();
    assert.deepEqual(ran, []);
    mock.clock.advance(1);
    mock.ctx.jobs.runDue();
    assert.deepEqual(ran, [`begin:${submission}@21000`]);
    mock.clock.advance(7000);
    // The client runs due jobs at the start of every call.
    await mock.api.shell.getMeta();
    assert.deepEqual(ran, [`begin:${submission}@21000`, `finish:${submission}@28000`]);
    assert.equal(mock.store.submissions.get(submission)!.status, "DONE");
    assert.equal(mock.ctx.jobs.pending(submission).length, 0);
  });

  it("keeps jobs without a handler, runs follow-ups, and drops the job of a failing handler", async () => {
    const mock = await ready();
    // No handler for the kind yet: the job waits in the store (so a member can be implemented later).
    mock.ctx.jobs.schedule("test.unhandled", "chk_artem_running_1", 1000);
    mock.clock.advance(60_000);
    mock.ctx.jobs.runDue();
    assert.equal(mock.ctx.jobs.pending("chk_artem_running_1", "test.unhandled").length, 1);
    // A seeded in-flight row keeps its waiting job until the row is first read.
    assert.deepEqual(mock.ctx.jobs.pending("chk_artem_running_1", "homeworkCheck.finish").map((job) => [job.state, job.dueAt]), [["waiting", null]]);

    const order: string[] = [];
    mock.ctx.jobs.handle("test.first", (job) => {
      order.push(job.kind);
      // A follow-up that is already due runs in the same pass.
      mock.ctx.jobs.schedule("test.second", job.refId, 0, { from: job.id });
    });
    mock.ctx.jobs.handle("test.second", (job) => {
      order.push(`${job.kind}:${String(job.payload.from !== undefined)}`);
    });
    mock.ctx.jobs.handle("test.broken", () => {
      mock.store.users.update("usr_ilya", { name: "half-applied" });
      throw new Error("handler failed");
    });
    mock.ctx.jobs.schedule("test.broken", "usr_ilya", 1000);
    mock.ctx.jobs.schedule("test.first", "usr_ilya", 2000);
    mock.clock.advance(5000);
    mock.ctx.jobs.runDue();

    assert.deepEqual(order, ["test.first", "test.second:true"]);
    // The failing handler lost its job and its partial change, and did not block the others.
    assert.equal(mock.store.users.get("usr_ilya")!.name, "Илья Смирнов");
    assert.equal(mock.ctx.jobs.pending("usr_ilya").length, 0);
    assert.equal(mock.ctx.jobs.lastError()!.job.kind, "test.broken");

    mock.ctx.jobs.schedule("test.first", "usr_maria", 10_000);
    mock.ctx.jobs.cancel("usr_maria");
    assert.equal(mock.ctx.jobs.pending("usr_maria").length, 0);
    assert.deepEqual([mock.ctx.timings.checkBeginMs, mock.ctx.timings.checkFinishMs, [0, 1, 2, 3].map(mock.ctx.timings.planGenerationMs)], [1000, 8000, [5000, 6000, 7000, 5000]]);
  });
});

describe("rules: limiter (90-addendum-3 §9, 90-addendum-6 §7.3)", () => {
  it("counts in fixed windows: a refused hit stays, the boundary resets lazily, releases are bounded", async () => {
    const mock = await ready({ start: T0 + 20_000 });
    const { limits } = mock.ctx;
    const consume = () => limits.consumeFixed("test:fixed", "u1", 2, 60_000);

    assert.deepEqual(consume(), { allowed: true, remaining: 1, retryAfterMs: 0, resetAt: T0 + 60_000 });
    assert.equal(consume().remaining, 0);
    assert.deepEqual(consume(), { allowed: false, remaining: 0, retryAfterMs: 40_000, resetAt: T0 + 60_000 });
    // The increment is stored even when the call is refused.
    assert.equal(mock.store.limiterBuckets.get("test:fixed|u1")!.hits, 3);
    // Another identifier has its own bucket.
    assert.equal(limits.consumeFixed("test:fixed", "u2", 2, 60_000).allowed, true);

    limits.releaseFixed("test:fixed", "u1", 60_000, 2);
    assert.equal(mock.store.limiterBuckets.get("test:fixed|u1")!.hits, 1);
    limits.releaseFixed("test:fixed", "u1", 60_000, 5); // more than there is: a no-op
    limits.releaseFixed("test:fixed", "u1", 60_000, 0);
    assert.equal(mock.store.limiterBuckets.get("test:fixed|u1")!.hits, 1);

    mock.clock.advance(39_999);
    assert.equal(consume().allowed, true);
    assert.equal(consume().allowed, false);
    mock.clock.advance(1);
    // A release that arrives after the boundary finds nothing to give back; the next consume starts at 1.
    limits.releaseFixed("test:fixed", "u1", 60_000, 1);
    assert.deepEqual(consume(), { allowed: true, remaining: 1, retryAfterMs: 0, resetAt: T0 + 120_000 });
    limits.reset("test:fixed", "u1");
    assert.equal(mock.store.limiterBuckets.get("test:fixed|u1"), undefined);
  });

  it("slides for the login limiters: a refused attempt is not recorded", async () => {
    const mock = await ready();
    const { limits } = mock.ctx;
    const consume = () => limits.consumeSliding("test:sliding", "x", 2, 10_000);
    assert.equal(consume().allowed, true);
    mock.clock.advance(4000);
    assert.equal(consume().allowed, true);
    mock.clock.advance(1000);
    assert.deepEqual(consume(), { allowed: false, remaining: 0, retryAfterMs: 5000, resetAt: T0 + 10_000 });
    assert.equal(mock.store.limiterBuckets.get("test:sliding|x")!.stamps.length, 2);
    mock.clock.advance(5000);
    assert.equal(consume().allowed, true);
    assert.equal(consume().allowed, false);
  });

  it("enforces the per-user scopes of RATE_LIMITS and shares a bucket between sibling scopes", async () => {
    const mock = await ready();
    await mock.signIn("teacher@example.com");
    const { limits } = mock.ctx;

    for (let call = 0; call < 10; call += 1) limits.enforce("api:homework-plan");
    const refused = throwsApi(() => limits.enforce("api:homework-plan"), "rateLimited", 429);
    assert.equal(refused.retryAfterSeconds, 60);
    // The site uses ONE scope with two limits: the same counter, compared with 30 for issue / delete.
    assert.doesNotThrow(() => limits.enforce("api:homework-plan#issue-delete"));
    assert.equal(mock.store.limiterBuckets.get("api:homework-plan|usr_anna")!.hits, 12);

    // A limit that lives in the settings is read on every call.
    assert.equal(limits.check("api:homework-checks", "usr_ilya").remaining, 9);
    mock.store.patchSettings({ aiPerStudentHourlyLimit: 1 });
    assert.equal(limits.check("api:homework-checks", "usr_ilya").allowed, false);
    // An explicit identifier and a custom text.
    limits.exhaust("api:parent-calls", "usr_anna");
    assert.equal(throwsApi(() => limits.enforce("api:parent-calls", { message: (dict) => dict.students.accounts.notices.rateLimited }), "rateLimited", 429).message, "Слишком много попыток создать аккаунты за короткое время. Подождите несколько минут.");
    assert.doesNotThrow(() => limits.enforce("api:parent-calls", { identifier: "usr_igor" }));
  });

  it("keeps the three daily AI budgets in windows aligned to 00:00 UTC", async () => {
    const mock = await ready({ start: Date.parse("2026-11-16T23:59:58.000Z") });
    const { limits } = mock.ctx;
    mock.store.patchSettings({ aiPlanDailyLimit: 3, aiDailyLimit: 2 });

    // Plans: reserve all participants at once; a refusal is given back.
    assert.equal(limits.consumeBudget("api:ai-plans:global", 2).allowed, true);
    const refused = limits.consumeBudget("api:ai-plans:global", 2);
    assert.deepEqual([refused.allowed, refused.retryAfterMs, refused.resetAt], [false, 2000, Date.parse("2026-11-17T00:00:00.000Z")]);
    limits.releaseBudget("api:ai-plans:global", 2);
    assert.equal(limits.consumeBudget("api:ai-plans:global", 1).allowed, true);
    assert.equal(limits.consumeBudget("api:ai-plans:global", 1).allowed, false);

    // Checks: the budgets are independent, and the demo control fills one for the current window.
    assert.equal(limits.consumeBudget("api:homework-checks:global").allowed, true);
    mock.api.controls.exhaust("api:lesson-checks:global", "global");
    assert.equal(limits.consumeBudget("api:lesson-checks:global").allowed, false);
    assert.equal(limits.consumeBudget("api:homework-checks:global").allowed, true);
    assert.equal(limits.consumeBudget("api:homework-checks:global").allowed, false);

    // Crossing 00:00 UTC makes the next request succeed — no timer involved.
    mock.clock.advance(2000);
    assert.equal(limits.consumeBudget("api:ai-plans:global", 3).allowed, true);
    assert.equal(limits.consumeBudget("api:lesson-checks:global").allowed, true);
    assert.equal(limits.consumeBudget("api:homework-checks:global").resetAt, Date.parse("2026-11-17T00:00:00.000Z") + AI_BUDGET_WINDOW_MS);
  });

  it("lists buckets and pins for the demo screen", async () => {
    const mock = await ready();
    mock.api.controls.exhaust("login:ip", "mock-device");
    mock.api.controls.exhaust("custom:scope", "abc", { limit: 4, windowMs: 30_000 });
    assert.throws(() => mock.api.controls.exhaust("unknown:scope", "abc"), /unknown scope/);
    const rows = mock.api.controls.listLimiters();
    assert.deepEqual(rows.find((row) => row.scope === "login:ip"), { scope: "login:ip", identifier: "mock-device", kind: "sliding", hits: 25, resetAt: new Date(T0 + 10 * MINUTE_MS).toISOString(), pinned: false });
    assert.deepEqual(rows.find((row) => row.scope === "custom:scope"), { scope: "custom:scope", identifier: "abc", kind: "fixed", hits: 4, resetAt: new Date(T0 + 30_000).toISOString(), pinned: false });
    assert.deepEqual(rows.filter((row) => row.pinned).map((row) => row.identifier).sort(), ["mock-device:locked@example.com", "usr_egor"]);
    mock.api.controls.clearLimiters();
    assert.deepEqual(mock.api.controls.listLimiters().map((row) => row.pinned), [true, true]);
  });
});

describe("rules: files, notifications, realtime filter", () => {
  it("applies the read-access matrix of GET /files/{fileId}", async () => {
    const mock = await ready();
    const { files } = mock.ctx;
    const can = (userId: string, fileId: string) => files.canRead(user(mock, userId), fileId);
    const ilyaPhoto = mock.store.homeworkPhotos.by("assignmentId", "hw_ilya_open")[0]!.fileId;
    const ilyaCheckPhoto = mock.store.homeworkCheckPhotos.by("checkId", "chk_ilya_done_3")[0]!.fileId;
    const lessonPhoto = mock.store.submissionPhotos.by("submissionId", "sub_les_live_polina_010203_1")[0]!.fileId;
    const sofiaLessonless = mock.store.files.insert({ ...mock.store.files.get(ilyaPhoto)!, id: "file_sofia_photo", uploadedById: "usr_sofia" });
    mock.store.homeworkPhotos.insert({ id: "hwp_sofia", assignmentId: "hw_sofia_1", fileId: sofiaLessonless.id, createdAt: TEST_T0 });

    // Topic files: theory and homework for everyone, the answers file never for a student.
    for (const who of ["usr_ilya", "usr_anna", "usr_igor", "usr_dev"]) {
      assert.equal(can(who, "file_linear_theory"), true, who);
      assert.equal(can(who, "file_quadratic_homework"), true, who);
    }
    assert.equal(can("usr_ilya", "file_log_answers"), false);
    assert.equal(can("usr_anna", "file_log_answers"), true);

    // Solution photos: the student's own, the owning teacher, the developer.
    assert.equal(can("usr_ilya", ilyaPhoto), true);
    assert.equal(can("usr_ilya", ilyaCheckPhoto), true);
    assert.equal(can("usr_maria", ilyaPhoto), false);
    assert.equal(can("usr_anna", ilyaPhoto), true);
    assert.equal(can("usr_igor", ilyaPhoto), false);
    assert.equal(can("usr_dev", ilyaPhoto), true);
    assert.equal(can("usr_polina", lessonPhoto), true);
    assert.equal(can("usr_artem", lessonPhoto), false);
    assert.equal(can("usr_anna", lessonPhoto), true);
    assert.equal(can("usr_anna", sofiaLessonless.id), false);
    assert.equal(can("usr_igor", sofiaLessonless.id), true);
    assert.equal(can("usr_anna", "missing"), false);

    // The entry point of the mock FileService.
    throwsApi(() => files.resolveForRead("file_linear_theory"), "sessionExpired", 401);
    assert.equal(files.lookup("file_linear_theory"), null);
    await mock.signIn("ilya@example.com");
    assert.equal(files.resolveForRead("file_linear_theory").sample, "pdfShort");
    // The lookup the mock FileService is wired to: metadata + sample, or null — never an exception.
    assert.deepEqual(files.lookup("file_quadratic_theory"), { mimeType: "application/pdf", originalName: "quadratic-functions-theory.pdf", size: 1_468_006, sample: "pdfLong" });
    assert.equal(files.lookup("file_log_answers"), null);
    assert.equal(files.lookup("missing"), null);
    assert.equal(throwsApi(() => files.resolveForRead("file_log_answers"), "fileNotFound", 404).message, "Файл не найден или был удалён.");
    throwsApi(() => files.resolveForRead("missing"), "fileNotFound", 404);

    // Projections and uploads.
    assert.deepEqual(files.ref("file_linear_theory"), { id: "file_linear_theory", originalName: "linear-equations-theory.pdf", mimeType: "application/pdf", size: 49_152 });
    assert.equal(files.storedRef("file_linear_theory")!.uploadedAt, mock.store.files.get("file_linear_theory")!.uploadedAt);
    assert.equal(files.ref(null), null);
    const uploaded = files.createFromUpload({ uri: "file:///documents/IMG_1.jpg", name: "IMG_1.jpg", mimeType: "image/jpeg", size: 1234 }, "usr_ilya");
    assert.deepEqual([uploaded.sample, uploaded.localUri, uploaded.size], [null, "file:///documents/IMG_1.jpg", 1234]);
    mock.store.homeworkPhotos.insert({ id: "hwp_uploaded", assignmentId: "hw_ilya_open", fileId: uploaded.id, createdAt: TEST_T0 });
    assert.deepEqual(files.lookup(uploaded.id), { mimeType: "image/jpeg", originalName: "IMG_1.jpg", size: 1234 });
    mock.store.homeworkPhotos.delete("hwp_uploaded");
    assert.equal(files.removeIfUnreferenced("file_linear_theory"), false);
    assert.equal(files.removeIfUnreferenced(uploaded.id), true);
    assert.equal(files.get(uploaded.id), undefined);
  });

  it("hands out sample documents and reports picked files through the device hooks", async () => {
    const mock = await ready();
    assert.equal(await mock.ctx.documents.download("studentReport", "otchet.pdf"), "mock-sample://pdfShort");
    assert.equal(mock.ctx.documents.url("lessonHandout", { lessonId: "les_live", answers: "0" }), "mock-sample://pdfLong?kind=lessonHandout&lessonId=les_live&answers=0");

    const calls: string[] = [];
    const custom = createTestMock({
      materializeDocument: async (request) => {
        calls.push(`document ${request.kind} ${request.sample} ${request.mimeType} → ${request.fileName}`);
        return `file:///cache/${request.fileName}`;
      },
      onFileUploaded: (file) => calls.push(`uploaded ${file.id} ${file.uri} ${file.mimeType} ${file.size}`),
      onFileRemoved: (fileId) => calls.push(`removed ${fileId}`),
    });
    await custom.api.ready();
    assert.equal(await custom.ctx.documents.download("groupAttendance", "8a.pdf"), "file:///cache/8a.pdf");
    const uploaded = custom.ctx.files.createFromUpload({ uri: "file:///documents/IMG_7.jpg", name: "IMG_7.jpg", mimeType: "image/jpeg", size: 77 }, "usr_ilya");
    custom.ctx.files.removeIfUnreferenced("file_linear_theory");
    custom.ctx.files.removeIfUnreferenced(uploaded.id);
    assert.deepEqual(calls, [
      "document groupAttendance pdfShort application/pdf → 8a.pdf",
      `uploaded ${uploaded.id} file:///documents/IMG_7.jpg image/jpeg 77`,
      `removed ${uploaded.id}`,
    ]);

    // A delete cascade removes file rows by itself; the device layer hears about each of them too, so the
    // bytes of picked photos do not stay behind without a row.
    calls.length = 0;
    const photoIds = custom.store.homeworkPhotos.by("assignmentId", "hw_ilya_open").map((photo) => photo.fileId);
    assert.equal(photoIds.length, 3);
    custom.ctx.cascade.deleteHomework("hw_ilya_open");
    assert.deepEqual([...calls].sort(), photoIds.map((fileId) => `removed ${fileId}`).sort());
    for (const fileId of photoIds) assert.equal(custom.store.files.has(fileId), false);
  });

  it("creates notifications with a Russian snapshot and projects the target for the recipient's role", async () => {
    const mock = await ready();
    const { notify } = mock.ctx;
    const created = notify.create({ userId: "usr_timur", type: "homework-checked", params: { correct: 1, incorrect: 1, uncertain: 1, applied: 2 }, href: "/student/homeworks/hw_x" })!;
    assert.equal(created.title, "Результат автопроверки готов");
    assert.equal(created.body, "Автопроверка: верно — 1, перерешать — 1, нужна ручная проверка — 1. Обновлено статусов: 2.");
    assert.equal(notify.toItem(created, "STUDENT", "en").body, "AI check: correct — 1, to redo — 1, needs manual review — 1. Statuses updated: 2.");
    assert.deepEqual(notify.toItem(created, "STUDENT").target, { screen: "student.homework", assignmentId: "hw_x" });
    // The same href is not a destination for another role.
    assert.equal(notify.toItem(created, "TEACHER").target, null);

    // No title and no renderable params → nothing is created.
    assert.equal(notify.create({ userId: "usr_timur", type: "broadcast" }), null);
    assert.equal(notify.create({ userId: "usr_timur", type: "unknown-type", params: { a: 1 } }), null);
    const broadcast = notify.create({ userId: "usr_timur", type: "broadcast", title: "Объявление", body: null })!;
    assert.deepEqual([broadcast.params, broadcast.href, notify.toItem(broadcast, "STUDENT", "en").title], [null, null, "Объявление"]);
    assert.deepEqual(notify.list("usr_timur", "STUDENT").unreadCount, 2);

    // A REACHED call marks the reminders about that student read — and only those.
    notify.markParentCallRemindersRead("usr_anna", "usr_kirill");
    const anna = mock.store.notifications.by("userId", "usr_anna");
    assert.ok(anna.filter((row) => row.href === "/teacher/calls?studentId=usr_kirill").every((row) => row.readAt !== null));
    assert.equal(anna.find((row) => row.href === "/teacher/calls?studentId=usr_artem")!.readAt, null);
  });

  it("filters realtime events like the site's shouldReceiveDashboardRealtimeEvent", () => {
    const viewer = (role: "STUDENT" | "TEACHER" | "DEVELOPER", id: string) => ({ id, role }) as never;
    const own = (studentId: string) => studentId === "s1";
    const events: Record<string, DashboardRealtimeEvent> = {
      students: { kind: "students-changed", occurredAt: TEST_T0 },
      topic: { kind: "topic-content-changed", occurredAt: TEST_T0 },
      progressOwn: { kind: "student-progress-changed", occurredAt: TEST_T0, studentId: "s1" },
      progressOther: { kind: "student-progress-changed", occurredAt: TEST_T0, studentId: "s2" },
      deadlinesOwn: { kind: "student-deadlines-changed", occurredAt: TEST_T0, studentId: "s1" },
      lessonMine: { kind: "lesson-activity", occurredAt: TEST_T0, lessonId: "l", teacherId: "t1", studentId: "s1" },
      lessonMineNoStudent: { kind: "lesson-activity", occurredAt: TEST_T0, lessonId: "l", teacherId: "t1" },
      lessonOther: { kind: "lesson-activity", occurredAt: TEST_T0, lessonId: "l", teacherId: "t2", studentId: "s2" },
    };
    const received = (who: never) => Object.keys(events).filter((key) => shouldReceiveRealtimeEvent(who, events[key]!, own));

    assert.deepEqual(received(viewer("DEVELOPER", "d")), Object.keys(events));
    assert.deepEqual(received(viewer("TEACHER", "t1")), ["students", "topic", "progressOwn", "deadlinesOwn", "lessonMine", "lessonMineNoStudent"]);
    assert.deepEqual(received(viewer("STUDENT", "s1")), ["topic", "progressOwn", "deadlinesOwn", "lessonMine"]);
    assert.deepEqual(received(viewer("STUDENT", "s3")), ["topic"]);
  });
});

describe("rule V — verdict scripting (90-addendum-6 §4)", () => {
  type Row = { homeworkNumberId: string; number: string; status: HomeworkNumberStatus | null };
  const rows = (entries: [string, HomeworkNumberStatus | null][]): Row[] => entries.map(([number, status]) => ({ homeworkNumberId: `num_${number}`, number, status }));

  /** Applies a scripted homework check the way the site's pipeline does, and returns the decisions. */
  function runCheck(numbers: Row[], photos: number) {
    const results = scriptHomeworkCheck(numbers, photos);
    const decisions = results.map(({ entry, result }) => {
      const decision = decideProgressChange({ status: entry.status, statusChangedAt: null }, { source: "homework_check", verdict: result.verdict, checkStartedAt: new Date(T0) });
      if (decision.write) entry.status = decision.status;
      return `${entry.number} ${result.verdict} ${decision.reason}`;
    });
    return { decisions, applied: decisions.filter((line) => line.endsWith(" changed")).length, results };
  }

  it("walks the cycle CORRECT → INCORRECT → UNCERTAIN by index and attempt", () => {
    assert.deepEqual([0, 1, 2, 3, 4].map((index) => scriptVerdict(index, 0)), ["CORRECT", "INCORRECT", "UNCERTAIN", "CORRECT", "INCORRECT"]);
    assert.deepEqual([0, 1, 2].map((attempt) => scriptVerdict(1, attempt)), ["INCORRECT", "UNCERTAIN", "CORRECT"]);
  });

  it("example 1 — hw_ilya_overdue with 3, 2 and 1 photos completes the homework", () => {
    const numbers = rows([["118", "RED"], ["120", null], ["124", null]]);
    const first = runCheck(numbers, 3);
    assert.deepEqual(first.decisions, ["118 CORRECT changed", "120 INCORRECT changed", "124 UNCERTAIN uncertain"]);
    assert.equal(first.applied, 2);
    assert.deepEqual(numbers.map((row) => row.status), ["YELLOW", "RED", null]);

    assert.deepEqual(runCheck(numbers, 2).decisions, ["120 CORRECT changed", "124 INCORRECT changed"]);
    assert.deepEqual(runCheck(numbers, 1).decisions, ["124 CORRECT changed"]);
    assert.deepEqual(numbers.map((row) => row.status), ["YELLOW", "YELLOW", "YELLOW"]);
  });

  it("example 2 — a completed homework: unchanged and downgrade_blocked, applied 0", () => {
    const check = runCheck(rows([["112", "GREEN"], ["113", "YELLOW"]]), 2);
    assert.deepEqual(check.decisions, ["112 CORRECT unchanged", "113 INCORRECT downgrade_blocked"]);
    assert.equal(check.applied, 0);
  });

  it("example 3 — one photo finds one number; the others are absent, not UNCERTAIN", () => {
    const check = runCheck(rows([["218", null], ["220", null]]), 1);
    assert.deepEqual(check.decisions, ["218 CORRECT changed"]);
    assert.equal(check.results.length, 1);
  });

  it("orders numerically, prefers unsolved numbers and never exceeds the batch", () => {
    const numbers = rows([["010209", "RED"], ["010203", "GREEN"], ["010204", "GREEN"]]);
    assert.deepEqual(selectFoundNumbers(numbers, 3).map((row) => row.number), ["010209"]);
    assert.deepEqual(selectFoundNumbers(rows([["12", null], ["7", null], ["010", null]]), 2).map((row) => row.number), ["7", "010"]);
    assert.deepEqual(selectFoundNumbers(numbers, 0), []);
    // Explicit verdicts of the demo control override the cycle by index.
    assert.deepEqual(scriptHomeworkCheck(rows([["1", null], ["2", null]]), 2, "ru", ["UNCERTAIN", "CORRECT"]).map((entry) => entry.result.verdict), ["UNCERTAIN", "CORRECT"]);
    // The override is read by index: a list shorter than the found numbers hands the rest back to the
    // cycle, so an "all …" outcome of the demo screen names its verdict for every index.
    const three = rows([["1", null], ["2", null], ["3", null]]);
    assert.deepEqual(scriptHomeworkCheck(three, 3, "ru", ["INCORRECT"]).map((entry) => entry.result.verdict), ["INCORRECT", "INCORRECT", "UNCERTAIN"]);
    const all = Array.from({ length: 30 }, () => "INCORRECT" as const);
    assert.deepEqual(scriptHomeworkCheck(three, 3, "ru", all).map((entry) => entry.result.verdict), ["INCORRECT", "INCORRECT", "INCORRECT"]);
  });

  it("completes a homework of 12 numbers with batches of 10 photos", () => {
    const numbers = rows(Array.from({ length: 12 }, (_, index) => [String(501 + index), index < 4 ? "GREEN" : null] as [string, HomeworkNumberStatus | null]));
    let checks = 0;
    while (numbers.some((row) => row.status !== "GREEN" && row.status !== "YELLOW")) {
      const { applied } = runCheck(numbers, 10);
      assert.ok(applied >= 1, "every check solves at least one unsolved number");
      checks += 1;
      assert.ok(checks < 20);
    }
    assert.ok(checks <= 8);
  });

  it("example 4 — every lesson auto-result from user submissions on les_dasha_soon", () => {
    const steps: [string, number, number][] = [["401", 0, 0], ["402", 1, 0], ["402", 1, 1], ["402", 1, 2], ["403", 2, 0], ["403", 2, 1], ["404", 3, 0]];
    const results = new Map<string, string | null>();
    const incorrectBefore = new Set<string>();
    const log = steps.map(([number, position, doneAttempts]) => {
      const scripted = scriptLessonSubmission(number, position, doneAttempts);
      const auto = decideAutoLessonResult({ verdict: scripted.verdict, currentResult: results.get(number) ?? null, hadIncorrectBefore: incorrectBefore.has(number) });
      if (scripted.verdict === "INCORRECT") incorrectBefore.add(number);
      if (auto) results.set(number, auto);
      return `${number} ${scripted.verdict} → ${results.get(number) ?? "null"}`;
    });
    assert.deepEqual(log, [
      "401 CORRECT → SOLVED",
      "402 INCORRECT → NOT_SOLVED",
      "402 UNCERTAIN → NOT_SOLVED",
      "402 CORRECT → PARTIAL",
      "403 UNCERTAIN → null",
      "403 CORRECT → SOLVED",
      "404 CORRECT → SOLVED",
    ]);
  });

  it("example 5 — Полина's next submissions in les_live", async () => {
    const mock = await ready();
    const items = mock.ctx.q.items("lp_les_live_polina");
    const next = (label: string) => {
      const position = items.findIndex((item) => item.homeworkNumberId === `num_${label}`);
      const done = mock.ctx.q.submissions(items[position]!.id).filter((submission) => submission.status === "DONE").length;
      return scriptLessonSubmission(label, position, done).verdict;
    };
    assert.equal(next("010205"), "CORRECT"); // #3: position 2, one DONE INCORRECT → PARTIAL
    assert.equal(next("010206"), "INCORRECT"); // #4: position 3, one DONE (UNCERTAIN)
    assert.equal(next("010207"), "INCORRECT"); // #5: position 4, its only submission FAILED → 0 done attempts
    assert.equal(next("010209"), "CORRECT"); // #7: position 6
  });

  it("builds the payload of a scripted result and the canonical error of each failure class", () => {
    const correct = scriptLessonSubmission("401", 0, 0);
    assert.deepEqual(correct, { number: "401", verdict: "CORRECT", copySuspected: false, injectionSuspected: false, confidence: 0.93, recognizedAnswer: "совпадает с эталоном", comment: "Верно.", errorKind: null, errorNote: null });
    const incorrect = scriptHomeworkCheck(rows([["1", null], ["2", null], ["3", null], ["4", null], ["5", null]]), 5).map((entry) => entry.result);
    assert.deepEqual([incorrect[1]!.confidence, incorrect[1]!.errorKind, incorrect[4]!.errorKind, incorrect[1]!.recognizedAnswer], [0.88, "ARITHMETIC", "SIGN", "x = 3"]);
    assert.deepEqual([incorrect[2]!.confidence, incorrect[2]!.errorKind, incorrect[2]!.recognizedAnswer], [0.41, "UNREADABLE", null]);
    assert.equal(scriptLessonSubmission("402", 1, 0, "en").comment, "A calculation error — recheck your working carefully.");
    assert.equal(scriptLessonSubmission("402", 1, 0, "ru", "CORRECT").verdict, "CORRECT");

    // The stored raw text of every class is recognised as that class by the ordered classifier.
    for (const errorClass of ["interrupted", "disabled", "timeout", "quota", "unavailable", "queue", "image", "unknown"] as const) {
      assert.equal(classifySolutionCheckError(failedCheckError(errorClass, "homework")), errorClass);
      assert.equal(classifySolutionCheckError(failedCheckError(errorClass, "lesson")), errorClass);
      assert.equal(failureRefundsBudget(errorClass), errorClass === "disabled" || errorClass === "image");
    }
  });
});
