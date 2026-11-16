// Mock backend, member `groups` — part 1: groups, membership, the AI profile, group statistics, attendance and
// the attendance PDF (docs/spec/06-teacher-groups-calls-stats.md; 00 §2.11; 90-addendum-1 A.10).
// Node's test runner and assert are typed by referencing only their declaration files: the project does not
// load `@types/node` globally (it would change DOM / React Native globals such as the timer return types).
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError } from "../src/api/errors";
import type { AnyApiErrorCode } from "../src/api/errors";
import type { AttendanceStatus, HomeworkNumberStatus, RealtimeEvent, ReportPeriod } from "../src/api/types";
import { ATTENDANCE_STATUSES } from "../src/api/types";
import { compareByActivity } from "../src/domain/group-statistics";
import { DAY_MS, HOUR_MS } from "../src/domain/moscow-time";
import type { MockDocumentRequest } from "../src/mock/assets";
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

async function asTeacher(login = "teacher@example.com"): Promise<TestMock> {
  const mock = createTestMock();
  await mock.signIn(login);
  return mock;
}

async function switchTo(mock: TestMock, login: string): Promise<void> {
  mock.signOut();
  await mock.signIn(login);
}

function listen(mock: TestMock) {
  const events: RealtimeEvent[] = [];
  const unsubscribe = mock.api.shell.subscribeRealtime((event) => events.push(event));
  return { events, unsubscribe };
}

/** A student row placed straight into the store (creating accounts belongs to another member). */
function addStudent(mock: TestMock, id: string, name: string, teacherId: string | null = "usr_anna"): void {
  mock.store.users.insert({ id, name, email: `${id}@example.com`, role: "STUDENT", teacherId, createdAt: TEST_T0, updatedAt: TEST_T0, password: "student123" });
}

let statusSeq = 0;
/** A coloured status row whose colour last changed at `at`. */
function mark(mock: TestMock, studentId: string, homeworkNumberId: string, status: HomeworkNumberStatus, at: number): void {
  statusSeq += 1;
  mock.store.statuses.insert({
    id: `st_test_${statusSeq}`,
    studentId,
    homeworkNumberId,
    status,
    note: null,
    deadlineAt: null,
    statusChangedAt: iso(at),
    createdAt: iso(at),
    updatedAt: iso(at),
  });
}

function addHomework(mock: TestMock, id: string, studentId: string, numberIds: string[], deadlineAt: number | null): void {
  mock.store.homeworks.insert({ id, studentId, topicId: "top_word", title: null, deadlineAt: deadlineAt === null ? null : iso(deadlineAt), createdAt: iso(T0 - DAY_MS), updatedAt: iso(T0 - DAY_MS) });
  numberIds.forEach((homeworkNumberId, index) => mock.store.homeworkNumbers.insert({ id: `${id}_n${index}`, assignmentId: id, homeworkNumberId }));
}

describe("groups: list and create", () => {
  it("lists a teacher's own groups by creation date with the members by name", async () => {
    const mock = await asTeacher();
    const { groups, canCreate } = await mock.api.groups.listGroups();
    assert.equal(canCreate, true);
    assert.deepEqual(groups.map((group) => [group.id, group.name, group.subject, group.grade, group.membersCount]), [
      ["grp_8a", "8А — алгебра", "MATH", 8, 4],
      ["grp_empty", "Резерв (пустая группа)", "MATH", null, 0],
    ]);
    // More than three members: the card shows three names and "and 1 more" (90-addendum-6 §6.6).
    const g8a = groups[0]!;
    assert.deepEqual(g8a.members.map((member) => member.name), ["Артём Кузнецов", "Кирилл Зайцев", "Мария Волкова", "Полина Морозова"]);
    assert.deepEqual(g8a.members[0], { id: "usr_artem", name: "Артём Кузнецов", email: "artem@example.com", speed: 8, aiNote: "Быстро считает, но пропускает проверку ОДЗ." });
    assert.deepEqual(g8a.members[2], { id: "usr_maria", name: "Мария Волкова", email: "maria@example.com", speed: 5, aiNote: null });
    assert.equal(g8a.createdAt, mock.store.groups.get("grp_8a")!.createdAt);
    assert.deepEqual(groups[1]!.members, []);
    // A projection, not the stored row.
    assert.deepEqual(Object.keys(g8a).sort(), ["createdAt", "grade", "id", "members", "membersCount", "name", "subject"]);
  });

  it("gives a teacher without groups an empty list and a developer every group without the right to create", async () => {
    const mock = await asTeacher("teacher3@example.com");
    assert.deepEqual(await mock.api.groups.listGroups(), { groups: [], canCreate: true });

    await switchTo(mock, "dev@example.com");
    const all = await mock.api.groups.listGroups();
    assert.equal(all.canCreate, false);
    assert.deepEqual(all.groups.map((group) => [group.id, group.membersCount]), [["grp_8a", 4], ["grp_10b", 2], ["grp_empty", 0]]);
  });

  it("refuses a student and a missing session", async () => {
    const mock = createTestMock();
    await rejects(mock.api.groups.listGroups(), "sessionExpired", 401);
    await mock.signIn("ilya@example.com");
    await rejects(mock.api.groups.listGroups(), "unauthorized", 403);
    await rejects(mock.api.groups.getGroup("grp_8a"), "unauthorized", 403);
    await rejects(mock.api.groups.createGroup({ name: "Моя группа" }), "unauthorized", 403);
    await rejects(mock.api.groups.renameGroup("grp_8a", { name: "Х" }), "unauthorized", 403);
    await rejects(mock.api.groups.deleteGroup("grp_8a"), "unauthorized", 403);
    await rejects(mock.api.groups.addGroupMember("grp_8a", { studentId: "usr_ilya" }), "unauthorized", 403);
    await rejects(mock.api.groups.removeGroupMember("grp_8a", "usr_artem"), "unauthorized", 403);
    await rejects(mock.api.groups.setStudentAiProfile("usr_ilya", { speed: 10, aiNote: null }), "unauthorized", 403);
    await rejects(mock.api.groups.getGroupStatistics("grp_8a"), "unauthorized", 403);
    await rejects(mock.api.groups.getGroupAttendance("grp_8a"), "unauthorized", 403);
    await rejects(mock.api.groups.setAttendance("les_live", "lp_les_live_kirill", "PRESENT"), "unauthorized", 403);
    await rejects(mock.api.groups.downloadGroupAttendancePdf("grp_8a", "7d"), "unauthorized", 403);
    assert.equal(mock.store.groups.size, 3);
  });

  it("hides a member transferred to another teacher from the previous owner", async () => {
    const mock = await asTeacher();
    mock.store.users.update("usr_polina", { teacherId: "usr_igor" });
    const { groups } = await mock.api.groups.listGroups();
    assert.deepEqual(groups[0]!.members.map((member) => member.id), ["usr_artem", "usr_kirill", "usr_maria"]);
    assert.equal(groups[0]!.membersCount, 3);
    const detail = await mock.api.groups.getGroup("grp_8a");
    assert.equal(detail.group.members.some((member) => member.id === "usr_polina"), false);
    assert.equal(detail.group.allStudents.some((student) => student.id === "usr_polina"), false);
    assert.equal((await mock.api.groups.getGroupAttendance("grp_8a")).members.some((member) => member.id === "usr_polina"), false);
    assert.equal((await mock.api.groups.getGroupStatistics("grp_8a")).members.some((member) => member.id === "usr_polina"), false);

    await switchTo(mock, "dev@example.com");
    assert.equal((await mock.api.groups.getGroup("grp_8a")).group.members.length, 4);
  });

  it("creates a group with a normalised name, an optional grade and the default subject", async () => {
    const mock = await asTeacher();
    mock.clock.advance(HOUR_MS);
    const { group } = await mock.api.groups.createGroup({ name: "  9 класс,\tОГЭ   по\nсубботам ", grade: 9 });
    assert.deepEqual(group, { id: group.id, name: "9 класс, ОГЭ по субботам", subject: "MATH", grade: 9, createdAt: iso(T0 + HOUR_MS), membersCount: 0, members: [] });
    assert.equal(mock.store.groups.get(group.id)!.teacherId, "usr_anna");
    // The newest group is the last one of the list.
    assert.deepEqual((await mock.api.groups.listGroups()).groups.map((row) => row.id), ["grp_8a", "grp_empty", group.id]);

    const informatics = await mock.api.groups.createGroup({ name: "Информатика", subject: "INFORMATICS", grade: null });
    assert.deepEqual([informatics.group.subject, informatics.group.grade], ["INFORMATICS", null]);
    const unknownSubject = await mock.api.groups.createGroup({ name: "Физика", subject: "PHYSICS" as never });
    assert.equal(unknownSubject.group.subject, "MATH");
  });

  it("cuts the name at 120 characters and stores an out-of-range grade as not set", async () => {
    const mock = await asTeacher();
    const exact = "а".repeat(120);
    assert.equal((await mock.api.groups.createGroup({ name: exact })).group.name, exact);
    assert.equal((await mock.api.groups.createGroup({ name: `${exact}б` })).group.name, exact);

    const grades: [unknown, number | null][] = [[1, 1], [11, 11], [0, null], [12, null], [5.5, null], ["7", 7], ["abc", null], [undefined, null], [null, null]];
    for (const [input, expected] of grades) {
      const { group } = await mock.api.groups.createGroup({ name: `Класс ${String(input)}`, grade: input as number | null });
      assert.equal(group.grade, expected, `grade ${String(input)}`);
    }
  });

  it("rejects an empty name and a developer", async () => {
    const mock = await asTeacher();
    const error = await rejects(mock.api.groups.createGroup({ name: " \t\n " }), "invalidData", 400);
    assert.equal(error.message, "Проверьте название группы (до 120 символов) и класс (1–11).");
    mock.setLocale("en");
    assert.equal((await rejects(mock.api.groups.createGroup({ name: "" }), "invalidData", 400)).message, "Check the group name (up to 120 characters) and grade (1–11).");
    await rejects(mock.api.groups.createGroup({} as never), "invalidData", 400);

    await switchTo(mock, "dev@example.com");
    assert.equal((await rejects(mock.api.groups.createGroup({ name: "Группа разработчика" }), "unauthorized", 403)).message, "Access denied.");
    assert.equal(mock.store.groups.size, 3);
  });
});

