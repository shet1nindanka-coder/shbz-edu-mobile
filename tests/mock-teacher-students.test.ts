// `teacherStudents` member of the mock backend, part 1: teacher home, students list, create / delete /
// password reset, the student card header, the homework review data, the assign board, the lessons tab and
// the PDF report (docs/spec/04-teacher-students.md; 00 §2.8). Statuses, deadlines, issue / cancel and the
// progress history are in `mock-teacher-students-homework.test.ts`.
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
import type { HomeworkNumberStatus, RealtimeEvent, ReportPeriod } from "../src/api/types";
import { DAY_MS, MINUTE_MS } from "../src/domain/moscow-time";
import { getDictionary } from "../src/i18n/get-dictionary";
import { getMobileDictionary } from "../src/i18n/mobile";
import type { MockDocumentRequest } from "../src/mock/assets";
import { MOCK_COVERAGE } from "../src/mock/fixtures/coverage";
import { TEST_T0, createTestMock, type TestMock } from "../src/mock/testing";

const T0 = Date.parse(TEST_T0);
const ru = getDictionary("ru");
const en = getDictionary("en");

const ANNA = "teacher@example.com";
const IGOR = "teacher2@example.com";
const OLGA = "teacher3@example.com";
const DEV = "dev@example.com";

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

/** Lets queued microtasks (realtime delivery, the start of a pending call) run. */
async function settle(turns = 20): Promise<void> {
  for (let index = 0; index < turns; index += 1) await Promise.resolve();
}

/** Subscribes to the realtime stream of the signed-in user and collects what is delivered. */
async function listen(mock: TestMock): Promise<{ events: RealtimeEvent[]; kinds: () => string[] }> {
  const events: RealtimeEvent[] = [];
  mock.api.shell.subscribeRealtime((event) => events.push(event));
  await settle();
  return { events, kinds: () => events.map((event) => event.kind) };
}

const coverage = (key: string) => {
  const row = MOCK_COVERAGE.find((entry) => entry.key === key);
  assert.ok(row, `coverage row "${key}"`);
  return row;
};

const statusOf = (mock: TestMock, studentId: string, label: string) => mock.store.statuses.findUnique("studentNumber", `${studentId}|num_${label}`);

/** One thunk per method, with arguments that are valid for Anna. */
function everyMethod(mock: TestMock): Record<string, () => Promise<unknown>> {
  const api = mock.api.teacherStudents;
  const deadlineAt = new Date(T0 + 3 * DAY_MS).toISOString();
  return {
    getTeacherHome: () => api.getTeacherHome(),
    listStudents: () => api.listStudents(),
    createStudent: () => api.createStudent({ name: "Новый Ученик", login: "new-student@example.com", password: "Uchenik-beku4725" }),
    deleteStudent: () => api.deleteStudent("usr_dasha"),
    resetStudentPassword: () => api.resetStudentPassword("usr_ilya", "Smirnov-beku4725"),
    getStudentCard: () => api.getStudentCard("usr_ilya"),
    getStudentHomeworks: () => api.getStudentHomeworks("usr_ilya"),
    getAssignBoard: () => api.getAssignBoard("usr_ilya"),
    issueHomework: () => api.issueHomework({ studentId: "usr_ilya", topicId: "top_linear", homeworkNumberIds: ["num_120"], deadlineAt }),
    cancelHomework: () => api.cancelHomework("hw_ilya_far"),
    setNumberStatus: () => api.setNumberStatus("usr_ilya", "num_120", "GREEN"),
    setNumberStatuses: () => api.setNumberStatuses("usr_ilya", [{ homeworkNumberId: "num_120", status: "RED" }]),
    setNumberDeadlines: () => api.setNumberDeadlines("usr_ilya", { topicId: "top_linear", homeworkNumberIds: ["num_120"], deadlineAt }),
    getProgressHistory: () => api.getProgressHistory("usr_ilya", "num_118"),
    listStudentLessons: () => api.listStudentLessons("usr_ilya"),
    downloadStudentReport: () => api.downloadStudentReport("usr_ilya", "7d"),
  };
}

const TEACHER_ONLY = [
  "getTeacherHome",
  "listStudents",
  "createStudent",
  "getStudentCard",
  "getStudentHomeworks",
  "getAssignBoard",
  "setNumberStatus",
  "setNumberStatuses",
  "setNumberDeadlines",
  "listStudentLessons",
];

describe("teacherStudents: sessions and roles", () => {
  it("answers 401 sessionExpired on every method without a session", async () => {
    const mock = createTestMock();
    const methods = everyMethod(mock);
    assert.equal(Object.keys(methods).length, 16);
    for (const [name, call] of Object.entries(methods)) {
      const error = await rejects(call(), "sessionExpired", 401);
      assert.equal(error.message, ru.apiCommon.sessionExpired, name);
    }
  });

  it("refuses a student on every method with 403 unauthorized and changes nothing", async () => {
    const mock = createTestMock();
    await mock.signIn("ilya@example.com");
    const before = { users: mock.store.users.size, homeworks: mock.store.homeworks.size, events: mock.store.progressEvents.size };
    for (const [name, call] of Object.entries(everyMethod(mock))) {
      const error = await rejects(call(), "unauthorized", 403);
      // The progress history is the one endpoint whose role refusal has its own text.
      assert.equal(error.message, name === "getProgressHistory" ? ru.apiContent.progressHistory.forbidden : ru.apiCommon.unauthorized, name);
    }
    assert.deepEqual({ users: mock.store.users.size, homeworks: mock.store.homeworks.size, events: mock.store.progressEvents.size }, before);
  });

  it("refuses a developer on the teacher-only methods and lets the role through on the others", async () => {
    const mock = createTestMock();
    await mock.signIn(DEV);
    const methods = everyMethod(mock);
    for (const name of TEACHER_ONLY) {
      const error = await rejects(methods[name]!(), "unauthorized", 403);
      assert.equal(error.message, ru.apiCommon.unauthorized, name);
    }
    // A developer may act on ANY student through the remaining six.
    for (const name of Object.keys(methods).filter((entry) => !TEACHER_ONLY.includes(entry))) {
      await methods[name]!();
    }
    assert.equal(mock.store.users.has("usr_dasha"), false);
    assert.equal(mock.store.homeworks.has("hw_ilya_far"), false);
  });

  it("honours the forced errors of the demo screen with the 404 code of each method", async () => {
    const mock = createTestMock();
    await mock.signIn(ANNA);
    assert.equal(coverage("anyCall.forcedError").control, "forceNextError");
    const methods = everyMethod(mock);
    const expected: Record<string, AnyApiErrorCode> = {
      issueHomework: "studentOrNumberNotFound",
      cancelHomework: "homeworkNotFound",
      setNumberStatus: "studentOrNumberNotFound",
      setNumberStatuses: "studentOrNumberNotFound",
      setNumberDeadlines: "studentOrNumberNotFound",
      getProgressHistory: "historyNotFound",
    };
    const before = { users: mock.store.users.size, homeworks: mock.store.homeworks.size, events: mock.store.progressEvents.size, buckets: mock.api.controls.listLimiters().length };
    for (const [name, call] of Object.entries(methods)) {
      mock.api.controls.set("forceNextError", { method: `teacherStudents.${name}`, error: "notFound", times: 1 });
      await rejects(call(), expected[name] ?? "studentNotFound", 404);
    }
    mock.api.controls.set("forceNextError", { method: "teacherStudents.downloadStudentReport", error: "serviceUnavailable", times: 1 });
    assert.equal((await rejects(methods.downloadStudentReport!(), "serviceUnavailable", 503)).retryAfterSeconds, 5);
    mock.api.controls.set("forceNextError", { method: "*", error: "network", times: 1 });
    await rejects(methods.createStudent!(), "network", 0);
    // A forced error is raised before the method runs: nothing was written and no limiter slot was used.
    assert.deepEqual({ users: mock.store.users.size, homeworks: mock.store.homeworks.size, events: mock.store.progressEvents.size, buckets: mock.api.controls.listLimiters().length }, before);
    // One-shot: the next call goes through.
    assert.equal((await mock.api.teacherStudents.getStudentCard("usr_ilya")).student.id, "usr_ilya");

    // Offline: every call fails with the client-side network error.
    mock.setOnline(false);
    await rejects(mock.api.teacherStudents.listStudents(), "network", 0);
    mock.setOnline(true);
    assert.equal((await mock.api.teacherStudents.listStudents()).students.length, 7);
  });

  it("localises error texts for the request language", async () => {
    const mock = createTestMock({ locale: "en" });
    await mock.signIn(ANNA);
    assert.equal((await rejects(mock.api.teacherStudents.getStudentCard("usr_sofia"), "studentNotFound", 404)).message, en.apiCommon.studentNotFound);
    mock.setLocale("ru");
    assert.equal((await rejects(mock.api.teacherStudents.getStudentCard("usr_sofia"), "studentNotFound", 404)).message, ru.apiCommon.studentNotFound);
  });
});

