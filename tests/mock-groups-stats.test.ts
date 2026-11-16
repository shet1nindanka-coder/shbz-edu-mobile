// Mock backend, member `groups` — part 3: the developer statistics (docs/spec/06-teacher-groups-calls-stats.md
// §1.6, §3.12 – §3.13, §4.5 – §4.8; 00 §2.11; 90-addendum-4 §3.4).
// Node's test runner and assert are typed by referencing only their declaration files: the project does not
// load `@types/node` globally (it would change DOM / React Native globals such as the timer return types).
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError } from "../src/api/errors";
import type { AnyApiErrorCode } from "../src/api/errors";
import type { Lesson, LessonStatus } from "../src/api/types";
import { deriveLessonStatus } from "../src/domain/lesson-status";
import { DAY_MS, addDaysToDayKey, mskDayKey } from "../src/domain/moscow-time";
import { completionPercent } from "../src/domain/statuses";
import { TEST_T0, createTestMock, type TestMock } from "../src/mock/testing";

const T0 = Date.parse(TEST_T0);
const iso = (ms: number) => new Date(ms).toISOString();
/** Monday 00:00 Moscow of the week of `TEST_T0`, and the first of the twelve weeks. */
const CURRENT_MONDAY = Date.parse("2026-11-15T21:00:00.000Z");
const WINDOW_START = CURRENT_MONDAY - 11 * 7 * DAY_MS;

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

async function asDeveloper(): Promise<TestMock> {
  const mock = createTestMock();
  await mock.signIn("dev@example.com");
  return mock;
}

/** Statuses of the store by colour, for comparing with the counters. */
function colours(mock: TestMock, filter: (row: { studentId: string; homeworkNumberId: string }) => boolean = () => true) {
  const rows = mock.store.statuses.filter((row) => row.status !== null && filter(row));
  return {
    green: rows.filter((row) => row.status === "GREEN").length,
    yellow: rows.filter((row) => row.status === "YELLOW").length,
    red: rows.filter((row) => row.status === "RED").length,
    marked: rows.length,
  };
}

describe("statistics: access", () => {
  it("is for developers only", async () => {
    const mock = createTestMock();
    await rejects(mock.api.groups.getStatisticsProgress(), "sessionExpired", 401);
    for (const login of ["teacher@example.com", "ilya@example.com"]) {
      mock.signOut();
      await mock.signIn(login);
      const error = await rejects(mock.api.groups.getStatisticsProgress(), "developerRightsRequired", 403);
      assert.equal(error.message, "Нужны права разработчика.");
      await rejects(mock.api.groups.getStatisticsDrilldown("top_linear", "usr_ilya"), "developerRightsRequired", 403);
      await rejects(mock.api.groups.getStatisticsTeachers(), "developerRightsRequired", 403);
      await rejects(mock.api.groups.getStatisticsPlatform(), "developerRightsRequired", 403);
    }
    // The role refusal comes before the drilldown limit.
    assert.equal(mock.api.controls.listLimiters().some((bucket) => bucket.scope === "api:statistics-drilldown"), false);
  });
});