describe("groups: detail, rename, delete", () => {
  it("returns the card of a group: members with progress, candidates and the three newest lessons", async () => {
    const mock = await asTeacher();
    const { group, lessons } = await mock.api.groups.getGroup("grp_8a");
    assert.deepEqual([group.id, group.name, group.subject, group.grade, group.totalNumbers], ["grp_8a", "8А — алгебра", "MATH", 8, 79]);
    assert.deepEqual(group.members.map((member) => member.id), ["usr_artem", "usr_kirill", "usr_maria", "usr_polina"]);
    for (const member of group.members) {
      const rows = mock.store.statuses.by("studentId", member.id);
      assert.deepEqual(member.progress, {
        greenCount: rows.filter((row) => row.status === "GREEN").length,
        yellowCount: rows.filter((row) => row.status === "YELLOW").length,
        redCount: rows.filter((row) => row.status === "RED").length,
      });
      assert.ok(member.progress.greenCount + member.progress.yellowCount + member.progress.redCount > 0);
    }

    // Every own student is a candidate, with the group they are in now (the "will be moved here" warning).
    assert.deepEqual(group.allStudents.map((student) => [student.id, student.groupId]), [
      ["usr_artem", "grp_8a"],
      ["usr_dasha", null],
      ["usr_ilya", null],
      ["usr_kirill", "grp_8a"],
      ["usr_maria", "grp_8a"],
      ["usr_polina", "grp_8a"],
      ["usr_timur", null],
    ]);

    const stored = mock.store.lessons.filter((lesson) => lesson.groupId === "grp_8a" && lesson.kind === "LESSON").sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    assert.equal(lessons.total, stored.length);
    assert.deepEqual(lessons.recent.map((lesson) => lesson.id), stored.slice(0, 3).map((lesson) => lesson.id));
    assert.deepEqual(lessons.recent.map((lesson) => [lesson.id, lesson.status, lesson.startsAt === null]), [
      ["les_tomorrow_group", "PLANNED", false],
      // Running now: the status is derived from the schedule (the stored one is still PLANNED).
      ["les_live", "ACTIVE", false],
      ["les_unscheduled", "PLANNED", true],
    ]);
    assert.deepEqual(Object.keys(lessons.recent[0]!).sort(), ["createdAt", "durationMinutes", "id", "startsAt", "status", "title"]);
  });

  it("shows the empty group and answers 404 for a foreign or missing group", async () => {
    const mock = await asTeacher();
    const empty = await mock.api.groups.getGroup("grp_empty");
    assert.deepEqual([empty.group.members, empty.lessons], [[], { total: 0, recent: [] }]);
    assert.equal(empty.group.allStudents.length, 7);

    const error = await rejects(mock.api.groups.getGroup("grp_10b"), "groupNotFound", 404);
    assert.equal(error.message, "Группа не найдена.");
    await rejects(mock.api.groups.getGroup("grp_nope"), "groupNotFound", 404);
    await rejects(mock.api.groups.getGroup(""), "groupNotFound", 404);
    await rejects(mock.api.groups.getGroupStatistics("grp_10b"), "groupNotFound", 404);
    await rejects(mock.api.groups.getGroupAttendance("grp_10b"), "groupNotFound", 404);

    await switchTo(mock, "dev@example.com");
    const foreign = await mock.api.groups.getGroup("grp_10b");
    assert.deepEqual(foreign.group.members.map((member) => member.name), ["Егор Лебедев", "Софья Орлова"]);
    // A developer may add any student.
    assert.equal(foreign.group.allStudents.length, 10);
  });

  it("closes a lesson that ended by schedule before answering: results, attendance, event and journal row", async () => {
    const mock = await asTeacher();
    const { events, unsubscribe } = listen(mock);
    await settle();
    assert.equal(mock.store.lessons.get("les_g_unfinalized")!.status, "PLANNED");
    assert.equal(mock.store.participants.get("lp_les_g_unfinalized_kirill")!.attendance, "UNKNOWN");

    await mock.api.groups.getGroup("grp_8a");
    await settle();
    assert.equal(mock.store.lessons.get("les_g_unfinalized")!.status, "FINISHED");
    // No activity at the lesson → "absent"; the others keep their marks.
    assert.equal(mock.store.participants.get("lp_les_g_unfinalized_kirill")!.attendance, "ABSENT");
    assert.equal(mock.store.participants.get("lp_les_g_unfinalized_artem")!.attendance, "PRESENT");
    assert.deepEqual(events.filter((event) => event.kind === "lesson-activity").map((event) => event.kind === "lesson-activity" && event.lessonId), ["les_g_unfinalized"]);
    assert.equal(mock.store.auditLogs.filter((row) => row.action === "lesson.auto_results" && row.targetId === "les_g_unfinalized").length, 1);
    // The unmarked items were mirrored into the number statuses through the progress writer.
    assert.ok(mock.store.progressEvents.some((row) => row.source === "lesson_end" && row.createdAt === TEST_T0));

    // Idempotent: a second read changes nothing.
    await mock.api.groups.getGroup("grp_8a");
    assert.equal(mock.store.auditLogs.filter((row) => row.action === "lesson.auto_results" && row.targetId === "les_g_unfinalized").length, 1);
    unsubscribe();
  });

  it("renames a group for its owner and for a developer", async () => {
    const mock = await asTeacher();
    mock.clock.advance(5000);
    assert.deepEqual(await mock.api.groups.renameGroup("grp_8a", { name: "  8А —   алгебра\n(вечер) " }), { group: { id: "grp_8a", name: "8А — алгебра (вечер)" } });
    assert.deepEqual([mock.store.groups.get("grp_8a")!.name, mock.store.groups.get("grp_8a")!.updatedAt], ["8А — алгебра (вечер)", iso(T0 + 5000)]);
    assert.equal((await mock.api.groups.renameGroup("grp_8a", { name: "я".repeat(121) })).group.name, "я".repeat(120));

    await switchTo(mock, "dev@example.com");
    assert.equal((await mock.api.groups.renameGroup("grp_10b", { name: "10Б" })).group.name, "10Б");
  });

  it("rejects an empty name and a foreign group on rename, the form check first", async () => {
    const mock = await asTeacher();
    const invalid = await rejects(mock.api.groups.renameGroup("grp_8a", { name: "   " }), "invalidData", 400);
    assert.equal(invalid.message, "Проверьте название группы (до 120 символов) и класс (1–11).");
    const missing = await rejects(mock.api.groups.renameGroup("grp_10b", { name: "Чужая" }), "groupNotFound", 404);
    assert.equal(missing.message, "Группа не найдена — возможно, её уже удалили.");
    // As in the site's action, an empty name is refused before the group is looked up.
    await rejects(mock.api.groups.renameGroup("grp_10b", { name: "" }), "invalidData", 400);
    await rejects(mock.api.groups.renameGroup("grp_missing", { name: "  " }), "invalidData", 400);
    assert.equal(mock.store.groups.get("grp_8a")!.name, "8А — алгебра");
    assert.equal(mock.store.groups.get("grp_10b")!.name, "10Б — профиль");
  });

  it("deletes a group and keeps the students, their profiles and the lessons", async () => {
    const mock = await asTeacher();
    const lessonIds = mock.store.lessons.by("groupId", "grp_8a").map((lesson) => lesson.id);
    assert.ok(lessonIds.length > 0);
    assert.equal(await mock.api.groups.deleteGroup("grp_8a"), undefined);

    assert.equal(mock.store.groups.get("grp_8a"), undefined);
    for (const studentId of ["usr_artem", "usr_kirill", "usr_maria", "usr_polina"]) {
      assert.ok(mock.store.users.get(studentId));
      assert.equal(mock.store.profiles.findUnique("userId", studentId)!.groupId, null);
    }
    // Speed and the note for the AI survive.
    assert.deepEqual([mock.store.profiles.findUnique("userId", "usr_artem")!.speed, mock.store.profiles.findUnique("userId", "usr_kirill")!.aiNote], [8, "Нужны короткие шаги и повтор формул."]);
    for (const lessonId of lessonIds) assert.equal(mock.store.lessons.get(lessonId)!.groupId, null);
    assert.ok(mock.store.participants.get("lp_les_g1_artem"));

    assert.deepEqual((await mock.api.groups.listGroups()).groups.map((group) => group.id), ["grp_empty"]);
    const gone = await rejects(mock.api.groups.deleteGroup("grp_8a"), "groupNotFound", 404);
    assert.equal(gone.message, "Группа не найдена — возможно, её уже удалили.");
    await rejects(mock.api.groups.getGroup("grp_8a"), "groupNotFound", 404);
    await rejects(mock.api.groups.getGroupAttendance("grp_8a"), "groupNotFound", 404);

    await rejects(mock.api.groups.deleteGroup("grp_10b"), "groupNotFound", 404);
    await switchTo(mock, "dev@example.com");
    await mock.api.groups.deleteGroup("grp_10b");
    assert.equal(mock.store.profiles.findUnique("userId", "usr_sofia")!.groupId, null);
  });
});