describe("teacherStudents: home and students list", () => {
  it("counts the shared bank, the teacher's own students and the parent-call reminders", async () => {
    const mock = createTestMock();
    await mock.signIn(ANNA);
    const home = await mock.api.teacherStudents.getTeacherHome();

    const own = mock.store.users.by("teacherId", "usr_anna").map((user) => user.id);
    const marked = mock.store.statuses.count((row) => row.status !== null && own.includes(row.studentId));
    // Theory + homework files of the topics; the answers file of a topic does not count.
    const bankFiles = new Set<string>();
    for (const topic of mock.store.topics.all()) {
      for (const id of [topic.theoryFileId, topic.homeworkFileId]) if (id) bankFiles.add(id);
    }
    for (const number of mock.store.numbers.all()) if (number.answerFileId) bankFiles.add(number.answerFileId);

    assert.deepEqual(home.stats, { totalTopics: 7, totalNumbers: 79, totalStudents: 7, totalFiles: bankFiles.size, totalMarked: marked });
    assert.equal(home.stats.totalFiles, 8);
    assert.ok(marked > 0);
    // Артём and Мария are due, Кирилл is overdue (09 §2.10).
    assert.deepEqual(home.calls, { due: 2, overdue: 1 });
  });

  it("shows another teacher only their own students and an empty teacher zeros", async () => {
    const mock = createTestMock();
    await mock.signIn(IGOR);
    const igor = await mock.api.teacherStudents.getTeacherHome();
    assert.equal(igor.stats.totalStudents, 2);
    assert.equal(igor.stats.totalTopics, 7);
    assert.deepEqual(igor.calls, { due: 1, overdue: 0 });
    assert.deepEqual((await mock.api.teacherStudents.listStudents()).students.map((student) => student.id), ["usr_egor", "usr_sofia"]);

    await mock.signIn(OLGA);
    const olga = await mock.api.teacherStudents.getTeacherHome();
    assert.deepEqual(olga.stats, { totalTopics: 7, totalNumbers: 79, totalStudents: 0, totalFiles: 8, totalMarked: 0 });
    assert.deepEqual(olga.calls, { due: 0, overdue: 0 });
    assert.deepEqual(await mock.api.teacherStudents.listStudents(), { students: [] });
  });

  it("moves a student from ok to due to overdue as the calendar days pass", async () => {
    const mock = createTestMock();
    await mock.signIn(OLGA);
    await mock.api.teacherStudents.createStudent({ name: "Вера Ким", login: "vera@example.com", password: "Kim-beku4725" });
    assert.deepEqual((await mock.api.teacherStudents.getTeacherHome()).calls, { due: 0, overdue: 0 });
    mock.clock.advance(29 * DAY_MS);
    assert.deepEqual((await mock.api.teacherStudents.getTeacherHome()).calls, { due: 0, overdue: 0 });
    // The session lives 30 days: sign in again before the boundary days.
    await mock.signIn(OLGA);
    mock.clock.advance(DAY_MS);
    assert.deepEqual((await mock.api.teacherStudents.getTeacherHome()).calls, { due: 1, overdue: 0 });
    mock.clock.advance(15 * DAY_MS);
    assert.deepEqual((await mock.api.teacherStudents.getTeacherHome()).calls, { due: 0, overdue: 1 });
  });

  it("lists own students by name with the status counters and never a password", async () => {
    const mock = createTestMock();
    await mock.signIn(ANNA);
    const { students } = await mock.api.teacherStudents.listStudents();
    assert.deepEqual(
      students.map((student) => student.name),
      ["Артём Кузнецов", "Даша Белова", "Илья Смирнов", "Кирилл Зайцев", "Мария Волкова", "Полина Морозова", "Тимур Новиков"],
    );
    for (const student of students) {
      assert.deepEqual(Object.keys(student).sort(), ["email", "greenCount", "id", "markedCount", "name", "redCount", "solvedCount", "yellowCount"]);
      const rows = mock.store.statuses.by("studentId", student.id);
      const count = (status: HomeworkNumberStatus) => rows.filter((row) => row.status === status).length;
      assert.equal(student.greenCount, count("GREEN"));
      assert.equal(student.yellowCount, count("YELLOW"));
      assert.equal(student.redCount, count("RED"));
      assert.equal(student.markedCount, student.greenCount + student.yellowCount + student.redCount);
      assert.equal(student.solvedCount, student.greenCount + student.yellowCount);
    }
    const ilya = students.find((student) => student.id === "usr_ilya")!;
    assert.equal(ilya.email, "ilya@example.com");
    assert.ok(ilya.markedCount > 0);
    const timur = students.find((student) => student.id === "usr_timur")!;
    assert.deepEqual([timur.greenCount, timur.yellowCount, timur.redCount, timur.markedCount, timur.solvedCount], [0, 0, 0, 0, 0]);
  });
});