describe("statistics: student progress", () => {
  it("counts every student and every topic over the whole bank", async () => {
    const mock = await asDeveloper();
    const { overview } = await mock.api.groups.getStatisticsProgress();

    // All ten students by name, the one without a teacher included.
    assert.deepEqual(overview.students.map((student) => student.id), ["usr_artem", "usr_dasha", "usr_egor", "usr_ilya", "usr_kirill", "usr_orphan", "usr_maria", "usr_polina", "usr_sofia", "usr_timur"]);
    for (const student of overview.students) {
      const expected = colours(mock, (row) => row.studentId === student.id);
      assert.deepEqual(
        [student.greenCount, student.yellowCount, student.redCount, student.markedCount, student.solvedCount],
        [expected.green, expected.yellow, expected.red, expected.marked, expected.green + expected.yellow],
        student.name,
      );
      assert.deepEqual(Object.keys(student).sort(), ["email", "greenCount", "id", "markedCount", "name", "redCount", "solvedCount", "yellowCount"]);
    }
    assert.deepEqual([overview.students[9]!.markedCount, overview.students[5]!.markedCount], [0, 0]);

    // Topics in display order with slots = numbers × students.
    assert.deepEqual(overview.topics.map((topic) => [topic.id, topic.totalNumbers, topic.totalStudents, topic.totalSlots]), [
      ["top_linear", 8, 10, 80],
      ["top_quadratic", 8, 10, 80],
      ["top_derivative", 6, 10, 60],
      ["top_log", 12, 10, 120],
      ["top_systems", 5, 10, 50],
      ["top_empty", 0, 10, 0],
      ["top_word", 40, 10, 400],
    ]);
    for (const topic of overview.topics) {
      const numberIds = new Set(mock.store.numbers.by("topicId", topic.id).map((number) => number.id));
      const expected = colours(mock, (row) => numberIds.has(row.homeworkNumberId));
      assert.deepEqual([topic.greenCount, topic.yellowCount, topic.redCount, topic.markedCount], [expected.green, expected.yellow, expected.red, expected.marked], topic.title);
      const active = new Set(mock.store.statuses.filter((row) => row.status !== null && numberIds.has(row.homeworkNumberId)).map((row) => row.studentId));
      assert.equal(topic.studentsWithActivity, active.size, topic.title);
      assert.equal(topic.progressPercent, completionPercent(topic.markedCount, topic.totalSlots));
      assert.deepEqual(Object.keys(topic).sort(), ["greenCount", "id", "markedCount", "progressPercent", "redCount", "studentsWithActivity", "title", "totalNumbers", "totalSlots", "totalStudents", "yellowCount"]);
    }
    // The empty topic divides by zero safely.
    assert.deepEqual([overview.topics[5]!.progressPercent, overview.topics[5]!.studentsWithActivity], [0, 0]);

    const files = new Set<string>();
    for (const topic of mock.store.topics.all()) {
      if (topic.theoryFileId) files.add(topic.theoryFileId);
      if (topic.homeworkFileId) files.add(topic.homeworkFileId);
    }
    for (const number of mock.store.numbers.all()) if (number.answerFileId) files.add(number.answerFileId);
    assert.deepEqual(overview.stats, { totalTopics: 7, totalStudents: 10, totalFiles: files.size, totalNumbers: 79, totalMarked: colours(mock).marked });
    assert.ok(files.size > 0);
  });

  it("classifies the issued homework and the distinct issued numbers", async () => {
    const mock = await asDeveloper();
    const { homework } = await mock.api.groups.getStatisticsProgress();

    const assignments = mock.store.homeworks.all();
    const solved = (studentId: string, numberId: string) => {
      const status = mock.store.statuses.findUnique("studentNumber", `${studentId}|${numberId}`)?.status;
      return status === "GREEN" || status === "YELLOW";
    };
    let completed = 0;
    let overdue = 0;
    let photos = 0;
    let withPhotos = 0;
    const issued = new Map<string, string | null>();
    for (const assignment of assignments) {
      const links = mock.store.homeworkNumbers.by("assignmentId", assignment.id);
      for (const link of links) {
        issued.set(`${assignment.studentId}|${link.homeworkNumberId}`, mock.store.statuses.findUnique("studentNumber", `${assignment.studentId}|${link.homeworkNumberId}`)?.status ?? null);
      }
      const done = links.length > 0 && links.every((link) => solved(assignment.studentId, link.homeworkNumberId));
      if (done) completed += 1;
      else if (assignment.deadlineAt !== null && Date.parse(assignment.deadlineAt) < T0) overdue += 1;
      const count =
        mock.store.homeworkPhotos.by("assignmentId", assignment.id).length +
        mock.store.homeworkChecks.by("assignmentId", assignment.id).reduce((sum, check) => sum + mock.store.homeworkCheckPhotos.by("checkId", check.id).length, 0);
      photos += count;
      if (count > 0) withPhotos += 1;
    }
    const values = [...issued.values()];

    assert.deepEqual(homework, {
      total: assignments.length,
      completedCount: completed,
      overdueCount: overdue,
      inProgressCount: assignments.length - completed - overdue,
      withPhotosCount: withPhotos,
      photosTotal: photos,
      issuedNumbersTotal: issued.size,
      issuedNumbersSolved: values.filter((status) => status === "GREEN" || status === "YELLOW").length,
      issuedNumbersGreen: values.filter((status) => status === "GREEN").length,
      issuedNumbersYellow: values.filter((status) => status === "YELLOW").length,
      issuedNumbersRed: values.filter((status) => status === "RED").length,
      issuedNumbersUnmarked: values.filter((status) => status === null).length,
    });
    // Every class of homework and of issued number exists in the demo data.
    for (const value of Object.values(homework)) assert.ok(value > 0);
    // The homework of the student without a teacher is part of the developer's scope.
    assert.ok(assignments.some((assignment) => assignment.id === "hw_orphan_1"));

    // The same numbers issued to the same student again: one more homework, no new issued number.
    const again = mock.store.homeworks.get("hw_sofia_1")!;
    mock.store.homeworks.insert({ ...again, id: "hw_t_again", deadlineAt: null });
    mock.store.homeworkNumbers.by("assignmentId", again.id).forEach((link, index) => mock.store.homeworkNumbers.insert({ id: `hwn_t_again_${index}`, assignmentId: "hw_t_again", homeworkNumberId: link.homeworkNumberId }));
    const repeated = (await mock.api.groups.getStatisticsProgress()).homework;
    assert.deepEqual([repeated.total, repeated.inProgressCount, repeated.issuedNumbersTotal], [homework.total + 1, homework.inProgressCount + 1, homework.issuedNumbersTotal]);
  });

  it("returns 112 Moscow days for everyone or for one student", async () => {
    const mock = await asDeveloper();
    const everyone = await mock.api.groups.getStatisticsProgress();
    assert.equal(everyone.timelineStudentId, null);
    assert.equal(everyone.timeline.length, 112);
    assert.equal(everyone.timeline[111]!.date, "2026-11-16");
    everyone.timeline.forEach((entry, index) => {
      if (index > 0) assert.equal(entry.date, addDaysToDayKey(everyone.timeline[index - 1]!.date, 1));
      assert.deepEqual(Object.keys(entry).sort(), ["closedCount", "date", "redCount"]);
    });
    // Each coloured row counts once, on the Moscow day its colour last changed.
    const from = everyone.timeline[0]!.date;
    const inWindow = mock.store.statuses.filter((row) => row.status !== null && mskDayKey(row.statusChangedAt ?? row.updatedAt) >= from);
    assert.equal(everyone.timeline.reduce((sum, entry) => sum + entry.closedCount, 0), inWindow.filter((row) => row.status !== "RED").length);
    assert.equal(everyone.timeline.reduce((sum, entry) => sum + entry.redCount, 0), inWindow.filter((row) => row.status === "RED").length);
    assert.ok(everyone.timeline.some((entry) => entry.redCount > 0));

    // Софья: one green on each of the three days before today, nothing today and nothing four days ago.
    const sofia = await mock.api.groups.getStatisticsProgress("usr_sofia");
    assert.equal(sofia.timelineStudentId, "usr_sofia");
    assert.deepEqual(sofia.timeline.slice(-5).map((entry) => [entry.date, entry.closedCount, entry.redCount]), [
      ["2026-11-12", 0, 0],
      ["2026-11-13", 1, 0],
      ["2026-11-14", 1, 0],
      ["2026-11-15", 1, 0],
      ["2026-11-16", 0, 0],
    ]);
    assert.deepEqual(sofia.overview, everyone.overview);
    assert.deepEqual(sofia.homework, everyone.homework);

    // An id that is not a student is not an error: the chart shows everyone.
    for (const unknown of ["usr_nobody", "usr_anna", "", "   "]) {
      const fallback = await mock.api.groups.getStatisticsProgress(unknown);
      assert.equal(fallback.timelineStudentId, null);
      assert.deepEqual(fallback.timeline, everyone.timeline);
    }
  });

  it("reflects a new mark at once and moves the window with the Moscow day", async () => {
    const mock = await asDeveloper();
    const before = await mock.api.groups.getStatisticsProgress("usr_timur");
    assert.equal(before.timeline.every((entry) => entry.closedCount === 0 && entry.redCount === 0), true);

    mock.store.statuses.insert({ id: "st_t_1", studentId: "usr_timur", homeworkNumberId: "num_112", status: "YELLOW", note: null, deadlineAt: null, statusChangedAt: TEST_T0, createdAt: TEST_T0, updatedAt: TEST_T0 });
    // A row without `statusChangedAt` is dated by `updatedAt`; a row without a colour is not counted.
    mock.store.statuses.insert({ id: "st_t_2", studentId: "usr_timur", homeworkNumberId: "num_113", status: "RED", note: null, deadlineAt: null, statusChangedAt: null, createdAt: TEST_T0, updatedAt: iso(T0 - DAY_MS) });
    mock.store.statuses.insert({ id: "st_t_3", studentId: "usr_timur", homeworkNumberId: "num_118", status: null, note: "вопрос", deadlineAt: null, statusChangedAt: TEST_T0, createdAt: TEST_T0, updatedAt: TEST_T0 });

    const after = await mock.api.groups.getStatisticsProgress("usr_timur");
    assert.deepEqual(after.timeline.slice(-2), [{ date: "2026-11-15", closedCount: 0, redCount: 1 }, { date: "2026-11-16", closedCount: 1, redCount: 0 }]);
    const timur = after.overview.students.find((student) => student.id === "usr_timur")!;
    assert.deepEqual([timur.yellowCount, timur.redCount, timur.markedCount, timur.solvedCount], [1, 1, 2, 1]);
    assert.equal(after.overview.stats.totalMarked, before.overview.stats.totalMarked + 2);

    // 00:00 Moscow the next day: the window slides by one day.
    mock.clock.advance(12 * 60 * 60 * 1000);
    const nextDay = await mock.api.groups.getStatisticsProgress("usr_timur");
    assert.deepEqual(nextDay.timeline.slice(-3), [{ date: "2026-11-15", closedCount: 0, redCount: 1 }, { date: "2026-11-16", closedCount: 1, redCount: 0 }, { date: "2026-11-17", closedCount: 0, redCount: 0 }]);
    assert.equal(nextDay.timeline.length, 112);
  });
});