describe("groups: members and the AI profile", () => {
  it("adds an own student, moving them out of their previous group without touching the profile", async () => {
    const mock = await asTeacher();
    const added = await mock.api.groups.addGroupMember("grp_empty", { studentId: "usr_ilya" });
    assert.equal(added.movedFromGroupId, null);
    assert.deepEqual([added.member.id, added.member.speed, added.member.aiNote], ["usr_ilya", 6, "Сильный, но торопится: ошибки в знаках."]);
    const marks = mock.store.statuses.by("studentId", "usr_ilya");
    assert.equal(added.member.progress.greenCount, marks.filter((row) => row.status === "GREEN").length);

    const moved = await mock.api.groups.addGroupMember("grp_empty", { studentId: " usr_artem " });
    assert.equal(moved.movedFromGroupId, "grp_8a");
    assert.deepEqual([moved.member.speed, moved.member.aiNote], [8, "Быстро считает, но пропускает проверку ОДЗ."]);
    const groups = (await mock.api.groups.listGroups()).groups;
    assert.deepEqual(groups.map((group) => [group.id, group.members.map((member) => member.id)]), [
      ["grp_8a", ["usr_kirill", "usr_maria", "usr_polina"]],
      ["grp_empty", ["usr_artem", "usr_ilya"]],
    ]);

    // Already a member: nothing moves.
    assert.equal((await mock.api.groups.addGroupMember("grp_empty", { studentId: "usr_artem" })).movedFromGroupId, null);
    // Past participations are not touched by a move.
    assert.ok(mock.store.participants.get("lp_les_g1_artem"));
  });

  it("creates the profile row of a brand-new student on the first add", async () => {
    const mock = await asTeacher();
    assert.equal(mock.store.profiles.findUnique("userId", "usr_timur"), undefined);
    const { member, movedFromGroupId } = await mock.api.groups.addGroupMember("grp_empty", { studentId: "usr_timur" });
    assert.deepEqual([member.speed, member.aiNote, member.progress, movedFromGroupId], [null, null, { greenCount: 0, yellowCount: 0, redCount: 0 }, null]);
    const profile = mock.store.profiles.findUnique("userId", "usr_timur")!;
    assert.deepEqual([profile.groupId, profile.speed, profile.aiNote, profile.createdAt], ["grp_empty", null, null, TEST_T0]);
  });

  it("answers 404 for a foreign group or student and lets a developer add anyone", async () => {
    const mock = await asTeacher();
    assert.equal((await rejects(mock.api.groups.addGroupMember("grp_empty", { studentId: "usr_sofia" }), "studentNotFound", 404)).message, "Ученик не найден.");
    await rejects(mock.api.groups.addGroupMember("grp_empty", { studentId: "usr_orphan" }), "studentNotFound", 404);
    await rejects(mock.api.groups.addGroupMember("grp_empty", { studentId: "usr_igor" }), "studentNotFound", 404);
    await rejects(mock.api.groups.addGroupMember("grp_empty", { studentId: "" }), "studentNotFound", 404);
    await rejects(mock.api.groups.addGroupMember("grp_empty", {} as never), "studentNotFound", 404);
    // The group is checked first.
    await rejects(mock.api.groups.addGroupMember("grp_10b", { studentId: "usr_sofia" }), "groupNotFound", 404);
    await rejects(mock.api.groups.addGroupMember("grp_10b", { studentId: "usr_ilya" }), "groupNotFound", 404);
    assert.equal(mock.store.profiles.findUnique("userId", "usr_sofia")!.groupId, "grp_10b");

    await switchTo(mock, "dev@example.com");
    const moved = await mock.api.groups.addGroupMember("grp_8a", { studentId: "usr_sofia" });
    assert.equal(moved.movedFromGroupId, "grp_10b");
    const orphan = await mock.api.groups.addGroupMember("grp_8a", { studentId: "usr_orphan" });
    assert.equal(orphan.member.name, "Лев Без-Учителя");
  });

  it("removes a member idempotently and keeps the account, the progress and the profile", async () => {
    const mock = await asTeacher();
    const marksBefore = mock.store.statuses.by("studentId", "usr_artem").length;
    assert.equal(await mock.api.groups.removeGroupMember("grp_8a", "usr_artem"), undefined);
    const profile = mock.store.profiles.findUnique("userId", "usr_artem")!;
    assert.deepEqual([profile.groupId, profile.speed, profile.aiNote], [null, 8, "Быстро считает, но пропускает проверку ОДЗ."]);
    assert.equal(mock.store.statuses.by("studentId", "usr_artem").length, marksBefore);
    assert.ok(mock.store.participants.get("lp_les_g1_artem"));

    // Again, a student of another group, a student without a profile, an unknown id: all are no-ops.
    await mock.api.groups.removeGroupMember("grp_8a", "usr_artem");
    await mock.api.groups.removeGroupMember("grp_empty", "usr_kirill");
    await mock.api.groups.removeGroupMember("grp_8a", "usr_timur");
    await mock.api.groups.removeGroupMember("grp_8a", "usr_nobody");
    assert.equal(mock.store.profiles.findUnique("userId", "usr_kirill")!.groupId, "grp_8a");
    assert.deepEqual((await mock.api.groups.getGroup("grp_8a")).group.members.map((member) => member.id), ["usr_kirill", "usr_maria", "usr_polina"]);

    await rejects(mock.api.groups.removeGroupMember("grp_10b", "usr_sofia"), "groupNotFound", 404);
    assert.equal(mock.store.profiles.findUnique("userId", "usr_sofia")!.groupId, "grp_10b");
    await switchTo(mock, "dev@example.com");
    await mock.api.groups.removeGroupMember("grp_10b", "usr_sofia");
    assert.equal(mock.store.profiles.findUnique("userId", "usr_sofia")!.groupId, null);
  });

  it("overwrites speed and the note for the AI together", async () => {
    const mock = await asTeacher();
    assert.deepEqual(await mock.api.groups.setStudentAiProfile("usr_artem", { speed: 1, aiNote: "  Теряется\tв длинных\nвыкладках  " }), {
      studentId: "usr_artem",
      speed: 1,
      aiNote: "Теряется в длинных выкладках",
    });
    assert.equal((await mock.api.groups.setStudentAiProfile("usr_artem", { speed: 10, aiNote: "x" })).speed, 10);
    // Full overwrite: a null note clears the stored one, a null speed means "not set".
    assert.deepEqual(await mock.api.groups.setStudentAiProfile("usr_artem", { speed: null, aiNote: null }), { studentId: "usr_artem", speed: null, aiNote: null });
    assert.deepEqual(await mock.api.groups.setStudentAiProfile("usr_artem", { speed: 4, aiNote: "   " }), { studentId: "usr_artem", speed: 4, aiNote: null });
    // Membership is not touched.
    assert.equal(mock.store.profiles.findUnique("userId", "usr_artem")!.groupId, "grp_8a");

    const exact = "н".repeat(300);
    assert.equal((await mock.api.groups.setStudentAiProfile("usr_artem", { speed: 4, aiNote: exact })).aiNote, exact);
    assert.equal((await mock.api.groups.setStudentAiProfile("usr_artem", { speed: 4, aiNote: `${exact}!` })).aiNote, exact);

    // A student without a profile row gets one, outside any group.
    assert.deepEqual(await mock.api.groups.setStudentAiProfile("usr_timur", { speed: 7, aiNote: "Новый ученик" }), { studentId: "usr_timur", speed: 7, aiNote: "Новый ученик" });
    assert.equal(mock.store.profiles.findUnique("userId", "usr_timur")!.groupId, null);
    // The group card shows the saved values.
    assert.deepEqual((await mock.api.groups.listGroups()).groups[0]!.members[0], { id: "usr_artem", name: "Артём Кузнецов", email: "artem@example.com", speed: 4, aiNote: exact });
  });

  it("refuses a speed outside 1..10 and a foreign student", async () => {
    const mock = await asTeacher();
    for (const speed of [0, 11, 2.5, -1, "fast"]) {
      const error = await rejects(mock.api.groups.setStudentAiProfile("usr_artem", { speed: speed as number, aiNote: "заметка" }), "invalidData", 400);
      assert.equal(error.message, "Некорректные данные.");
    }
    const profile = mock.store.profiles.findUnique("userId", "usr_artem")!;
    assert.deepEqual([profile.speed, profile.aiNote], [8, "Быстро считает, но пропускает проверку ОДЗ."]);

    await rejects(mock.api.groups.setStudentAiProfile("usr_sofia", { speed: 5, aiNote: null }), "studentNotFound", 404);
    await rejects(mock.api.groups.setStudentAiProfile("usr_orphan", { speed: 5, aiNote: null }), "studentNotFound", 404);
    await rejects(mock.api.groups.setStudentAiProfile("usr_anna", { speed: 5, aiNote: null }), "studentNotFound", 404);
    // Ownership first: a foreign student stays "not found" even with a bad speed.
    await rejects(mock.api.groups.setStudentAiProfile("usr_sofia", { speed: 99, aiNote: null }), "studentNotFound", 404);

    await switchTo(mock, "dev@example.com");
    assert.deepEqual(await mock.api.groups.setStudentAiProfile("usr_sofia", { speed: 9, aiNote: null }), { studentId: "usr_sofia", speed: 9, aiNote: null });
    assert.equal((await mock.api.groups.setStudentAiProfile("usr_orphan", { speed: 2, aiNote: "без учителя" })).aiNote, "без учителя");
  });
});