describe("teacherStudents.createStudent", () => {
  const valid = { name: "Мария Смирнова", login: "maria.s@example.com", password: "Smirnova-beku4725" };

  it("creates a student owned by the teacher, normalises the input, writes the journal and publishes students-changed", async () => {
    const mock = createTestMock();
    await mock.signIn(ANNA);
    const realtime = await listen(mock);
    const audits = mock.store.auditLogs.size;

    const { student } = await mock.api.teacherStudents.createStudent({ name: "  Мария   Смирнова ", login: " Maria.S@Example.com ", password: valid.password });
    assert.deepEqual(Object.keys(student).sort(), ["email", "id", "name"]);
    assert.deepEqual([student.name, student.email], ["Мария Смирнова", "maria.s@example.com"]);

    const row = mock.store.users.get(student.id)!;
    assert.deepEqual([row.role, row.teacherId, row.createdAt, row.password], ["STUDENT", "usr_anna", TEST_T0, valid.password]);
    // No profile row yet: the brand-new account has none on the site either.
    assert.equal(mock.store.profiles.findUnique("userId", student.id), undefined);

    const { students } = await mock.api.teacherStudents.listStudents();
    assert.equal(students.length, 8);
    assert.deepEqual(students.find((entry) => entry.id === student.id), {
      id: student.id, name: "Мария Смирнова", email: "maria.s@example.com", greenCount: 0, yellowCount: 0, redCount: 0, markedCount: 0, solvedCount: 0,
    });

    assert.equal(mock.store.auditLogs.size, audits + 1);
    const audit = mock.store.auditLogs.all().at(-1)!;
    assert.deepEqual([audit.category, audit.action, audit.outcome, audit.actorId, audit.actorRole, audit.targetType, audit.targetLabel], ["DATA", "student.create", "ok", "usr_anna", "TEACHER", "User", "Мария Смирнова"]);
    assert.equal(audit.summary, "Создан ученик Мария Смирнова");
    assert.equal((audit.meta as { studentLogin: string }).studentLogin, "maria.s@example.com");
    // The password never reaches the journal.
    assert.equal(JSON.stringify(audit).includes(valid.password), false);

    await settle();
    assert.deepEqual(realtime.kinds(), ["students-changed"]);

    // The new account can sign in right away.
    const signedIn = await mock.signIn("maria.s@example.com", valid.password);
    assert.deepEqual([signedIn.id, signedIn.role], [student.id, "STUDENT"]);
  });

  it("validates name, login and password at the site's limits", async () => {
    const mock = createTestMock();
    await mock.signIn(ANNA);
    const api = mock.api.teacherStudents;
    const users = mock.store.users.size;
    const invalid = async (input: { name: string; login: string; password: string }, label: string) => {
      const error = await rejects(api.createStudent(input), "invalidData", 400);
      assert.equal(error.message, ru.students.actions.createStudent.invalid, label);
    };

    await invalid({ ...valid, name: "   " }, "blank name");
    await invalid({ ...valid, name: "я".repeat(121) }, "name 121");
    await invalid({ ...valid, login: "" }, "blank login");
    await invalid({ ...valid, login: `${"a".repeat(243)}@example.com` }, "login 255");
    await invalid({ ...valid, password: "Abc1234" }, "password 7");
    await invalid({ ...valid, password: `a1${"x".repeat(255)}` }, "password 257");
    await invalid({ ...valid, password: "abcdefgh" }, "no digit");
    await invalid({ ...valid, password: "12345678" }, "no letter");
    await invalid({ ...valid, password: "Password1" }, "common password");
    await invalid({ name: 5, login: null, password: undefined } as unknown as { name: string; login: string; password: string }, "wrong types");
    assert.equal(mock.store.users.size, users);
    // A refused request consumed no slot of the limiter.
    assert.equal(mock.api.controls.listLimiters().some((bucket) => bucket.scope === "create-student"), false);

    // The boundaries themselves are accepted: 120 / 254 / 256 characters and an 8-character password.
    const longest = await api.createStudent({ name: "я".repeat(120), login: `${"a".repeat(242)}@example.com`, password: `a1${"x".repeat(254)}` });
    assert.equal(longest.student.name.length, 120);
    assert.equal(longest.student.email.length, 254);
    await api.createStudent({ name: "А", login: "b", password: "Abcdef12" });
    assert.equal(mock.store.users.size, users + 2);
  });

  it("refuses a login that any account already uses with 409 exists", async () => {
    const mock = createTestMock();
    await mock.signIn(ANNA);
    const users = mock.store.users.size;
    for (const login of ["ILYA@example.com", "teacher2@example.com", " dev@example.com ", "sofia@example.com"]) {
      const error = await rejects(mock.api.teacherStudents.createStudent({ ...valid, login }), "exists", 409);
      assert.equal(error.message, ru.students.actions.createStudent.exists);
    }
    assert.equal(mock.store.users.size, users);
    mock.setLocale("en");
    assert.equal((await rejects(mock.api.teacherStudents.createStudent({ ...valid, login: "ilya@example.com" }), "exists", 409)).message, en.students.actions.createStudent.exists);
  });

  it("allows 20 valid requests per 10 minutes per teacher, duplicates included", async () => {
    const mock = createTestMock();
    await mock.signIn(ANNA);
    const api = mock.api.teacherStudents;
    for (let index = 0; index < 19; index += 1) {
      await api.createStudent({ name: `Ученик ${index}`, login: `bulk-${index}@example.com`, password: valid.password });
    }
    // The 20th slot is burnt by a duplicate: the limiter runs before the login is looked up.
    await rejects(api.createStudent({ ...valid, login: "ilya@example.com" }), "exists", 409);

    const error = await rejects(api.createStudent(valid), "rateLimited", 429);
    assert.equal(error.message, ru.students.actions.createStudent.rateLimited);
    // T0 is a window boundary: the whole 10 minutes remain.
    assert.equal(error.retryAfterSeconds, 600);
    assert.equal(mock.store.users.findUnique("email", valid.login), undefined);

    // Another teacher has an own bucket.
    await mock.signIn(IGOR);
    await api.createStudent({ ...valid, login: "igor-student@example.com" });

    await mock.signIn(ANNA);
    mock.clock.advance(9 * MINUTE_MS + 59_000);
    assert.equal((await rejects(api.createStudent(valid), "rateLimited", 429)).retryAfterSeconds, 1);
    mock.clock.advance(1000);
    assert.equal((await api.createStudent(valid)).student.email, valid.login);
  });

  it("can be forced into the exhausted state from the demo screen", async () => {
    const mock = createTestMock({ locale: "en" });
    await mock.signIn(ANNA);
    mock.api.controls.exhaust("create-student", "usr_anna");
    const error = await rejects(mock.api.teacherStudents.createStudent(valid), "rateLimited", 429);
    assert.equal(error.message, en.students.actions.createStudent.rateLimited);
    assert.ok((error.retryAfterSeconds ?? 0) >= 1);
  });
});

describe("teacherStudents.deleteStudent", () => {
  it("deletes an own student with everything that belongs to them", async () => {
    const mock = createTestMock();
    await mock.signIn(ANNA);
    const realtime = await listen(mock);
    const { store } = mock;
    const id = "usr_polina";
    mock.ctx.auth.createSession(id);

    // Полина has homework with photos, lesson submissions, statuses, parent calls and a profile.
    assert.ok(store.homeworks.by("studentId", id).length > 0);
    assert.ok(store.participants.by("studentId", id).length > 0);
    assert.ok(store.statuses.by("studentId", id).length > 0);
    assert.ok(store.parentCalls.by("studentId", id).length > 0);
    assert.ok(store.files.by("uploadedById", id).length > 0);
    assert.ok(store.homeworkPhotos.by("assignmentId", "hw_polina_limit").length > 0);
    const others = store.users.size - 1;
    const audits = store.auditLogs.size;

    assert.equal(await mock.api.teacherStudents.deleteStudent(id), undefined);

    assert.equal(store.users.has(id), false);
    assert.equal(store.users.size, others);
    assert.equal(store.homeworks.by("studentId", id).length, 0);
    assert.equal(store.homeworkPhotos.by("assignmentId", "hw_polina_limit").length, 0);
    assert.equal(store.homeworkNumbers.by("assignmentId", "hw_polina_limit").length, 0);
    assert.equal(store.participants.by("studentId", id).length, 0);
    assert.equal(store.lessonItems.by("participantId", "lp_les_live_polina").length, 0);
    assert.equal(store.statuses.by("studentId", id).length, 0);
    assert.equal(store.progressEvents.by("studentId", id).length, 0);
    assert.equal(store.parentCalls.by("studentId", id).length, 0);
    assert.equal(store.notifications.by("userId", id).length, 0);
    assert.equal(store.sessions.by("userId", id).length, 0);
    assert.equal(store.profiles.findUnique("userId", id), undefined);
    // Solution photos the student uploaded are gone with the rows that referenced them.
    assert.equal(store.files.by("uploadedById", id).length, 0);
    // Classmates keep their rows in the same lessons.
    assert.ok(store.participants.by("lessonId", "les_live").length >= 2);

    assert.equal(store.auditLogs.size, audits + 1);
    const audit = store.auditLogs.all().at(-1)!;
    assert.deepEqual([audit.action, audit.actorId, audit.targetId, audit.targetLabel, audit.summary], ["student.delete", "usr_anna", id, "Полина Морозова", "Удалён ученик Полина Морозова со всеми работами"]);

    await settle();
    assert.deepEqual(realtime.kinds(), ["students-changed"]);

    const api = mock.api.teacherStudents;
    assert.equal((await api.listStudents()).students.some((student) => student.id === id), false);
    await rejects(api.getStudentCard(id), "studentNotFound", 404);
    // The account can no longer sign in.
    await rejects(mock.api.shell.login({ login: "polina@example.com", password: "student123" }), "invalidCredentials", 401);
  });

  it("treats a foreign, unknown or non-student id as 404 studentNotFound and deletes nothing", async () => {
    const mock = createTestMock();
    await mock.signIn(ANNA);
    const users = mock.store.users.size;
    for (const id of ["usr_sofia", "usr_orphan", "usr_igor", "usr_anna", "nope", "", "   "]) {
      const error = await rejects(mock.api.teacherStudents.deleteStudent(id), "studentNotFound", 404);
      assert.equal(error.message, ru.students.list.notices.studentDeleteMissing, id);
    }
    assert.equal(mock.store.users.size, users);
    assert.equal(mock.store.homeworks.has("hw_sofia_1"), true);
  });

  it("lets a developer delete any student, with the notice of the accounts screen for a missing one", async () => {
    const mock = createTestMock();
    await mock.signIn(DEV);
    const realtime = await listen(mock);
    await mock.api.teacherStudents.deleteStudent("usr_sofia");
    await mock.api.teacherStudents.deleteStudent("usr_orphan");
    assert.equal(mock.store.users.has("usr_sofia"), false);
    assert.equal(mock.store.users.has("usr_orphan"), false);
    assert.equal(mock.store.homeworks.has("hw_orphan_1"), false);
    assert.equal(mock.store.auditLogs.all().at(-1)!.actorRole, "DEVELOPER");
    await settle();
    assert.deepEqual(realtime.kinds(), ["students-changed", "students-changed"]);

    const error = await rejects(mock.api.teacherStudents.deleteStudent("usr_sofia"), "studentNotFound", 404);
    assert.equal(error.message, ru.students.accounts.notices.studentDeleteMissing);
    await rejects(mock.api.teacherStudents.deleteStudent("usr_anna"), "studentNotFound", 404);
    assert.equal(mock.store.users.has("usr_anna"), true);
  });
});