describe("statistics: drilldown", () => {
  it("returns the statuses and deadlines of one student for every number of a topic, in display order", async () => {
    const mock = await asDeveloper();
    const { numbers } = await mock.api.groups.getStatisticsDrilldown(" top_quadratic ", " usr_ilya ");
    const expected = mock.store.numbers
      .by("topicId", "top_quadratic")
      .sort((left, right) => left.displayOrder - right.displayOrder)
      .map((number) => {
        const row = mock.store.statuses.findUnique("studentNumber", `usr_ilya|${number.id}`);
        return { status: row?.status ?? null, deadlineAt: row?.deadlineAt ?? null };
      });
    assert.deepEqual(numbers, expected);
    assert.equal(numbers.length, 8);
    // The fixture shows every case: coloured and empty, with and without a mirrored deadline.
    assert.ok(numbers.some((entry) => entry.status === null && entry.deadlineAt !== null));
    assert.ok(numbers.some((entry) => entry.status !== null && entry.deadlineAt === null));
    assert.ok(numbers.some((entry) => entry.status === "RED"));
    for (const entry of numbers) {
      assert.deepEqual(Object.keys(entry).sort(), ["deadlineAt", "status"]);
      if (entry.deadlineAt !== null) assert.equal(entry.deadlineAt, new Date(entry.deadlineAt).toISOString());
    }

    // A student without marks: every entry is empty. The student without a teacher is in scope too.
    assert.deepEqual((await mock.api.groups.getStatisticsDrilldown("top_derivative", "usr_timur")).numbers, Array.from({ length: 6 }, () => ({ status: null, deadlineAt: null })));
    assert.equal((await mock.api.groups.getStatisticsDrilldown("top_linear", "usr_orphan")).numbers.length, 8);
    // An unknown or empty topic is an empty list, not a 404.
    assert.deepEqual(await mock.api.groups.getStatisticsDrilldown("top_nope", "usr_ilya"), { numbers: [] });
    assert.deepEqual(await mock.api.groups.getStatisticsDrilldown("top_empty", "usr_ilya"), { numbers: [] });
  });

  it("requires both parameters and an existing student", async () => {
    const mock = await asDeveloper();
    const error = await rejects(mock.api.groups.getStatisticsDrilldown("", "usr_ilya"), "paramsRequired", 400);
    assert.equal(error.message, "Укажите тему и ученика.");
    await rejects(mock.api.groups.getStatisticsDrilldown("top_linear", "  "), "paramsRequired", 400);
    await rejects(mock.api.groups.getStatisticsDrilldown(undefined as never, undefined as never), "paramsRequired", 400);
    // Parameters are checked before the student is looked up.
    await rejects(mock.api.groups.getStatisticsDrilldown("", "usr_nobody"), "paramsRequired", 400);

    assert.equal((await rejects(mock.api.groups.getStatisticsDrilldown("top_linear", "usr_nobody"), "studentNotFound", 404)).message, "Ученик не найден.");
    await rejects(mock.api.groups.getStatisticsDrilldown("top_linear", "usr_anna"), "studentNotFound", 404);
    await rejects(mock.api.groups.getStatisticsDrilldown("top_nope", "usr_dev"), "studentNotFound", 404);

    mock.setLocale("en");
    assert.equal((await rejects(mock.api.groups.getStatisticsDrilldown("", ""), "paramsRequired", 400)).message, "Specify the topic and the student.");
  });

  it("allows 120 requests a minute", async () => {
    const mock = await asDeveloper();
    mock.clock.advance(30_000);
    // Refused requests use the bucket as well: the limit is the first check after the role.
    await rejects(mock.api.groups.getStatisticsDrilldown("", ""), "paramsRequired", 400);
    await rejects(mock.api.groups.getStatisticsDrilldown("top_linear", "usr_nobody"), "studentNotFound", 404);
    for (let call = 0; call < 118; call += 1) await mock.api.groups.getStatisticsDrilldown("top_linear", "usr_ilya");
    const error = await rejects(mock.api.groups.getStatisticsDrilldown("top_linear", "usr_ilya"), "rateLimited", 429);
    assert.equal(error.retryAfterSeconds, 30);
    await rejects(mock.api.groups.getStatisticsDrilldown("", ""), "rateLimited", 429);
    // The other statistics reads are not limited.
    assert.equal((await mock.api.groups.getStatisticsProgress()).timeline.length, 112);

    mock.clock.advance(30_000);
    assert.equal((await mock.api.groups.getStatisticsDrilldown("top_linear", "usr_ilya")).numbers.length, 8);

    mock.api.controls.set("forceNextError", { method: "groups.getStatisticsDrilldown", error: "notFound", times: 1 });
    await rejects(mock.api.groups.getStatisticsDrilldown("top_linear", "usr_ilya"), "studentNotFound", 404);
  });
});