describe("groups: statistics", () => {
  it("ranks the seeded group by activity and sums the totals", async () => {
    const mock = await asTeacher();
    mock.clock.advance(90_000);
    const stats = await mock.api.groups.getGroupStatistics("grp_8a");
    assert.equal(stats.generatedAt, iso(T0 + 90_000));
    assert.equal(stats.members.length, 4);
    assert.deepEqual(stats.members.map((row) => row.rank), [1, 2, 3, 4]);
    assert.deepEqual([...stats.members].sort((left, right) => compareByActivity({ ...left, lastActivityAt: null }, { ...right, lastActivityAt: null })).map((row) => row.id), stats.members.map((row) => row.id));
    assert.equal(stats.mostActiveId, stats.members[0]!.closed30 > 0 ? stats.members[0]!.id : null);
    assert.equal(stats.leastActiveId, stats.members[3]!.id);

    const sum = (pick: (row: (typeof stats.members)[number]) => number) => stats.members.reduce((total, row) => total + pick(row), 0);
    assert.deepEqual(stats.totals, {
      closed7: sum((row) => row.closed7),
      closed30: sum((row) => row.closed30),
      red30: sum((row) => row.red30),
      overdueHomeworks: sum((row) => row.overdueHomeworks),
      attentionCount: stats.members.filter((row) => row.attention.length > 0).length,
    });

    for (const row of stats.members) {
      const marks = mock.store.statuses.by("studentId", row.id).filter((status) => status.status !== null);
      const last = Math.max(...marks.map((status) => Date.parse(status.statusChangedAt ?? status.updatedAt)));
      assert.equal(row.lastActivityAt, iso(last), row.name);
      assert.equal(row.idleDays, Math.floor((T0 + 90_000 - last) / DAY_MS), row.name);
      assert.ok(row.closed7 <= row.closed30);
      // Flags are codes with numbers, never localised text.
      for (const flag of row.attention) assert.ok(["overdue_homework", "not_started", "idle", "red_month"].includes(flag.code));
      assert.equal(row.attention.some((flag) => flag.code === "red_month"), row.red30 >= 5, row.name);
      assert.equal(row.attention.some((flag) => flag.code === "overdue_homework"), row.overdueHomeworks > 0, row.name);
      assert.deepEqual(Object.keys(row).sort(), ["activeHomeworks", "attention", "closed30", "closed7", "id", "idleDays", "lastActivityAt", "name", "overdueHomeworks", "rank", "red30", "streak"]);
    }
  });

  it("computes the numbers and the attention flags of every member at the boundaries", async () => {
    const mock = await asTeacher();
    const bank = mock.store.numbers.by("topicId", "top_word").map((number) => number.id);
    const { group } = await mock.api.groups.createGroup({ name: "Проверка статистики" });
    addStudent(mock, "usr_t_a", "Аня Тест");
    addStudent(mock, "usr_t_b", "Боря Тест");
    addStudent(mock, "usr_t_c", "Вова Тест");
    addStudent(mock, "usr_t_d", "Гена Тест");
    for (const studentId of ["usr_t_a", "usr_t_b", "usr_t_c", "usr_t_d"]) await mock.api.groups.addGroupMember(group.id, { studentId });

    // Аня: closed today and 6 days ago (inside 7 days), 7 and 29 days ago (inside 30), 30 days ago (outside); 5 reds.
    mark(mock, "usr_t_a", bank[0]!, "GREEN", T0 - HOUR_MS);
    mark(mock, "usr_t_a", bank[1]!, "YELLOW", T0 - 6 * DAY_MS);
    mark(mock, "usr_t_a", bank[2]!, "GREEN", T0 - 7 * DAY_MS);
    mark(mock, "usr_t_a", bank[3]!, "GREEN", T0 - 29 * DAY_MS);
    mark(mock, "usr_t_a", bank[4]!, "GREEN", T0 - 30 * DAY_MS);
    for (let index = 0; index < 5; index += 1) mark(mock, "usr_t_a", bank[5 + index]!, "RED", T0 - (2 + index) * DAY_MS);
    // A completed homework is neither overdue nor in progress.
    addHomework(mock, "hw_t_a", "usr_t_a", [bank[0]!, bank[1]!], T0 - DAY_MS);

    // Боря: the only mark is exactly 7 × 24 h old → idle 7; one homework past its deadline.
    mark(mock, "usr_t_b", bank[0]!, "GREEN", T0 - 7 * DAY_MS);
    addHomework(mock, "hw_t_b", "usr_t_b", [bank[1]!], T0 - 1);
    // Вова: one millisecond short of 7 days → idle 6, no flag; four reds are below the threshold.
    mark(mock, "usr_t_c", bank[0]!, "YELLOW", T0 - 7 * DAY_MS + 1);
    for (let index = 0; index < 4; index += 1) mark(mock, "usr_t_c", bank[1 + index]!, "RED", T0 - 20 * DAY_MS);
    // Гена: never active; a deadline that is exactly "now" and a homework without a deadline are both in progress.
    addHomework(mock, "hw_t_d1", "usr_t_d", [bank[0]!], T0);
    addHomework(mock, "hw_t_d2", "usr_t_d", [bank[1]!], null);

    const stats = await mock.api.groups.getGroupStatistics(group.id);
    assert.deepEqual(stats.members, [
      { id: "usr_t_a", name: "Аня Тест", closed7: 2, closed30: 4, red30: 5, streak: 1, overdueHomeworks: 0, activeHomeworks: 0, lastActivityAt: iso(T0 - HOUR_MS), rank: 1, idleDays: 0, attention: [{ code: "red_month", count: 5 }] },
      { id: "usr_t_b", name: "Боря Тест", closed7: 0, closed30: 1, red30: 0, streak: 0, overdueHomeworks: 1, activeHomeworks: 0, lastActivityAt: iso(T0 - 7 * DAY_MS), rank: 2, idleDays: 7, attention: [{ code: "overdue_homework", count: 1 }, { code: "idle", days: 7 }] },
      { id: "usr_t_c", name: "Вова Тест", closed7: 0, closed30: 1, red30: 4, streak: 0, overdueHomeworks: 0, activeHomeworks: 0, lastActivityAt: iso(T0 - 7 * DAY_MS + 1), rank: 3, idleDays: 6, attention: [] },
      { id: "usr_t_d", name: "Гена Тест", closed7: 0, closed30: 0, red30: 0, streak: 0, overdueHomeworks: 0, activeHomeworks: 2, lastActivityAt: null, rank: 4, idleDays: null, attention: [{ code: "not_started" }] },
    ]);
    assert.deepEqual([stats.mostActiveId, stats.leastActiveId], ["usr_t_a", "usr_t_d"]);
    assert.deepEqual(stats.totals, { closed7: 2, closed30: 6, red30: 9, overdueHomeworks: 1, attentionCount: 3 });

    // A streak counts from yesterday when nothing is closed today; idle days are elapsed 24-hour periods;
    // the homework whose deadline was "now" is overdue a moment later.
    mark(mock, "usr_t_d", bank[2]!, "GREEN", T0 - DAY_MS);
    mark(mock, "usr_t_d", bank[3]!, "GREEN", T0 - 2 * DAY_MS);
    mock.clock.advance(11 * HOUR_MS);
    const later = (await mock.api.groups.getGroupStatistics(group.id)).members.find((row) => row.id === "usr_t_d")!;
    assert.deepEqual([later.streak, later.closed7, later.idleDays, later.overdueHomeworks, later.activeHomeworks], [2, 2, 1, 1, 1]);
    assert.deepEqual(later.attention, [{ code: "overdue_homework", count: 1 }]);
    // The next Moscow day without anything closed yesterday ends the streak.
    mock.clock.advance(2 * HOUR_MS);
    assert.equal((await mock.api.groups.getGroupStatistics(group.id)).members.find((row) => row.id === "usr_t_d")!.streak, 0);
  });

  it("names the most and the least active member only when the rules allow it", async () => {
    const mock = await asTeacher();
    // No members.
    assert.deepEqual(await mock.api.groups.getGroupStatistics("grp_empty"), {
      generatedAt: TEST_T0,
      members: [],
      mostActiveId: null,
      leastActiveId: null,
      totals: { closed7: 0, closed30: 0, red30: 0, overdueHomeworks: 0, attentionCount: 0 },
    });

    // One member: neither.
    await mock.api.groups.addGroupMember("grp_empty", { studentId: "usr_ilya" });
    const one = await mock.api.groups.getGroupStatistics("grp_empty");
    assert.deepEqual([one.members.length, one.mostActiveId, one.leastActiveId], [1, null, null]);

    // Two members without anything closed in 30 days: only the least active one.
    const { group } = await mock.api.groups.createGroup({ name: "Новички" });
    addStudent(mock, "usr_t_x", "Яна Новая");
    await mock.api.groups.addGroupMember(group.id, { studentId: "usr_timur" });
    await mock.api.groups.addGroupMember(group.id, { studentId: "usr_t_x" });
    const two = await mock.api.groups.getGroupStatistics(group.id);
    assert.deepEqual([two.members.map((row) => row.id), two.mostActiveId, two.leastActiveId], [["usr_timur", "usr_t_x"], null, "usr_t_x"]);
    assert.equal(two.totals.attentionCount, 2);
  });
});