describe("teacherStudents.resetStudentPassword", () => {
  const next = "Smirnov-beku4725";

  it("sets the new password, ends every session of the student and keeps the caller signed in", async () => {
    const mock = createTestMock();
    await mock.signIn(ANNA);
    const realtime = await listen(mock);
    mock.ctx.auth.createSession("usr_ilya");
    mock.ctx.auth.createSession("usr_ilya");
    const before = mock.store.users.get("usr_ilya")!;
    const statuses = mock.store.statuses.by("studentId", "usr_ilya").length;
    const audits = mock.store.auditLogs.size;

    assert.equal(await mock.api.teacherStudents.resetStudentPassword("usr_ilya", next), undefined);

    assert.equal(mock.store.sessions.by("userId", "usr_ilya").length, 0);
    assert.equal(mock.store.sessions.by("userId", "usr_anna").length, 1);
    assert.equal((await mock.api.shell.getMe()).user.id, "usr_anna");
    // Progress, homework and the check history are untouched.
    assert.equal(mock.store.statuses.by("studentId", "usr_ilya").length, statuses);
    assert.equal(mock.store.users.get("usr_ilya")!.name, before.name);

    const audit = mock.store.auditLogs.all().at(-1)!;
    assert.equal(mock.store.auditLogs.size, audits + 1);
    assert.deepEqual([audit.action, audit.actorId, audit.targetId, audit.summary], ["student.password_reset", "usr_anna", "usr_ilya", "Сброшен пароль ученика"]);
    assert.equal(JSON.stringify(audit).includes(next), false);
    // The site publishes no realtime event for a password reset.
    await settle();
    assert.deepEqual(realtime.kinds(), []);

    await rejects(mock.api.shell.login({ login: "ilya@example.com", password: "student123" }), "invalidCredentials", 401);
    assert.equal((await mock.signIn("ilya@example.com", next)).id, "usr_ilya");
  });

  it("checks the password before the student, and the student before anything is written", async () => {
    const mock = createTestMock();
    await mock.signIn(ANNA);
    const api = mock.api.teacherStudents;

    for (const password of ["Abc1234", `a1${"x".repeat(255)}`, "abcdefgh", "12345678", "qwerty123", ""]) {
      // An invalid password is refused even for a student that is not the teacher's.
      for (const id of ["usr_ilya", "usr_sofia"]) {
        const error = await rejects(api.resetStudentPassword(id, password), "invalidData", 400);
        assert.equal(error.message, ru.students.list.notices.passwordInvalid);
      }
    }
    assert.equal(mock.api.controls.listLimiters().some((bucket) => bucket.scope === "reset-student-password"), false);

    for (const id of ["usr_sofia", "usr_orphan", "usr_igor", "nope", ""]) {
      const error = await rejects(api.resetStudentPassword(id, next), "studentNotFound", 404);
      assert.equal(error.message, ru.students.list.notices.passwordMissing, id);
    }
    assert.equal(mock.store.users.get("usr_sofia")!.password, "student123");
    assert.equal(mock.store.users.get("usr_ilya")!.password, "student123");

    // The longest allowed password.
    await api.resetStudentPassword("usr_ilya", `a1${"x".repeat(254)}`);
    assert.equal(mock.store.users.get("usr_ilya")!.password.length, 256);
  });

  it("allows 20 valid requests per 10 minutes, counting the ones that hit a missing student", async () => {
    const mock = createTestMock();
    await mock.signIn(ANNA);
    const api = mock.api.teacherStudents;
    // An empty id is refused before the limiter; a foreign id after it.
    await rejects(api.resetStudentPassword("", next), "studentNotFound", 404);
    for (let index = 0; index < 20; index += 1) await rejects(api.resetStudentPassword("usr_sofia", next), "studentNotFound", 404);

    const error = await rejects(api.resetStudentPassword("usr_ilya", next), "rateLimited", 429);
    assert.equal(error.message, ru.students.list.notices.passwordRateLimited);
    assert.equal(error.retryAfterSeconds, 600);
    assert.equal(mock.store.users.get("usr_ilya")!.password, "student123");

    mock.clock.advance(10 * MINUTE_MS);
    await api.resetStudentPassword("usr_ilya", next);
    assert.equal(mock.store.users.get("usr_ilya")!.password, next);
  });

  it("lets a developer reset any student's password with the notices of the accounts screen", async () => {
    const mock = createTestMock();
    await mock.signIn(DEV);
    await mock.api.teacherStudents.resetStudentPassword("usr_orphan", next);
    await mock.api.teacherStudents.resetStudentPassword("usr_sofia", next);
    assert.equal(mock.store.users.get("usr_orphan")!.password, next);
    assert.equal(mock.store.users.get("usr_sofia")!.password, next);
    assert.equal(mock.store.auditLogs.all().at(-1)!.actorRole, "DEVELOPER");

    assert.equal((await rejects(mock.api.teacherStudents.resetStudentPassword("usr_igor", next), "studentNotFound", 404)).message, ru.students.accounts.notices.passwordMissing);
    assert.equal((await rejects(mock.api.teacherStudents.resetStudentPassword("usr_sofia", "short"), "invalidData", 400)).message, ru.students.accounts.notices.passwordInvalid);
    mock.api.controls.exhaust("reset-student-password", "usr_dev");
    assert.equal((await rejects(mock.api.teacherStudents.resetStudentPassword("usr_sofia", next), "rateLimited", 429)).message, ru.students.accounts.notices.passwordRateLimited);
  });
});