describe("statistics: by teacher", () => {
  it("attributes students, homework, calls and lessons to each teacher and keeps the rest visible", async () => {
    const mock = await asDeveloper();
    const stats = await mock.api.groups.getStatisticsTeachers();
    assert.deepEqual(stats.teachers.map((entry) => [entry.teacherId, entry.teacherName, entry.teacherEmail]), [
      ["usr_anna", "Анна Петрова", "teacher@example.com"],
      ["usr_igor", "Игорь Соколов", "teacher2@example.com"],
      ["usr_olga", "Ольга Новикова", "teacher3@example.com"],
    ]);

    for (const entry of stats.teachers) {
      const students = mock.store.users.filter((user) => user.role === "STUDENT" && user.teacherId === entry.teacherId).map((user) => user.id);
      const homeworks = mock.store.homeworks.filter((row) => students.includes(row.studentId));
      const calls = mock.store.parentCalls.by("teacherId", entry.teacherId);
      const lessons = mock.store.lessons.filter((row) => row.teacherId === entry.teacherId && row.kind === "LESSON");
      assert.deepEqual(
        {
          studentsCount: entry.studentsCount,
          homeworkTotal: entry.homeworkTotal,
          homework30d: entry.homework30d,
          callsReached: entry.callsReached,
          callsNoAnswer: entry.callsNoAnswer,
          lessonsTotal: entry.lessonsTotal,
          lessonsFinished: entry.lessonsFinished,
        },
        {
          studentsCount: students.length,
          homeworkTotal: homeworks.length,
          homework30d: homeworks.filter((row) => Date.parse(row.createdAt) >= T0 - 30 * DAY_MS).length,
          callsReached: calls.filter((call) => call.outcome === "REACHED").length,
          callsNoAnswer: calls.filter((call) => call.outcome === "NO_ANSWER").length,
          lessonsTotal: lessons.length,
          // The STORED status: only lessons whose results were closed.
          lessonsFinished: lessons.filter((row) => row.status === "FINISHED").length,
        },
        entry.teacherName,
      );
      const happened = lessons.map((row) => Date.parse(row.startsAt ?? row.createdAt));
      assert.equal(entry.lessonsByWeek.length, 12);
      assert.equal(entry.lessonsByWeek.reduce((sum, count) => sum + count, 0), happened.filter((at) => at >= WINDOW_START && at < CURRENT_MONDAY + 7 * DAY_MS).length, entry.teacherName);
    }

    const [anna, igor, olga] = stats.teachers;
    assert.deepEqual([anna!.studentsCount, anna!.lessonsTotal, igor!.studentsCount, igor!.lessonsTotal], [7, 18, 2, 1]);
    assert.ok(anna!.callsNoAnswer > 0 && anna!.lessonsFinished > 0 && anna!.lessonsFinished < anna!.lessonsTotal);
    // Homework drafts are not lessons.
    assert.ok(mock.store.lessons.count((row) => row.teacherId === "usr_anna" && row.kind === "HOMEWORK") > 0);
    // A teacher without anything still has a card with twelve empty weeks.
    assert.deepEqual(olga, {
      teacherId: "usr_olga",
      teacherName: "Ольга Новикова",
      teacherEmail: "teacher3@example.com",
      studentsCount: 0,
      homeworkTotal: 0,
      homework30d: 0,
      callsReached: 0,
      callsNoAnswer: 0,
      lessonsTotal: 0,
      lessonsFinished: 0,
      lessonsByWeek: Array.from({ length: 12 }, () => 0),
      recentLessons: [],
      topTopics: [],
    });

    // Twelve Mondays 00:00 Moscow, oldest first, the last one starting the current week.
    assert.deepEqual(stats.weekStarts, Array.from({ length: 12 }, (_, index) => iso(WINDOW_START + index * 7 * DAY_MS)));
    assert.equal(stats.weekStarts[11], "2026-11-15T21:00:00.000Z");
    // The student without a teacher, their homework, the call of a deleted teacher, the developer's lesson.
    assert.deepEqual(stats.unattributed, { students: 1, homework: 1, calls: 1, lessons: 1 });
  });

  it("lists the recent lessons with the stored status, which a statistics read never changes", async () => {
    const mock = await asDeveloper();
    const anna = (await mock.api.groups.getStatisticsTeachers()).teachers[0]!;
    assert.equal(anna.recentLessons.length, 8);
    const times = anna.recentLessons.map((lesson) => Date.parse(lesson.startsAt ?? lesson.createdAt));
    assert.deepEqual(times, [...times].sort((left, right) => right - left));
    assert.equal(times.every((at) => at <= T0), true);

    const byId = new Map(anna.recentLessons.map((lesson) => [lesson.id, lesson]));
    const stored = (id: string): [LessonStatus, string] => {
      const row = mock.store.lessons.get(id)!;
      return [row.status, deriveLessonStatus(row, T0)];
    };
    // Running now, but nothing ever stores ACTIVE.
    assert.deepEqual([byId.get("les_live")!.status, stored("les_live")], ["PLANNED", ["PLANNED", "ACTIVE"]]);
    // Ended yesterday and not finalised: still "planned" here.
    assert.deepEqual([byId.get("les_g_unfinalized")!.status, stored("les_g_unfinalized")], ["PLANNED", ["PLANNED", "FINISHED"]]);
    assert.equal(byId.get("les_g4")!.status, "FINISHED");
    // Without a time the lesson is dated by its creation.
    assert.deepEqual([byId.get("les_unscheduled")!.startsAt, byId.get("les_unscheduled")!.createdAt], [null, mock.store.lessons.get("les_unscheduled")!.createdAt]);

    const live = byId.get("les_live")!;
    assert.deepEqual(live, {
      id: "les_live",
      title: mock.store.lessons.get("les_live")!.title,
      topicTitle: null,
      groupName: "8А — алгебра",
      participantsCount: 3,
      startsAt: mock.store.lessons.get("les_live")!.startsAt,
      createdAt: mock.store.lessons.get("les_live")!.createdAt,
      status: "PLANNED",
    });
    assert.equal(anna.recentLessons.find((lesson) => lesson.groupName === null)!.participantsCount, 1);

    // Once a teacher's read has closed the lesson, the statistics show it as held.
    mock.signOut();
    await mock.signIn("teacher@example.com");
    await mock.api.groups.getGroup("grp_8a");
    mock.signOut();
    await mock.signIn("dev@example.com");
    const after = (await mock.api.groups.getStatisticsTeachers()).teachers[0]!;
    assert.equal(after.recentLessons.find((lesson) => lesson.id === "les_g_unfinalized")!.status, "FINISHED");
    assert.equal(after.lessonsFinished, anna.lessonsFinished + 1);
  });

  it("builds weeks, top topics and recent lessons from the twelve-week window", async () => {
    const mock = await asDeveloper();
    const template = mock.store.lessons.get("les_igor_1")!;
    const add = (id: string, patch: Partial<Lesson>) =>
      mock.store.lessons.insert({ ...template, id, teacherId: "usr_olga", groupId: null, topicId: null, status: "PLANNED", startsAt: null, finishedAt: null, createdAt: iso(T0 - 100 * DAY_MS), ...patch });
    const at = (days: number) => iso(T0 + days * DAY_MS);

    add("les_o_log1", { topicId: "top_log", startsAt: at(-1), status: "FINISHED" });
    // Unscheduled: it "happened" when it was created.
    add("les_o_log2", { topicId: "top_log", createdAt: at(-2) });
    add("les_o_log3", { topicId: "top_log", startsAt: at(-3), status: "FINISHED" });
    // Scheduled for later this week: counted in the current week, not among the recent ones.
    add("les_o_lin1", { topicId: "top_linear", startsAt: at(2) });
    add("les_o_lin2", { topicId: "top_linear", startsAt: at(-4) });
    add("les_o_quad", { topicId: "top_quadratic", startsAt: at(-5) });
    add("les_o_der", { topicId: "top_derivative", startsAt: at(-6) });
    add("les_o_sys", { topicId: "top_systems", startsAt: at(-7) });
    add("les_o_word", { topicId: "top_word", startsAt: at(-8) });
    add("les_o_trig", { topicId: "top_empty", startsAt: at(-9) });
    add("les_o_none", { startsAt: at(-10) });
    // The edges of the window: its first instant is inside, one millisecond earlier is outside.
    add("les_o_edge", { startsAt: iso(WINDOW_START) });
    add("les_o_old", { topicId: "top_log", startsAt: iso(WINDOW_START - 1) });
    // A homework draft is not a lesson.
    add("hp_o_draft", { kind: "HOMEWORK", topicId: "top_log", createdAt: at(-1) });
    mock.store.participants.insert({ ...mock.store.participants.by("lessonId", "les_igor_1")[0]!, id: "lp_o_1", lessonId: "les_o_log1" });

    const olga = (await mock.api.groups.getStatisticsTeachers()).teachers[2]!;
    assert.deepEqual([olga.lessonsTotal, olga.lessonsFinished], [13, 2]);
    // T0 is Monday 16 November, noon: days −1…−7 fall into the week of 9 November, −8…−10 into the week before.
    assert.deepEqual(olga.lessonsByWeek, [1, 0, 0, 0, 0, 0, 0, 0, 0, 3, 7, 1]);
    assert.deepEqual(olga.topTopics, [
      { title: "Логарифмические уравнения", count: 3 },
      { title: "Линейные уравнения", count: 2 },
      // Equal counts: by title; only five topics are returned.
      { title: "Квадратные функции", count: 1 },
      { title: "Производная и исследование функций", count: 1 },
      { title: "Системы уравнений", count: 1 },
    ]);
    assert.deepEqual(olga.recentLessons.map((lesson) => lesson.id), ["les_o_log1", "les_o_log2", "les_o_log3", "les_o_lin2", "les_o_quad", "les_o_der", "les_o_sys", "les_o_word"]);
    assert.deepEqual(olga.recentLessons[0], { id: "les_o_log1", title: template.title, topicTitle: "Логарифмические уравнения", groupName: null, participantsCount: 1, startsAt: at(-1), createdAt: iso(T0 - 100 * DAY_MS), status: "FINISHED" });
    assert.deepEqual([olga.recentLessons[1]!.startsAt, olga.recentLessons[1]!.createdAt, olga.recentLessons[1]!.participantsCount], [null, at(-2), 0]);
  });

  it("counts homework of the last 30 × 24 hours and moves everything of a deleted teacher outside the cards", async () => {
    const mock = await asDeveloper();
    const base = mock.store.homeworks.get("hw_sofia_1")!;
    // Exactly 30 days old is inside, one millisecond older is not.
    mock.store.homeworks.insert({ ...base, id: "hw_t_edge", createdAt: iso(T0 - 30 * DAY_MS) });
    mock.store.homeworks.insert({ ...base, id: "hw_t_old", createdAt: iso(T0 - 30 * DAY_MS - 1) });
    const before = await mock.api.groups.getStatisticsTeachers();
    assert.deepEqual([before.teachers[1]!.homeworkTotal, before.teachers[1]!.homework30d], [3, 2]);

    // Igor is deleted: his students lose the owner, his calls lose the caller, his lessons go with him.
    assert.equal(mock.ctx.cascade.deleteTeacher("usr_igor"), true);
    const after = await mock.api.groups.getStatisticsTeachers();
    assert.deepEqual(after.teachers.map((entry) => entry.teacherId), ["usr_anna", "usr_olga"]);
    assert.deepEqual(after.unattributed, {
      students: before.unattributed.students + 2,
      homework: before.unattributed.homework + 3,
      calls: before.unattributed.calls + 1,
      lessons: before.unattributed.lessons,
    });
    assert.deepEqual(after.teachers[0], before.teachers[0]);
  });
});