describe("groups: attendance", () => {
  it("returns the academic-year table: started lessons by time, current members, every mark value", async () => {
    const mock = await asTeacher();
    const table = await mock.api.groups.getGroupAttendance("grp_8a");
    assert.deepEqual([table.period, table.since, table.until], ["year", "2026-08-31T21:00:00.000Z", TEST_T0]);
    assert.deepEqual(table.members, [
      { id: "usr_artem", name: "Артём Кузнецов" },
      { id: "usr_kirill", name: "Кирилл Зайцев" },
      { id: "usr_maria", name: "Мария Волкова" },
      { id: "usr_polina", name: "Полина Морозова" },
    ]);
    // Planned and unscheduled lessons never appear; the running one is ACTIVE, the rest FINISHED.
    assert.deepEqual(table.lessons.map((lesson) => [lesson.id, lesson.status]), [
      ["les_early", "FINISHED"],
      ["les_g1", "FINISHED"],
      ["les_g2", "FINISHED"],
      ["les_g3", "FINISHED"],
      ["les_g4", "FINISHED"],
      ["les_g_unfinalized", "FINISHED"],
      ["les_live", "ACTIVE"],
    ]);
    const starts = table.lessons.map((lesson) => lesson.startsAt);
    assert.deepEqual(starts, [...starts].sort());
    assert.deepEqual(table.lessons[1]!.participants, [
      { participantId: "lp_les_g1_artem", studentId: "usr_artem", attendance: "PRESENT", joinedAt: mock.store.participants.get("lp_les_g1_artem")!.joinedAt },
      { participantId: "lp_les_g1_kirill", studentId: "usr_kirill", attendance: "ABSENT", joinedAt: null },
      { participantId: "lp_les_g1_polina", studentId: "usr_polina", attendance: "PRESENT", joinedAt: mock.store.participants.get("lp_les_g1_polina")!.joinedAt },
    ]);

    // All five values are present (the unmarked one at the running lesson).
    const values = new Set(table.lessons.flatMap((lesson) => lesson.participants.map((participant) => participant.attendance)));
    assert.deepEqual([...values].sort(), [...ATTENDANCE_STATUSES].sort());
    // The read closed the lesson that ended yesterday: the inactive participant became "absent".
    assert.equal(table.lessons[5]!.participants.find((participant) => participant.studentId === "usr_kirill")!.attendance, "ABSENT");
    // Мария is a member who took part in no lesson: her row has only "did not take part" cells.
    assert.equal(table.lessons.some((lesson) => lesson.participants.some((participant) => participant.studentId === "usr_maria")), false);
  });

  it("narrows the table by period and falls back to the academic year for an unknown value", async () => {
    const mock = await asTeacher();
    const week = await mock.api.groups.getGroupAttendance("grp_8a", "7d");
    assert.deepEqual([week.period, week.since], ["7d", iso(T0 - 7 * DAY_MS)]);
    assert.deepEqual(week.lessons.map((lesson) => lesson.id), ["les_g4", "les_g_unfinalized", "les_live"]);
    const month = await mock.api.groups.getGroupAttendance("grp_8a", "30d");
    assert.deepEqual([month.period, month.since, month.lessons.length], ["30d", iso(T0 - 30 * DAY_MS), 7]);
    const fallback = await mock.api.groups.getGroupAttendance("grp_8a", "90d" as ReportPeriod);
    assert.deepEqual([fallback.period, fallback.since], ["year", "2026-08-31T21:00:00.000Z"]);

    // A lesson that started exactly 7 days ago is still inside the week; one millisecond later it is not.
    const g4 = Date.parse(mock.store.lessons.get("les_g4")!.startsAt!);
    mock.clock.set(g4 + 7 * DAY_MS);
    assert.equal((await mock.api.groups.getGroupAttendance("grp_8a", "7d")).lessons[0]!.id, "les_g4");
    mock.clock.advance(1);
    assert.equal((await mock.api.groups.getGroupAttendance("grp_8a", "7d")).lessons[0]!.id, "les_g_unfinalized");
  });

  it("starts the academic year on 1 September, Moscow time", async () => {
    // 31 August 2027, 23:59 Moscow: still the year that began on 1 September 2026.
    const before = createTestMock({ start: "2027-08-31T20:59:00.000Z" });
    await before.signIn("teacher@example.com");
    assert.equal((await before.api.groups.getGroupAttendance("grp_empty")).since, "2026-08-31T21:00:00.000Z");
    // One minute later it is 1 September in Moscow (still 31 August in UTC).
    before.clock.advance(60_000);
    assert.equal((await before.api.groups.getGroupAttendance("grp_empty")).since, "2027-08-31T21:00:00.000Z");
  });

  it("keeps a former member's marks inside the lessons and shows only lessons the viewer owns", async () => {
    const mock = await asTeacher();
    await mock.api.groups.removeGroupMember("grp_8a", "usr_polina");
    const table = await mock.api.groups.getGroupAttendance("grp_8a");
    assert.deepEqual(table.members.map((member) => member.id), ["usr_artem", "usr_kirill", "usr_maria"]);
    assert.ok(table.lessons[0]!.participants.some((participant) => participant.studentId === "usr_polina"));
    assert.deepEqual((await mock.api.groups.getGroupAttendance("grp_empty")).lessons, []);

    // A lesson of the same group created by somebody else is not the teacher's resource.
    mock.store.lessons.insert({ ...mock.store.lessons.get("les_g1")!, id: "les_dev_in_8a", teacherId: "usr_dev" });
    assert.equal((await mock.api.groups.getGroupAttendance("grp_8a")).lessons.some((lesson) => lesson.id === "les_dev_in_8a"), false);
    assert.equal((await mock.api.groups.getGroup("grp_8a")).lessons.total, 10);

    await switchTo(mock, "dev@example.com");
    assert.equal((await mock.api.groups.getGroupAttendance("grp_8a")).lessons.some((lesson) => lesson.id === "les_dev_in_8a"), true);
    // Igor's group has only a lesson in the future.
    const foreign = await mock.api.groups.getGroupAttendance("grp_10b");
    assert.deepEqual([foreign.members.length, foreign.lessons], [2, []]);
  });

  it("sets a mark by hand: any value, any lesson status, with the realtime event and nothing else touched", async () => {
    const mock = await asTeacher();
    const { events, unsubscribe } = listen(mock);
    await settle();
    const before = mock.store.participants.get("lp_les_live_kirill")!;
    mock.clock.advance(1000);

    assert.deepEqual(await mock.api.groups.setAttendance("les_live", "lp_les_live_kirill", "PRESENT"), { attendance: "PRESENT" });
    await settle();
    const after = mock.store.participants.get("lp_les_live_kirill")!;
    assert.deepEqual({ ...after, attendance: before.attendance, updatedAt: before.updatedAt }, before);
    assert.deepEqual([after.attendance, after.joinedAt, after.updatedAt], ["PRESENT", null, iso(T0 + 1000)]);
    assert.deepEqual(events, [{ kind: "lesson-activity", lessonId: "les_live", teacherId: "usr_anna", studentId: "usr_kirill", occurredAt: iso(T0 + 1000) }]);
    // No number status changes and no journal row for a mark.
    assert.equal(mock.store.auditLogs.filter((row) => row.createdAt === iso(T0 + 1000)).length, 0);

    // Every value is accepted, UNKNOWN included; finished and individual lessons too.
    for (const value of ATTENDANCE_STATUSES) {
      assert.deepEqual(await mock.api.groups.setAttendance("les_g1", "lp_les_g1_artem", value), { attendance: value });
      assert.equal(mock.store.participants.get("lp_les_g1_artem")!.attendance, value);
    }
    const solo = mock.store.participants.by("lessonId", "les_d1")[0]!;
    assert.deepEqual(await mock.api.groups.setAttendance("les_d1", solo.id, "LATE"), { attendance: "LATE" });
    unsubscribe();
  });

  it("never lets the automatic rules overwrite a mark set by hand", async () => {
    const mock = await asTeacher();
    await mock.api.groups.setAttendance("les_g_unfinalized", "lp_les_g_unfinalized_kirill", "EXCUSED");
    const table = await mock.api.groups.getGroupAttendance("grp_8a", "7d");
    assert.equal(mock.store.lessons.get("les_g_unfinalized")!.status, "FINISHED");
    assert.equal(table.lessons[1]!.participants.find((participant) => participant.studentId === "usr_kirill")!.attendance, "EXCUSED");
  });

  it("closes the running lesson once its time is over: the silent participant becomes absent", async () => {
    const mock = await asTeacher();
    const { events, unsubscribe } = listen(mock);
    await settle();
    // The lesson started 25 minutes before T0 and lasts 90 minutes.
    mock.clock.advance(64 * 60_000);
    let table = await mock.api.groups.getGroupAttendance("grp_8a", "7d");
    await settle();
    assert.deepEqual([table.lessons[2]!.id, table.lessons[2]!.status], ["les_live", "ACTIVE"]);
    assert.equal(mock.store.participants.get("lp_les_live_kirill")!.attendance, "UNKNOWN");
    assert.equal(events.some((event) => event.kind === "lesson-activity" && event.lessonId === "les_live"), false);

    mock.clock.advance(60_000);
    table = await mock.api.groups.getGroupAttendance("grp_8a", "7d");
    await settle();
    assert.deepEqual([table.lessons[2]!.id, table.lessons[2]!.status], ["les_live", "FINISHED"]);
    assert.deepEqual(table.lessons[2]!.participants.map((participant) => [participant.studentId, participant.attendance]), [
      ["usr_artem", "PRESENT"],
      ["usr_kirill", "ABSENT"],
      ["usr_polina", "PRESENT"],
    ]);
    assert.equal(mock.store.lessons.get("les_live")!.status, "FINISHED");
    assert.equal(events.some((event) => event.kind === "lesson-activity" && event.lessonId === "les_live"), true);
    unsubscribe();
  });

  it("leaves a lesson that ended more than 48 hours ago unmarked", async () => {
    const mock = await asTeacher();
    mock.clock.advance(3 * DAY_MS);
    const table = await mock.api.groups.getGroupAttendance("grp_8a");
    const mark = (lessonId: string) => table.lessons.find((lesson) => lesson.id === lessonId)!;
    // Finished by the schedule, but outside the window of the lazy closing: the marks stay "not marked".
    for (const lessonId of ["les_g_unfinalized", "les_live"]) {
      assert.equal(mark(lessonId).status, "FINISHED");
      assert.equal(mark(lessonId).participants.find((participant) => participant.studentId === "usr_kirill")!.attendance, "UNKNOWN");
      assert.equal(mock.store.lessons.get(lessonId)!.status, "PLANNED");
    }
    // The lessons planned at T0 for the next days have started meanwhile and joined the table.
    assert.ok(table.lessons.some((lesson) => lesson.id === "les_tomorrow_group"));
    // A mark by hand is still possible at any time.
    assert.deepEqual(await mock.api.groups.setAttendance("les_live", "lp_les_live_kirill", "ABSENT"), { attendance: "ABSENT" });
  });

  it("rejects an invalid mark before it looks the participant up", async () => {
    const mock = await asTeacher();
    for (const value of ["present", "", "SICK", null, undefined, 1]) {
      const error = await rejects(mock.api.groups.setAttendance("les_live", "lp_les_live_kirill", value as AttendanceStatus), "invalidMark", 400);
      assert.equal(error.message, "Некорректная отметка.");
    }
    await rejects(mock.api.groups.setAttendance("les_nope", "lp_nope", "SICK" as AttendanceStatus), "invalidMark", 400);
    mock.setLocale("en");
    assert.equal((await rejects(mock.api.groups.setAttendance("les_live", "lp_les_live_kirill", "x" as AttendanceStatus), "invalidMark", 400)).message, "Invalid attendance mark.");
    assert.equal(mock.store.participants.get("lp_les_live_kirill")!.attendance, "UNKNOWN");
  });

  it("answers 404 for a participant that is missing, of another lesson, of a draft, foreign or no longer the teacher's", async () => {
    const mock = await asTeacher();
    const set = (lessonId: string, participantId: string) => mock.api.groups.setAttendance(lessonId, participantId, "LATE");
    assert.equal((await rejects(set("les_live", "lp_nope"), "participantNotFound", 404)).message, "Участник занятия не найден.");
    await rejects(set("les_g1", "lp_les_live_kirill"), "participantNotFound", 404);
    await rejects(set("les_nope", "lp_les_live_kirill"), "participantNotFound", 404);

    // Drafts share the participant table but are not lessons.
    const draft = mock.store.lessons.find((lesson) => lesson.kind === "HOMEWORK" && lesson.teacherId === "usr_anna")!;
    const draftParticipant = mock.store.participants.by("lessonId", draft.id)[0]!;
    await rejects(set(draft.id, draftParticipant.id), "participantNotFound", 404);

    const foreign = mock.store.participants.by("lessonId", "les_igor_1")[0]!;
    await rejects(set("les_igor_1", foreign.id), "participantNotFound", 404);
    assert.equal(mock.store.participants.get(foreign.id)!.attendance, foreign.attendance);

    // The lesson is the teacher's, the student is not any more.
    mock.store.users.update("usr_polina", { teacherId: "usr_igor" });
    await rejects(set("les_live", "lp_les_live_polina"), "participantNotFound", 404);
    assert.equal(mock.store.participants.get("lp_les_live_polina")!.attendance, "PRESENT");

    await switchTo(mock, "dev@example.com");
    assert.deepEqual(await set("les_igor_1", foreign.id), { attendance: "LATE" });
    assert.deepEqual(await set("les_live", "lp_les_live_polina"), { attendance: "LATE" });
    await rejects(set(draft.id, draftParticipant.id), "participantNotFound", 404);
  });

  it("allows 240 marks a minute and refuses the next one until the window ends", async () => {
    const mock = await asTeacher();
    mock.clock.advance(15_000);
    for (let call = 0; call < 240; call += 1) {
      await mock.api.groups.setAttendance("les_live", "lp_les_live_kirill", call % 2 === 0 ? "PRESENT" : "LATE");
    }
    const error = await rejects(mock.api.groups.setAttendance("les_live", "lp_les_live_kirill", "ABSENT"), "rateLimited", 429);
    assert.deepEqual([error.retryAfterSeconds, error.message], [45, "Слишком много запросов. Подождите немного и попробуйте снова."]);
    assert.equal(mock.store.participants.get("lp_les_live_kirill")!.attendance, "LATE");
    // The limit is consumed before validation, so a refused call is refused whatever it carries.
    await rejects(mock.api.groups.setAttendance("les_live", "lp_les_live_kirill", "nope" as AttendanceStatus), "rateLimited", 429);

    mock.clock.advance(45_000);
    assert.deepEqual(await mock.api.groups.setAttendance("les_live", "lp_les_live_kirill", "ABSENT"), { attendance: "ABSENT" });
  });
});