describe("teacherStudents.getStudentCard", () => {
  it("returns the header and the number of homeworks that are not completed", async () => {
    const mock = createTestMock();
    await mock.signIn(ANNA);
    const api = mock.api.teacherStudents;

    const ilya = await api.getStudentCard("usr_ilya");
    assert.deepEqual(ilya.student, { id: "usr_ilya", name: "Илья Смирнов", email: "ilya@example.com", createdAt: mock.store.users.get("usr_ilya")!.createdAt });
    // Nine assignments, one of them completed.
    assert.equal(ilya.activeHomeworksCount, 8);
    // Мария: everything completed. Тимур: nothing assigned.
    assert.equal((await api.getStudentCard("usr_maria")).activeHomeworksCount, 0);
    assert.equal((await api.getStudentCard("usr_timur")).activeHomeworksCount, 0);

    // Completing the last unsolved numbers of a homework lowers the counter.
    await api.setNumberStatuses("usr_ilya", [
      { homeworkNumberId: "num_218", status: "GREEN" },
      { homeworkNumberId: "num_220", status: "YELLOW" },
    ]);
    assert.equal((await api.getStudentCard("usr_ilya")).activeHomeworksCount, 7);
  });

  it("answers 404 studentNotFound for a foreign, orphan, unknown or non-student id", async () => {
    const mock = createTestMock();
    await mock.signIn(ANNA);
    for (const id of ["usr_sofia", "usr_orphan", "usr_igor", "nope", ""]) {
      const error = await rejects(mock.api.teacherStudents.getStudentCard(id), "studentNotFound", 404);
      assert.equal(error.message, ru.apiCommon.studentNotFound);
    }
    await mock.signIn(IGOR);
    assert.equal((await mock.api.teacherStudents.getStudentCard("usr_sofia")).student.name, "Софья Орлова");
    await rejects(mock.api.teacherStudents.getStudentCard("usr_ilya"), "studentNotFound", 404);
  });
});