describe("statistics: platform", () => {
  it("measures the completeness of the content and lists the gaps in topic order", async () => {
    const mock = await asDeveloper();
    const platform = await mock.api.groups.getStatisticsPlatform();
    const progress = await mock.api.groups.getStatisticsProgress();
    assert.deepEqual(platform.overview, progress.overview);
    assert.deepEqual(platform.homework, progress.homework);
    assert.deepEqual(Object.keys(platform).sort(), ["content", "homework", "overview"]);

    const blank = (value: string | null) => (value ?? "").trim() === "";
    const numbers = mock.store.numbers.all();
    const topics = mock.store.topics.all().sort((left, right) => left.displayOrder - right.displayOrder);
    assert.deepEqual(
      {
        totalTopics: platform.content.totalTopics,
        totalNumbers: platform.content.totalNumbers,
        numbersWithCondition: platform.content.numbersWithCondition,
        numbersWithAnswer: platform.content.numbersWithAnswer,
        topicsWithTheory: platform.content.topicsWithTheory,
        topicsWithHomeworkFile: platform.content.topicsWithHomeworkFile,
      },
      {
        totalTopics: 7,
        totalNumbers: 79,
        numbersWithCondition: numbers.filter((number) => !blank(number.conditionLatex)).length,
        numbersWithAnswer: numbers.filter((number) => !blank(number.answerLatex)).length,
        topicsWithTheory: 5,
        topicsWithHomeworkFile: topics.filter((topic) => topic.homeworkFileId !== null).length,
      },
    );
    assert.ok(platform.content.numbersWithCondition < 79 && platform.content.numbersWithAnswer < 79);

    const expectedGaps = topics
      .map((topic) => {
        const own = numbers.filter((number) => number.topicId === topic.id);
        return {
          topicId: topic.id,
          title: topic.title,
          noTheoryFile: topic.theoryFileId === null,
          noHomeworkFile: topic.homeworkFileId === null,
          missingConditions: own.filter((number) => blank(number.conditionLatex)).length,
          missingAnswers: own.filter((number) => blank(number.answerLatex)).length,
        };
      })
      .filter((gap) => gap.noTheoryFile || gap.noHomeworkFile || gap.missingConditions > 0 || gap.missingAnswers > 0);
    assert.deepEqual(platform.content.gaps, expectedGaps);
    // More than six gaps would need the "and N more" line; the demo data has a complete topic and several kinds of gap.
    const gap = (topicId: string) => platform.content.gaps.find((row) => row.topicId === topicId);
    assert.equal(gap("top_quadratic"), undefined);
    assert.deepEqual([gap("top_systems")!.noTheoryFile, gap("top_systems")!.noHomeworkFile], [true, true]);
    assert.equal(gap("top_word")!.missingConditions, 5);
    assert.deepEqual([gap("top_empty")!.missingConditions, gap("top_empty")!.missingAnswers], [0, 0]);
  });

  it("treats a whitespace-only statement or answer as missing and follows content changes at once", async () => {
    const mock = await asDeveloper();
    const before = (await mock.api.groups.getStatisticsPlatform()).content;
    const number = mock.store.numbers.by("topicId", "top_quadratic")[0]!;
    mock.store.numbers.update(number.id, { conditionLatex: " \n\t ", answerLatex: "" });

    const after = (await mock.api.groups.getStatisticsPlatform()).content;
    assert.deepEqual([after.numbersWithCondition, after.numbersWithAnswer], [before.numbersWithCondition - 1, before.numbersWithAnswer - 1]);
    assert.deepEqual(after.gaps.find((row) => row.topicId === "top_quadratic"), {
      topicId: "top_quadratic",
      title: "Квадратные функции",
      noTheoryFile: false,
      noHomeworkFile: false,
      missingConditions: 1,
      missingAnswers: 1,
    });
    assert.equal(after.gaps.length, before.gaps.length + 1);
  });
});