describe("groups: attendance PDF", () => {
  it("downloads the document of a period and names it like the site", async () => {
    const requests: MockDocumentRequest[] = [];
    const mock = createTestMock({
      materializeDocument: async (request) => {
        requests.push(request);
        return `file:///cache/${requests.length}.pdf`;
      },
    });
    await mock.signIn("teacher@example.com");

    assert.deepEqual(await mock.api.groups.downloadGroupAttendancePdf("grp_8a", "7d"), { uri: "file:///cache/1.pdf", fileName: "Посещаемость — 8А — алгебра — Неделя — 2026-11-16.pdf" });
    assert.equal((await mock.api.groups.downloadGroupAttendancePdf("grp_8a", "30d")).fileName, "Посещаемость — 8А — алгебра — 30 дней — 2026-11-16.pdf");
    assert.equal((await mock.api.groups.downloadGroupAttendancePdf("grp_empty", "year")).fileName, "Посещаемость — Резерв (пустая группа) — Учебный год — 2026-11-16.pdf");
    // Anything else is the week.
    assert.equal((await mock.api.groups.downloadGroupAttendancePdf("grp_8a", "month" as ReportPeriod)).fileName, "Посещаемость — 8А — алгебра — Неделя — 2026-11-16.pdf");
    assert.deepEqual(requests[0], { kind: "groupAttendance", sample: "pdfShort", mimeType: "application/pdf", fileName: "Посещаемость — 8А — алгебра — Неделя — 2026-11-16.pdf" });
    // A response carries a local file URI and a name — never a server URL.
    assert.equal(requests.length, 4);
  });

  it("uses the UTC date in the file name, as the site does", async () => {
    // 17 November 00:30 in Moscow is still 16 November in UTC.
    const mock = createTestMock({ start: "2026-11-16T21:30:00.000Z" });
    await mock.signIn("teacher@example.com");
    const file = await mock.api.groups.downloadGroupAttendancePdf("grp_8a", "year");
    assert.equal(file.fileName, "Посещаемость — 8А — алгебра — Учебный год — 2026-11-16.pdf");
    assert.equal(file.uri, "mock-sample://pdfShort");
  });

  it("answers 404 for a foreign group and 500 exportFailed when the document cannot be built", async () => {
    let fail = false;
    const mock = createTestMock({
      materializeDocument: async () => {
        if (fail) throw new Error("disk full");
        return "file:///cache/a.pdf";
      },
    });
    await mock.signIn("teacher@example.com");
    await rejects(mock.api.groups.downloadGroupAttendancePdf("grp_10b", "7d"), "groupNotFound", 404);
    await rejects(mock.api.groups.downloadGroupAttendancePdf("grp_nope", "7d"), "groupNotFound", 404);

    fail = true;
    const error = await rejects(mock.api.groups.downloadGroupAttendancePdf("grp_8a", "7d"), "exportFailed", 500);
    assert.equal(error.message, "Не удалось сформировать отчёт. Попробуйте ещё раз.");
    mock.setLocale("en");
    assert.equal((await rejects(mock.api.groups.downloadGroupAttendancePdf("grp_8a", "7d"), "exportFailed", 500)).message, "Could not build the report. Please try again.");

    fail = false;
    await switchTo(mock, "dev@example.com");
    assert.equal((await mock.api.groups.downloadGroupAttendancePdf("grp_10b", "30d")).fileName, "Посещаемость — 10Б — профиль — 30 дней — 2026-11-16.pdf");
  });

  it("allows 5 exports per 5 minutes in the bucket shared with the student report", async () => {
    const mock = await asTeacher();
    mock.clock.advance(100_000);
    // The limit is consumed before the group is looked up: refused and failed exports count too.
    await rejects(mock.api.groups.downloadGroupAttendancePdf("grp_10b", "7d"), "groupNotFound", 404);
    for (let call = 0; call < 4; call += 1) await mock.api.groups.downloadGroupAttendancePdf("grp_8a", "7d");
    const error = await rejects(mock.api.groups.downloadGroupAttendancePdf("grp_8a", "7d"), "rateLimited", 429);
    assert.equal(error.retryAfterSeconds, 200);
    assert.deepEqual(
      mock.api.controls.listLimiters().filter((bucket) => bucket.scope === "api:pdf-export").map((bucket) => [bucket.identifier, bucket.hits]),
      [["usr_anna", 6]],
    );

    mock.clock.advance(200_000);
    await mock.api.groups.downloadGroupAttendancePdf("grp_8a", "7d");

    // The student report fills the same bucket.
    mock.api.controls.exhaust("api:pdf-export", "usr_anna");
    assert.equal((await rejects(mock.api.groups.downloadGroupAttendancePdf("grp_8a", "year"), "rateLimited", 429)).retryAfterSeconds, 300);
    // Another user has an own bucket.
    await switchTo(mock, "dev@example.com");
    await mock.api.groups.downloadGroupAttendancePdf("grp_8a", "year");
  });
});