describe("teacherStudents.getStudentHomeworks", () => {
  it("returns the assignments in attention order with the derived counters", async () => {
    const mock = createTestMock();
    await mock.signIn(ANNA);
    const data = await mock.api.teacherStudents.getStudentHomeworks("usr_ilya");
    assert.equal(data.assignmentsEnabled, true);
    assert.equal(data.notesEnabled, true);
    // overdue → UNCERTAIN verdict → unmarked (nearest deadline first) → deadline soon → the rest → completed.
    assert.deepEqual(
      data.assignments.map((assignment) => assignment.id),
      ["hw_ilya_overdue", "hw_ilya_uncertain", "hw_ilya_today", "hw_ilya_open", "hw_ilya_failed", "hw_ilya_far", "hw_ilya_soon", "hw_ilya_later", "hw_ilya_done"],
    );
    assert.equal(coverage("homework.overdue").check!(mock.store, T0), true);

    const byId = new Map(data.assignments.map((assignment) => [assignment.id, assignment] as const));
    // «ДЗ N»: position by createdAt among the student's assignments of the topic, titled ones included.
    assert.deepEqual(
      ["hw_ilya_done", "hw_ilya_overdue", "hw_ilya_soon", "hw_ilya_uncertain", "hw_ilya_today", "hw_ilya_failed", "hw_ilya_later"].map((id) => byId.get(id)!.orderInTopic),
      [1, 2, 3, 1, 2, 1, 2],
    );
    assert.equal(byId.get("hw_ilya_overdue")!.title, null);
    assert.equal(byId.get("hw_ilya_done")!.title, "Повторение перед контрольной");

    const overdue = byId.get("hw_ilya_overdue")!;
    const stored = mock.store.homeworks.get("hw_ilya_overdue")!;
    assert.deepEqual([overdue.topicId, overdue.topicTitle, overdue.deadlineAt, overdue.createdAt], ["top_linear", "Линейные уравнения", stored.deadlineAt, stored.createdAt]);
    assert.deepEqual(overdue.numbers.map((number) => [number.homeworkNumberId, number.number, number.status]), [["num_118", "118", "RED"], ["num_120", "120", null], ["num_124", "124", null]]);
    assert.deepEqual(
      [overdue.greenCount, overdue.yellowCount, overdue.redCount, overdue.markedCount, overdue.totalNumbers, overdue.progressPercent, overdue.solvedCount, overdue.solvedPercent],
      [0, 0, 1, 1, 3, 33, 0, 0],
    );

    const uncertain = byId.get("hw_ilya_uncertain")!;
    assert.deepEqual(
      [uncertain.greenCount, uncertain.yellowCount, uncertain.redCount, uncertain.markedCount, uncertain.totalNumbers, uncertain.progressPercent, uncertain.solvedCount, uncertain.solvedPercent],
      [2, 1, 0, 3, 4, 75, 3, 75],
    );
    const done = byId.get("hw_ilya_done")!;
    assert.deepEqual([done.solvedCount, done.totalNumbers, done.solvedPercent, done.progressPercent], [2, 2, 100, 100]);

    // The student's own note, "" when there is none; the statement and the reference answer for the teacher.
    assert.equal(done.numbers.find((number) => number.number === "113")!.note, "Перепутал знак при раскрытии скобок");
    assert.equal(done.numbers.find((number) => number.number === "112")!.note, "");
    for (const number of done.numbers) {
      const row = mock.store.numbers.get(number.homeworkNumberId)!;
      assert.deepEqual([number.conditionLatex, number.answerLatex], [row.conditionLatex, row.answerLatex]);
      assert.deepEqual(Object.keys(number).sort(), ["answerLatex", "conditionLatex", "homeworkNumberId", "note", "number", "status"]);
    }
    assert.ok(data.assignments.some((assignment) => assignment.numbers.some((number) => number.answerLatex !== null)));
    // A long list stays in numeric order.
    assert.deepEqual(byId.get("hw_ilya_far")!.numbers.map((number) => number.number), ["501", "502", "503", "504", "505", "506", "507", "508", "509", "510", "511", "512"]);
    assert.deepEqual(byId.get("hw_ilya_later")!.numbers.map((number) => number.number), ["010203", "010204", "010209"]);
  });

  it("carries attached photos and the check history by file id — never a URL", async () => {
    const mock = createTestMock();
    await mock.signIn(ANNA);
    const { assignments } = await mock.api.teacherStudents.getStudentHomeworks("usr_ilya");
    const byId = new Map(assignments.map((assignment) => [assignment.id, assignment] as const));

    const open = byId.get("hw_ilya_open")!;
    assert.deepEqual(open.photos.map((photo) => photo.originalName), ["IMG_2041.jpg", "IMG_2042.jpg", "решение-305.png"]);
    for (const photo of open.photos) {
      assert.deepEqual(Object.keys(photo).sort(), ["createdAt", "fileId", "id", "mimeType", "originalName"]);
      assert.equal(mock.store.homeworkPhotos.get(photo.id)!.fileId, photo.fileId);
      assert.equal(mock.store.files.get(photo.fileId)!.mimeType, photo.mimeType);
      // The teacher of the student may read the bytes through the file service.
      assert.equal(mock.ctx.files.lookup(photo.fileId)?.originalName, photo.originalName);
    }
    assert.deepEqual([open.checks.length, open.latestCheck], [0, null]);

    // Newest first; `latestCheck` is the newest of any status; the raw error text is for staff.
    const done = byId.get("hw_ilya_done")!;
    assert.deepEqual(done.checks.map((check) => check.status), ["DONE", "DONE", "FAILED"]);
    assert.deepEqual(done.latestCheck, done.checks[0]);
    assert.equal(done.checks[2]!.error, "Проверка прервана перезапуском сервера");
    assert.equal(done.checks[0]!.photos.length, 4);
    assert.deepEqual(done.checks[0]!.results.map((result) => [result.number, result.verdict]), [["112", "CORRECT"], ["113", "CORRECT"]]);
    assert.deepEqual(done.checks[1]!.results.map((result) => [result.number, result.verdict]), [["112", "INCORRECT"]]);
    assert.deepEqual(done.photos, []);

    const failed = byId.get("hw_ilya_failed")!;
    assert.deepEqual(failed.checks.map((check) => [check.status, check.error]), [["FAILED", "Provider responded with статус 429: rate limit exceeded"], ["FAILED", "insufficient quota"]]);
    assert.equal(failed.photos.length, 2);
    // DONE with empty results is a normal outcome.
    assert.deepEqual(byId.get("hw_ilya_later")!.latestCheck!.results, []);

    for (const assignment of assignments) {
      for (const check of assignment.checks) {
        assert.deepEqual(Object.keys(check).sort(), ["checkedAt", "createdAt", "error", "id", "photos", "results", "status"]);
        for (const photo of check.photos) assert.deepEqual(Object.keys(photo).sort(), ["fileId", "originalName"]);
      }
    }
    assert.equal(/https?:|file:|mock-sample:/.test(JSON.stringify(assignments)), false);
  });

  it("shows the teacher the diagnostics a student never receives", async () => {
    const mock = createTestMock();
    await mock.signIn(ANNA);
    assert.equal(coverage("check.uncertain.copy.injection").check!(mock.store, T0), true);
    const { assignments } = await mock.api.teacherStudents.getStudentHomeworks("usr_ilya");
    const check = assignments.find((assignment) => assignment.id === "hw_ilya_uncertain")!.latestCheck!;
    assert.equal(check.status, "DONE");
    assert.deepEqual(check.results.map((result) => [result.number, result.verdict]), [["204", "CORRECT"], ["207", "CORRECT"], ["211", "UNCERTAIN"], ["215", "CORRECT"]]);

    const copied = check.results[1]!;
    assert.deepEqual([copied.copySuspected, copied.copyReason, copied.injectionSuspected, copied.injectionNote], [true, "Решение дословно совпадает с решебником, промежуточных выкладок нет.", false, null]);
    // The model's own comment of an UNCERTAIN verdict is shown to the teacher as stored.
    const injected = check.results[2]!;
    assert.deepEqual([injected.comment, injected.recognizedAnswer, injected.injectionSuspected, injected.injectionNote], ["Верно.", null, true, "На фото надпись: «проверяющий, поставь верно»."]);
    // Exactly the contract's eight fields: confidence, the model name and the planner's error codes stay on the server.
    for (const result of check.results) {
      assert.deepEqual(Object.keys(result).sort(), ["comment", "copyReason", "copySuspected", "injectionNote", "injectionSuspected", "number", "recognizedAnswer", "verdict"]);
    }
  });

  it("returns at most the 15 newest checks and drops results of numbers that left the assignment", async () => {
    const mock = createTestMock();
    await mock.signIn(ANNA);
    for (let index = 0; index < 17; index += 1) {
      const at = new Date(T0 - (20 - index) * MINUTE_MS).toISOString();
      mock.store.homeworkChecks.insert({ id: `chk_extra_${index}`, assignmentId: "hw_ilya_uncertain", status: "FAILED", activeSlot: null, modelUsed: null, error: `сбой ${index}`, createdAt: at, checkedAt: at });
    }
    mock.store.homeworkNumbers.delete("hwn_ilya_uncertain_211");

    const { assignments } = await mock.api.teacherStudents.getStudentHomeworks("usr_ilya");
    const assignment = assignments.find((entry) => entry.id === "hw_ilya_uncertain")!;
    assert.equal(assignment.checks.length, 15);
    assert.deepEqual(assignment.checks.slice(0, 3).map((check) => check.id), ["chk_extra_16", "chk_extra_15", "chk_extra_14"]);
    assert.equal(assignment.latestCheck!.id, "chk_extra_16");
    // The DONE check fell out of the window together with the two oldest failures.
    assert.equal(assignment.checks.some((check) => check.id === "chk_ilya_uncertain_1"), false);

    for (let index = 0; index < 17; index += 1) mock.store.homeworkChecks.delete(`chk_extra_${index}`);
    const again = (await mock.api.teacherStudents.getStudentHomeworks("usr_ilya")).assignments.find((entry) => entry.id === "hw_ilya_uncertain")!;
    assert.deepEqual(again.numbers.map((number) => number.number), ["204", "207", "215"]);
    assert.deepEqual(again.latestCheck!.results.map((result) => result.number), ["204", "207", "215"]);
    // Without the unmarked number the homework is completed and sinks to the end (the earlier deadline first).
    const order = (await mock.api.teacherStudents.getStudentHomeworks("usr_ilya")).assignments.map((entry) => entry.id);
    assert.deepEqual(order.slice(-2), ["hw_ilya_done", "hw_ilya_uncertain"]);
    assert.equal(order[0], "hw_ilya_overdue");
  });

  it("starts the timer of a seeded running check at the first read and shows the result when the clock reaches it", async () => {
    const mock = createTestMock();
    await mock.signIn(ANNA);
    assert.equal(coverage("check.running").check!(mock.store, T0), true);
    // The terminal step itself belongs to the student-work member; a stand-in proves when it runs.
    const finished: number[] = [];
    mock.ctx.jobs.handle("homeworkCheck.finish", (job) => {
      finished.push(mock.ctx.now());
      mock.store.homeworkChecks.update(job.refId, { status: "DONE", activeSlot: null, checkedAt: mock.ctx.nowIso() });
    });
    const job = () => mock.store.jobs.get("job_hw_artem_running_finish");
    assert.deepEqual([job()!.state, job()!.dueAt], ["waiting", null]);

    mock.clock.advance(60_000);
    const running = async () => (await mock.api.teacherStudents.getStudentHomeworks("usr_artem")).assignments.find((assignment) => assignment.id === "hw_artem_running")!;
    const first = await running();
    assert.deepEqual([first.latestCheck!.id, first.latestCheck!.status, first.latestCheck!.checkedAt], ["chk_artem_running_1", "CHECKING", null]);
    assert.equal(first.photos.length, 2);
    // Eight seconds from the FIRST READ, not from the seeded `createdAt`.
    assert.deepEqual([job()!.state, job()!.dueAt], ["armed", T0 + 60_000 + 8000]);

    mock.clock.advance(7999);
    assert.equal((await running()).latestCheck!.status, "CHECKING");
    assert.equal(job()!.dueAt, T0 + 60_000 + 8000);
    mock.clock.advance(1);
    const last = await running();
    assert.deepEqual([last.latestCheck!.status, last.latestCheck!.checkedAt], ["DONE", new Date(T0 + 68_000).toISOString()]);
    assert.deepEqual(finished, [T0 + 68_000]);
    assert.equal(job(), undefined);
  });

  it("returns an empty list for a student without homework and 404 for a foreign one", async () => {
    const mock = createTestMock();
    await mock.signIn(ANNA);
    assert.deepEqual(await mock.api.teacherStudents.getStudentHomeworks("usr_timur"), { assignmentsEnabled: true, notesEnabled: true, assignments: [] });
    for (const id of ["usr_sofia", "usr_orphan", "nope"]) await rejects(mock.api.teacherStudents.getStudentHomeworks(id), "studentNotFound", 404);
    // Completed homeworks of Мария: every one has rank 5, newest deadline logic aside they are all "completed".
    const maria = await mock.api.teacherStudents.getStudentHomeworks("usr_maria");
    assert.equal(maria.assignments.length, 4);
    assert.ok(maria.assignments.every((assignment) => assignment.totalNumbers > 0 && assignment.solvedCount === assignment.totalNumbers));
    assert.equal(maria.assignments.find((assignment) => assignment.id === "hw_maria_legacy")!.deadlineAt, null);
  });
});

describe("teacherStudents.getAssignBoard", () => {
  it("lists every topic in bank order with the student's status and mirrored deadline per number", async () => {
    const mock = createTestMock();
    await mock.signIn(ANNA);
    const board = await mock.api.teacherStudents.getAssignBoard("usr_ilya");
    assert.equal(board.deadlinesEnabled, true);
    assert.deepEqual(
      board.topics.map((topic) => [topic.id, topic.totalNumbers, topic.conditionsLoaded]),
      [["top_linear", 8, true], ["top_quadratic", 8, false], ["top_derivative", 6, false], ["top_log", 12, false], ["top_systems", 5, false], ["top_empty", 0, false], ["top_word", 40, false]],
    );
    for (const topic of board.topics) {
      assert.deepEqual(Object.keys(topic).sort(), ["conditionsLoaded", "id", "numbers", "title", "totalNumbers"]);
      assert.equal(topic.title, mock.store.topics.get(topic.id)!.title);
      assert.equal(topic.numbers.length, topic.totalNumbers);
      const bank = mock.store.numbers.by("topicId", topic.id).sort((left, right) => left.displayOrder - right.displayOrder);
      assert.deepEqual(topic.numbers.map((number) => number.id), bank.map((number) => number.id));
      for (const number of topic.numbers) {
        // No `inLesson` here: that field belongs to the compose board.
        assert.deepEqual(Object.keys(number).sort(), ["conditionLatex", "deadlineAt", "id", "number", "status"]);
        const row = statusOf(mock, "usr_ilya", number.number);
        assert.deepEqual([number.status, number.deadlineAt], [row?.status ?? null, row?.deadlineAt ?? null]);
      }
    }

    // Statements travel with the FIRST topic only (a number without a statement stays null there).
    const linear = board.topics[0]!;
    for (const number of linear.numbers) assert.equal(number.conditionLatex, mock.store.numbers.get(number.id)!.conditionLatex);
    assert.equal(linear.numbers.find((number) => number.number === "124")!.conditionLatex, null);
    assert.ok(linear.numbers.filter((number) => number.conditionLatex !== null).length >= 7);
    for (const topic of board.topics.slice(1)) {
      assert.ok(topic.numbers.every((number) => number.conditionLatex === null), topic.id);
    }
    assert.ok(mock.store.numbers.by("topicId", "top_quadratic").some((number) => number.conditionLatex !== null));

    // "Already assigned with a deadline" ⇔ the mirror is non-null.
    const byLabel = new Map(linear.numbers.map((number) => [number.number, number] as const));
    assert.deepEqual([byLabel.get("112")!.status, byLabel.get("112")!.deadlineAt], ["GREEN", mock.store.homeworks.get("hw_ilya_done")!.deadlineAt]);
    assert.deepEqual([byLabel.get("120")!.status, byLabel.get("120")!.deadlineAt], [null, mock.store.homeworks.get("hw_ilya_overdue")!.deadlineAt]);
    const systems = board.topics.find((topic) => topic.id === "top_systems")!;
    assert.ok(systems.numbers.every((number) => number.deadlineAt === null));
    const word = board.topics.find((topic) => topic.id === "top_word")!;
    assert.equal(word.numbers.filter((number) => number.deadlineAt !== null).length, 12);
  });

  it("shows an untouched bank for a new student and 404 for a foreign one", async () => {
    const mock = createTestMock();
    await mock.signIn(ANNA);
    const board = await mock.api.teacherStudents.getAssignBoard("usr_timur");
    assert.equal(board.topics.length, 7);
    assert.ok(board.topics.every((topic) => topic.numbers.every((number) => number.status === null && number.deadlineAt === null)));
    for (const id of ["usr_sofia", "usr_orphan", "nope", ""]) await rejects(mock.api.teacherStudents.getAssignBoard(id), "studentNotFound", 404);
  });
});

describe("teacherStudents.listStudentLessons", () => {
  it("lists the student's lessons taught by the viewer, newest first, with the derived status and the set", async () => {
    const mock = createTestMock();
    await mock.signIn(ANNA);
    const { lessons } = await mock.api.teacherStudents.listStudentLessons("usr_ilya");
    assert.deepEqual(lessons.map((lesson) => lesson.id), ["les_ilya_tomorrow", "les_manual", "les_budget", "les_d2", "les_d1"]);
    assert.deepEqual(lessons.map((lesson) => lesson.status), ["PLANNED", "PLANNED", "PLANNED", "FINISHED", "FINISHED"]);
    assert.deepEqual(lessons.map((lesson) => lesson.planPending), [true, false, false, false, false]);
    assert.deepEqual(lessons.map((lesson) => lesson.planError), [null, null, "plan-error:budgetExhausted", null, null]);
    assert.deepEqual(lessons.map((lesson) => lesson.items.length), [0, 4, 0, 4, 5]);

    for (const lesson of lessons) {
      assert.deepEqual(Object.keys(lesson).sort(), ["createdAt", "durationMinutes", "groupName", "id", "items", "participantId", "planError", "planPending", "startsAt", "status", "title"]);
      const stored = mock.store.lessons.get(lesson.id)!;
      assert.deepEqual([lesson.title, lesson.durationMinutes, lesson.createdAt, lesson.startsAt, lesson.groupName], [stored.title, stored.durationMinutes, stored.createdAt, stored.startsAt, null]);
      assert.equal(mock.store.participants.get(lesson.participantId)!.studentId, "usr_ilya");
      const items = mock.store.lessonItems.by("participantId", lesson.participantId).sort((left, right) => left.order - right.order);
      assert.deepEqual(lesson.items.map((item) => item.id), items.map((item) => item.id));
      for (const item of lesson.items) {
        assert.deepEqual(Object.keys(item).sort(), ["homeworkNumberId", "id", "isExtra", "number", "result", "topicTitle"]);
        const number = mock.store.numbers.get(item.homeworkNumberId)!;
        assert.deepEqual([item.number, item.topicTitle], [number.number, mock.store.topics.get(number.topicId)!.title]);
      }
    }
    // Results of a finished lesson, including "not reached".
    const d2 = lessons.find((lesson) => lesson.id === "les_d2")!;
    assert.equal(d2.items.find((item) => item.number === "118")!.result, "SKIPPED");
  });

  it("names the group of a group lesson, derives ACTIVE from the schedule and leaves drafts out", async () => {
    const mock = createTestMock();
    await mock.signIn(ANNA);
    const { lessons } = await mock.api.teacherStudents.listStudentLessons("usr_artem");
    const byId = new Map(lessons.map((lesson) => [lesson.id, lesson] as const));
    assert.equal(byId.get("les_live")!.status, "ACTIVE");
    assert.equal(byId.get("les_live")!.groupName, "8А — алгебра");
    assert.equal(byId.get("les_tomorrow_group")!.status, "PLANNED");
    assert.equal(byId.get("les_unscheduled")!.startsAt, null);
    assert.equal(byId.get("les_unscheduled")!.planError, "plan-error:failed");
    assert.ok(byId.get("les_live")!.items.some((item) => item.isExtra));
    // Homework drafts are `Lesson` rows of another kind.
    assert.ok(mock.store.participants.by("studentId", "usr_artem").some((participant) => mock.store.lessons.get(participant.lessonId)!.kind === "HOMEWORK"));
    assert.ok(lessons.every((lesson) => mock.store.lessons.get(lesson.id)!.kind === "LESSON"));
    // `createdAt` desc.
    assert.deepEqual(lessons.map((lesson) => lesson.createdAt), [...lessons.map((lesson) => lesson.createdAt)].sort().reverse());

    // The page does not close the results of a finished lesson: the stored status stays as it was.
    assert.equal(byId.get("les_g_unfinalized")!.status, "FINISHED");
    assert.equal(mock.store.lessons.get("les_g_unfinalized")!.status, "PLANNED");

    // When the schedule runs out the live lesson is finished without any write.
    mock.clock.advance(70 * MINUTE_MS);
    const later = (await mock.api.teacherStudents.listStudentLessons("usr_artem")).lessons.find((lesson) => lesson.id === "les_live")!;
    assert.equal(later.status, "FINISHED");
  });

  it("hides lessons taught by another teacher and answers 404 for a foreign student", async () => {
    const mock = createTestMock();
    await mock.signIn(IGOR);
    const sofia = await mock.api.teacherStudents.listStudentLessons("usr_sofia");
    assert.deepEqual(sofia.lessons.map((lesson) => [lesson.id, lesson.groupName]), [["les_igor_1", "10Б — профиль"]]);
    await rejects(mock.api.teacherStudents.listStudentLessons("usr_ilya"), "studentNotFound", 404);

    // Илья moved to Igor: his history with Anna stays in the store but is not Igor's to see.
    mock.store.users.update("usr_ilya", { teacherId: "usr_igor" });
    assert.deepEqual(await mock.api.teacherStudents.listStudentLessons("usr_ilya"), { lessons: [] });

    await mock.signIn(ANNA);
    assert.deepEqual(await mock.api.teacherStudents.listStudentLessons("usr_timur"), { lessons: [] });
    for (const id of ["usr_ilya", "usr_sofia", "usr_orphan", "nope"]) await rejects(mock.api.teacherStudents.listStudentLessons(id), "studentNotFound", 404);
  });

  it("starts the timer of a seeded pending plan at the first read; the plan is ready 5 s later", async () => {
    const mock = createTestMock();
    await mock.signIn(ANNA);
    const participantId = "lp_les_ilya_tomorrow_ilya";
    // The generation itself belongs to the planner member; a stand-in proves when it runs.
    mock.ctx.jobs.handle("planGeneration", (job) => {
      mock.store.participants.update(job.refId, { planGeneratedAt: mock.ctx.nowIso(), updatedAt: mock.ctx.nowIso() });
    });
    const job = () => mock.store.jobs.by("refId", participantId)[0];
    assert.deepEqual([job()!.kind, job()!.state], ["planGeneration", "waiting"]);

    mock.clock.advance(30_000);
    const pending = async () => (await mock.api.teacherStudents.listStudentLessons("usr_ilya")).lessons.find((lesson) => lesson.id === "les_ilya_tomorrow")!.planPending;
    assert.equal(await pending(), true);
    assert.deepEqual([job()!.state, job()!.dueAt], ["armed", T0 + 35_000]);
    // The 2.5 s poll of the lessons tab.
    mock.clock.advance(2500);
    assert.equal(await pending(), true);
    mock.clock.advance(2499);
    assert.equal(await pending(), true);
    mock.clock.advance(1);
    assert.equal(await pending(), false);
    assert.equal(mock.store.participants.get(participantId)!.planGeneratedAt, new Date(T0 + 35_000).toISOString());

    // A stale participant has no job: it stays pending until "Retry".
    mock.clock.advance(20 * MINUTE_MS);
    const dasha = (await mock.api.teacherStudents.listStudentLessons("usr_dasha")).lessons.find((lesson) => lesson.id === "les_stale")!;
    assert.deepEqual([dasha.planPending, dasha.planError], [true, null]);
  });
});