describe("groups: demo controls", () => {
  it("fails a call on demand with the entity code of the method and leaves the store alone", async () => {
    const mock = await asTeacher();
    const force = (method: string, error: "notFound" | "serviceUnavailable" | "network") => mock.api.controls.set("forceNextError", { method, error, times: 1 });

    force("groups.getGroup", "notFound");
    await rejects(mock.api.groups.getGroup("grp_8a"), "groupNotFound", 404);
    force("groups.setAttendance", "notFound");
    await rejects(mock.api.groups.setAttendance("les_live", "lp_les_live_kirill", "PRESENT"), "participantNotFound", 404);
    force("groups.setStudentAiProfile", "notFound");
    await rejects(mock.api.groups.setStudentAiProfile("usr_artem", { speed: 1, aiNote: null }), "studentNotFound", 404);
    force("groups.deleteGroup", "serviceUnavailable");
    assert.equal((await rejects(mock.api.groups.deleteGroup("grp_8a"), "serviceUnavailable", 503)).retryAfterSeconds, 5);
    force("groups.createGroup", "network");
    await rejects(mock.api.groups.createGroup({ name: "Сеть" }), "network", 0);

    assert.equal(mock.store.groups.size, 3);
    assert.equal(mock.store.participants.get("lp_les_live_kirill")!.attendance, "UNKNOWN");
    assert.equal(mock.store.profiles.findUnique("userId", "usr_artem")!.speed, 8);
    // The switch is one-shot.
    assert.equal((await mock.api.groups.getGroup("grp_8a")).group.id, "grp_8a");

    mock.setOnline(false);
    await rejects(mock.api.groups.listGroups(), "network", 0);
  });
});