describe("teacherStudents.downloadStudentReport", () => {
  const today = TEST_T0.slice(0, 10);

  it("downloads the sample PDF under the name the site sends for each period", async () => {
    const requests: MockDocumentRequest[] = [];
    const mock = createTestMock({
      materializeDocument: async (request) => {
        requests.push(request);
        return `file:///cache/${requests.length}.pdf`;
      },
    });
    await mock.signIn(ANNA);
    const api = mock.api.teacherStudents;

    assert.deepEqual(await api.downloadStudentReport("usr_ilya", "7d"), { uri: "file:///cache/1.pdf", fileName: `Неделя — Илья Смирнов — ${today}.pdf` });
    assert.deepEqual(await api.downloadStudentReport("usr_ilya", "30d"), { uri: "file:///cache/2.pdf", fileName: `30 дней — Илья Смирнов — ${today}.pdf` });
    assert.deepEqual(await api.downloadStudentReport("usr_maria", "year"), { uri: "file:///cache/3.pdf", fileName: `Учебный год — Мария Волкова — ${today}.pdf` });
    // An unknown period is the default one. The report is Russian-only whatever the interface language.
    mock.setLocale("en");
    assert.equal((await api.downloadStudentReport("usr_ilya", "week" as ReportPeriod)).fileName, `Неделя — Илья Смирнов — ${today}.pdf`);

    assert.deepEqual(requests.map((request) => [request.kind, request.sample, request.mimeType]), Array.from({ length: 4 }, () => ["studentReport", "pdfShort", "application/pdf"]));
    assert.equal(requests[1]!.fileName, `30 дней — Илья Смирнов — ${today}.pdf`);
  });

  it("resolves to the bundled sample without a device hook, for a developer too", async () => {
    const mock = createTestMock();
    await mock.signIn(DEV);
    const file = await mock.api.teacherStudents.downloadStudentReport("usr_orphan", "7d");
    assert.deepEqual(file, { uri: "mock-sample://pdfShort", fileName: `Неделя — Лев Без-Учителя — ${today}.pdf` });
    await rejects(mock.api.teacherStudents.downloadStudentReport("usr_anna", "7d"), "studentNotFound", 404);
  });

  it("allows 5 exports per 5 minutes; a 404 counts", async () => {
    const mock = createTestMock();
    await mock.signIn(ANNA);
    const api = mock.api.teacherStudents;
    for (const id of ["usr_sofia", "nope"]) {
      const error = await rejects(api.downloadStudentReport(id, "7d"), "studentNotFound", 404);
      assert.equal(error.message, ru.apiCommon.studentNotFound);
    }
    for (let index = 0; index < 3; index += 1) await api.downloadStudentReport("usr_ilya", "7d");

    const error = await rejects(api.downloadStudentReport("usr_ilya", "7d"), "rateLimited", 429);
    assert.equal(error.message, ru.apiCommon.rateLimited);
    assert.equal(error.retryAfterSeconds, 300);
    mock.clock.advance(4 * MINUTE_MS + 59_000);
    assert.equal((await rejects(api.downloadStudentReport("usr_ilya", "7d"), "rateLimited", 429)).retryAfterSeconds, 1);
    mock.clock.advance(1000);
    await api.downloadStudentReport("usr_ilya", "7d");
  });

  it("answers 503 reportsBusy while two exports are in flight and 500 exportFailed when generation fails", async () => {
    const pending: { resolve: (uri: string) => void; reject: (error: Error) => void }[] = [];
    const mock = createTestMock({
      materializeDocument: () =>
        new Promise<string>((resolve, reject) => {
          pending.push({ resolve, reject });
        }),
    });
    await mock.signIn(ANNA);
    const api = mock.api.teacherStudents;

    const first = api.downloadStudentReport("usr_ilya", "7d");
    const second = api.downloadStudentReport("usr_maria", "30d");
    for (let turn = 0; turn < 200 && pending.length < 2; turn += 1) await settle(1);
    assert.equal(pending.length, 2);

    const busy = await rejects(api.downloadStudentReport("usr_artem", "7d"), "reportsBusy", 503);
    assert.equal(busy.message, ru.apiCommon.reportsBusy);
    assert.equal(busy.retryAfterSeconds, 30);
    // The refusal consumed no slot of the export limit: two hits so far.
    assert.equal(mock.api.controls.listLimiters().find((bucket) => bucket.scope === "api:pdf-export")!.hits, 2);

    pending[0]!.resolve("file:///cache/a.pdf");
    assert.equal((await first).uri, "file:///cache/a.pdf");
    pending[1]!.reject(new Error("disk full"));
    const failed = await rejects(second, "exportFailed", 500);
    assert.equal(failed.message, getMobileDictionary("ru").common.errors.exportFailed);

    // Both slots are free again, also after the failure.
    const third = api.downloadStudentReport("usr_artem", "year");
    for (let turn = 0; turn < 200 && pending.length < 3; turn += 1) await settle(1);
    pending[2]!.resolve("file:///cache/c.pdf");
    assert.equal((await third).fileName, `Учебный год — Артём Кузнецов — ${today}.pdf`);
  });
});
