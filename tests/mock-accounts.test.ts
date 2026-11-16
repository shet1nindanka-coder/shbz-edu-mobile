// `accounts` member of the mock backend — the developer's accounts screen: directory, account creation,
// bulk change of a student's owner teacher, teacher password reset, teacher deletion with transfer
// (docs/spec/04-teacher-students.md S9, §3.7 – §3.10a, §4.13; 00 §2.9; 90-addendum-1 A.11).
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
import type { AccountCreateInput, OwnerChange, RealtimeEvent } from "../src/api/types";
import { MINUTE_MS } from "../src/domain/moscow-time";
import { getDictionary } from "../src/i18n/get-dictionary";
import { MOCK_COVERAGE } from "../src/mock/fixtures/coverage";
import { TEST_T0, createTestMock, type TestMock } from "../src/mock/testing";

const T0 = Date.parse(TEST_T0);
const ru = getDictionary("ru");
const en = getDictionary("en");

const ANNA = "teacher@example.com";
const IGOR = "teacher2@example.com";
const OLGA = "teacher3@example.com";
const DEV = "dev@example.com";
const PASSWORD = "Novikova-beku4725";

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

/** Subscribes to the realtime stream of the signed-in user and collects the kinds delivered. */
async function listen(mock: TestMock): Promise<{ kinds: () => string[] }> {
  const events: RealtimeEvent[] = [];
  mock.api.shell.subscribeRealtime((event) => events.push(event));
  await settle();
  return { kinds: () => events.map((event) => event.kind) };
}

async function developer(options: Parameters<typeof createTestMock>[0] = {}): Promise<TestMock> {
  const mock = createTestMock(options);
  await mock.signIn(DEV);
  return mock;
}

/** One thunk per method with valid arguments. */
function everyMethod(mock: TestMock): Record<string, () => Promise<unknown>> {
  const api = mock.api.accounts;
  return {
    getAccounts: () => api.getAccounts(),
    createAccount: () => api.createAccount({ role: "TEACHER", teacherId: "", name: "Новый Учитель", login: "new-teacher@example.com", password: PASSWORD }),
    changeStudentOwners: () => api.changeStudentOwners([{ studentId: "usr_orphan", teacherId: "usr_olga" }]),
    resetTeacherPassword: () => api.resetTeacherPassword("usr_olga", PASSWORD),
    deleteTeacher: () => api.deleteTeacher("usr_olga"),
  };
}

/** Rows that must not move when a request is refused. */
const snapshot = (mock: TestMock) => ({
  users: mock.store.users.size,
  owners: mock.store.users.by("role", "STUDENT").map((user) => `${user.id}:${user.teacherId}`).sort().join(","),
  lessons: mock.store.lessons.size,
  participants: mock.store.participants.size,
  groups: mock.store.groups.size,
  audits: mock.store.auditLogs.size,
});

describe("accounts: sessions and roles", () => {
  it("answers 401 sessionExpired without a session", async () => {
    const mock = createTestMock();
    const methods = everyMethod(mock);
    assert.equal(Object.keys(methods).length, 5);
    for (const [name, call] of Object.entries(methods)) {
      assert.equal((await rejects(call(), "sessionExpired", 401)).message, ru.apiCommon.sessionExpired, name);
    }
  });

  it("answers 403 developerRightsRequired to a teacher and to a student, changing nothing", async () => {
    for (const login of [ANNA, OLGA, "ilya@example.com"]) {
      const mock = createTestMock();
      await mock.signIn(login);
      const before = snapshot(mock);
      for (const [name, call] of Object.entries(everyMethod(mock))) {
        assert.equal((await rejects(call(), "developerRightsRequired", 403)).message, ru.apiCommon.developerRightsRequired, `${login} ${name}`);
      }
      assert.deepEqual(snapshot(mock), before);
    }
    const mock = createTestMock({ locale: "en" });
    await mock.signIn(ANNA);
    assert.equal((await rejects(mock.api.accounts.getAccounts(), "developerRightsRequired", 403)).message, en.apiCommon.developerRightsRequired);
  });
});

describe("accounts: demo-screen switches", () => {
  it("honours a forced error before the method runs and maps notFound to teacherNotFound", async () => {
    const mock = await developer();
    assert.equal(MOCK_COVERAGE.find((entry) => entry.key === "anyCall.forcedError")!.control, "forceNextError");
    const before = snapshot(mock);
    for (const [name, call] of Object.entries(everyMethod(mock))) {
      mock.api.controls.set("forceNextError", { method: `accounts.${name}`, error: "notFound", times: 1 });
      await rejects(call(), "teacherNotFound", 404);
    }
    mock.api.controls.set("forceNextError", { method: "accounts.deleteTeacher", error: "rateLimited", times: 2 });
    assert.equal((await rejects(mock.api.accounts.deleteTeacher("usr_olga"), "rateLimited", 429)).retryAfterSeconds, 30);
    // Armed for another method: this one is not affected.
    assert.equal((await mock.api.accounts.getAccounts()).teachers.length, 3);
    await rejects(mock.api.accounts.deleteTeacher("usr_olga"), "rateLimited", 429);
    assert.deepEqual(snapshot(mock), before);
    assert.deepEqual(await mock.api.accounts.deleteTeacher("usr_olga"), { transferredStudents: 0 });

    mock.setOnline(false);
    await rejects(mock.api.accounts.getAccounts(), "network", 0);
  });
});

describe("accounts.getAccounts", () => {
  it("lists every teacher with the counters and every student with the owner, both by name", async () => {
    const mock = await developer();
    const row = MOCK_COVERAGE.find((entry) => entry.key === "ownership.isolation.orphan.noProfile")!;
    assert.equal(row.check!(mock.store, T0), true);

    const { teachers, students } = await mock.api.accounts.getAccounts();
    assert.deepEqual(
      teachers.map((teacher) => [teacher.id, teacher.name, teacher.email, teacher.studentCount, teacher.testCount]),
      [
        ["usr_anna", "Анна Петрова", "teacher@example.com", 7, 0],
        ["usr_igor", "Игорь Соколов", "teacher2@example.com", 2, 0],
        ["usr_olga", "Ольга Новикова", "teacher3@example.com", 0, 0],
      ],
    );
    // Lessons AND homework drafts are `Lesson` rows of the teacher.
    for (const teacher of teachers) {
      assert.deepEqual(Object.keys(teacher).sort(), ["email", "id", "lessonCount", "name", "studentCount", "testCount"]);
      assert.equal(teacher.lessonCount, mock.store.lessons.by("teacherId", teacher.id).length);
    }
    assert.ok(mock.store.lessons.by("teacherId", "usr_anna").some((lesson) => lesson.kind === "HOMEWORK"));
    assert.deepEqual([teachers[1]!.lessonCount, teachers[2]!.lessonCount], [1, 0]);

    assert.equal(students.length, 10);
    assert.deepEqual(students.map((student) => student.name), [...students.map((student) => student.name)].sort((left, right) => left.localeCompare(right, "ru")));
    for (const student of students) {
      // Never the password, the profile or anything else of the row.
      assert.deepEqual(Object.keys(student).sort(), ["email", "id", "name", "teacherId"]);
      assert.equal(student.teacherId, mock.store.users.get(student.id)!.teacherId);
    }
    // The unattributed student is listed with `teacherId: null`.
    assert.deepEqual(students.find((student) => student.id === "usr_orphan"), { id: "usr_orphan", name: "Лев Без-Учителя", email: "lev@example.com", teacherId: null });
    assert.equal(students.filter((student) => student.teacherId === "usr_anna").length, 7);
    // The developer is neither a teacher nor a student.
    assert.equal([...teachers, ...students].some((entry) => entry.id === "usr_dev"), false);
  });
});

describe("accounts.createAccount", () => {
  const teacher: AccountCreateInput = { role: "TEACHER", teacherId: "", name: "Пётр Иванов", login: "petr@example.com", password: PASSWORD };
  const student: AccountCreateInput = { role: "STUDENT", teacherId: "usr_olga", name: "Зоя Ким", login: "zoya@example.com", password: PASSWORD };

  it("creates a teacher: no owner, journal row, students-changed, immediate sign-in", async () => {
    const mock = await developer();
    const realtime = await listen(mock);
    const audits = mock.store.auditLogs.size;

    // A teacher id sent along with a TEACHER is not used.
    const { account } = await mock.api.accounts.createAccount({ ...teacher, teacherId: "usr_anna", name: "  Пётр   Иванов ", login: " Petr@Example.com " });
    assert.deepEqual(Object.keys(account).sort(), ["email", "id", "name", "role", "teacherId"]);
    assert.deepEqual([account.name, account.email, account.role, account.teacherId], ["Пётр Иванов", "petr@example.com", "TEACHER", null]);
    const row = mock.store.users.get(account.id)!;
    assert.deepEqual([row.role, row.teacherId, row.password, row.createdAt], ["TEACHER", null, PASSWORD, TEST_T0]);

    assert.equal(mock.store.auditLogs.size, audits + 1);
    const audit = mock.store.auditLogs.all().at(-1)!;
    assert.deepEqual([audit.category, audit.action, audit.actorId, audit.actorRole, audit.targetType, audit.targetLabel], ["DATA", "account.create", "usr_dev", "DEVELOPER", "User", "Пётр Иванов"]);
    assert.equal(audit.summary, `Создан аккаунт Пётр Иванов (${ru.roles.TEACHER})`);
    assert.deepEqual((audit.meta as { accountLogin: string; accountRole: string }).accountRole, "TEACHER");
    assert.equal(JSON.stringify(audit).includes(PASSWORD), false);
    await settle();
    assert.deepEqual(realtime.kinds(), ["students-changed"]);

    const { teachers } = await mock.api.accounts.getAccounts();
    assert.deepEqual(teachers.find((entry) => entry.id === account.id), { id: account.id, name: "Пётр Иванов", email: "petr@example.com", studentCount: 0, lessonCount: 0, testCount: 0 });

    const signedIn = await mock.signIn("petr@example.com", PASSWORD);
    assert.deepEqual([signedIn.id, signedIn.role], [account.id, "TEACHER"]);
    assert.deepEqual(await mock.api.teacherStudents.listStudents(), { students: [] });
  });

  it("creates a student owned by the chosen teacher", async () => {
    const mock = await developer();
    const { account } = await mock.api.accounts.createAccount(student);
    assert.deepEqual([account.role, account.teacherId, account.email], ["STUDENT", "usr_olga", "zoya@example.com"]);
    assert.equal(mock.store.auditLogs.all().at(-1)!.summary, `Создан аккаунт Зоя Ким (${ru.roles.STUDENT})`);

    const { teachers, students } = await mock.api.accounts.getAccounts();
    assert.equal(teachers.find((entry) => entry.id === "usr_olga")!.studentCount, 1);
    assert.deepEqual(students.find((entry) => entry.id === account.id), { id: account.id, name: "Зоя Ким", email: "zoya@example.com", teacherId: "usr_olga" });

    // The owner sees the student at once; the student can sign in.
    await mock.signIn(OLGA);
    assert.deepEqual((await mock.api.teacherStudents.listStudents()).students.map((entry) => entry.id), [account.id]);
    assert.equal((await mock.signIn("zoya@example.com", PASSWORD)).role, "STUDENT");
  });

  it("validates role, owner, name, login and password at the site's limits", async () => {
    const mock = await developer();
    const users = mock.store.users.size;
    const invalid = async (input: Partial<AccountCreateInput> | Record<string, unknown>, label: string) => {
      const error = await rejects(mock.api.accounts.createAccount({ ...student, ...input } as AccountCreateInput), "invalidData", 400);
      assert.equal(error.message, ru.students.actions.createAccount.invalid, label);
    };
    await invalid({ role: "DEVELOPER" }, "developer role");
    await invalid({ role: "student" }, "lower-case role");
    await invalid({ role: undefined }, "no role");
    await invalid({ teacherId: "" }, "student without a teacher");
    await invalid({ teacherId: "   " }, "blank teacher");
    await invalid({ teacherId: undefined }, "missing teacher");
    await invalid({ name: " " }, "blank name");
    await invalid({ name: "я".repeat(121) }, "name 121");
    await invalid({ login: "" }, "blank login");
    await invalid({ login: `${"a".repeat(243)}@example.com` }, "login 255");
    await invalid({ password: "Abc1234" }, "password 7");
    await invalid({ password: `a1${"x".repeat(255)}` }, "password 257");
    await invalid({ password: "abcdefgh" }, "no digit");
    await invalid({ password: "iloveyou" }, "common, no digit");
    await invalid({ password: "password123" }, "common");
    assert.equal(mock.store.users.size, users);
    assert.equal(mock.api.controls.listLimiters().some((bucket) => bucket.scope === "create-account"), false);

    const longest = await mock.api.accounts.createAccount({ ...teacher, name: "я".repeat(120), login: `${"a".repeat(242)}@example.com`, password: `a1${"x".repeat(254)}` });
    assert.deepEqual([longest.account.name.length, longest.account.email.length], [120, 254]);
    mock.setLocale("en");
    assert.equal((await rejects(mock.api.accounts.createAccount({ ...student, name: "" }), "invalidData", 400)).message, en.students.actions.createAccount.invalid);
  });

  it("answers 404 teacherNotFound for a missing owner, then 409 exists for a taken login", async () => {
    const mock = await developer();
    const users = mock.store.users.size;
    for (const teacherId of ["nope", "usr_ilya", "usr_dev"]) {
      // The owner is checked before the login: a taken login with a missing teacher is still a 404.
      const error = await rejects(mock.api.accounts.createAccount({ ...student, teacherId, login: "ilya@example.com" }), "teacherNotFound", 404);
      assert.equal(error.message, ru.students.actions.createAccount.teacherMissing, teacherId);
    }
    for (const input of [{ ...student, login: "ILYA@example.com" }, { ...student, login: "teacher@example.com" }, { ...teacher, login: " dev@example.com" }, { ...teacher, login: "lev@example.com" }]) {
      const error = await rejects(mock.api.accounts.createAccount(input), "exists", 409);
      assert.equal(error.message, ru.students.actions.createAccount.exists);
    }
    assert.equal(mock.store.users.size, users);
    mock.setLocale("en");
    assert.equal((await rejects(mock.api.accounts.createAccount({ ...student, teacherId: "nope" }), "teacherNotFound", 404)).message, en.students.actions.createAccount.teacherMissing);
  });

  it("allows 20 valid requests per 10 minutes, the refused ones included", async () => {
    const mock = await developer();
    const api = mock.api.accounts;
    for (let index = 0; index < 18; index += 1) {
      await api.createAccount({ ...student, name: `Ученик ${index}`, login: `bulk-${index}@example.com` });
    }
    await rejects(api.createAccount({ ...student, teacherId: "nope" }), "teacherNotFound", 404);
    await rejects(api.createAccount({ ...student, login: "ilya@example.com" }), "exists", 409);

    const error = await rejects(api.createAccount(teacher), "rateLimited", 429);
    assert.equal(error.message, ru.students.actions.createAccount.rateLimited);
    assert.equal(error.retryAfterSeconds, 600);
    assert.equal(mock.store.users.findUnique("email", teacher.login), undefined);

    mock.clock.advance(10 * MINUTE_MS - 1000);
    assert.equal((await rejects(api.createAccount(teacher), "rateLimited", 429)).retryAfterSeconds, 1);
    mock.clock.advance(1000);
    assert.equal((await api.createAccount(teacher)).account.role, "TEACHER");
  });
});

describe("accounts.changeStudentOwners", () => {
  it("attaches an orphan and moves a student between teachers in one call", async () => {
    const mock = await developer();
    const realtime = await listen(mock);
    const audits = mock.store.auditLogs.size;

    const result = await mock.api.accounts.changeStudentOwners([
      { studentId: "usr_orphan", teacherId: "usr_olga" },
      { studentId: " usr_sofia ", teacherId: " usr_anna " },
    ]);
    assert.deepEqual(result, { changed: 2 });
    assert.equal(mock.store.users.get("usr_orphan")!.teacherId, "usr_olga");
    assert.equal(mock.store.users.get("usr_sofia")!.teacherId, "usr_anna");

    // Софья leaves Igor's group and his lesson that has not started yet.
    assert.equal(mock.store.profiles.findUnique("userId", "usr_sofia")!.groupId, null);
    assert.equal(mock.store.participants.findUnique("lessonStudent", "les_igor_1|usr_sofia"), undefined);
    assert.equal(mock.store.lessonItems.by("participantId", "lp_les_igor_1_sofia").length, 0);
    // Her classmate is not touched; her own homework and statuses move with her.
    assert.ok(mock.store.participants.findUnique("lessonStudent", "les_igor_1|usr_egor"));
    assert.equal(mock.store.profiles.findUnique("userId", "usr_egor")!.groupId, "grp_10b");
    assert.equal(mock.store.homeworks.get("hw_sofia_1")!.studentId, "usr_sofia");
    // The developer's demo lesson has no start time and is not the new owner's: the orphan leaves it too.
    assert.equal(mock.store.participants.findUnique("lessonStudent", "les_dev_demo|usr_orphan"), undefined);

    assert.equal(mock.store.auditLogs.size, audits + 1);
    const audit = mock.store.auditLogs.all().at(-1)!;
    assert.deepEqual([audit.action, audit.actorId, audit.targetType, audit.summary], ["student.owner_change", "usr_dev", "User", "Смена владельца у учеников: 2"]);
    assert.deepEqual((audit.meta as { changes: OwnerChange[] }).changes, [{ studentId: "usr_orphan", teacherId: "usr_olga" }, { studentId: "usr_sofia", teacherId: "usr_anna" }]);
    await settle();
    assert.deepEqual(realtime.kinds(), ["students-changed"]);

    // The new owners see the students at once; the previous one does not.
    await mock.signIn(OLGA);
    assert.deepEqual((await mock.api.teacherStudents.listStudents()).students.map((entry) => entry.id), ["usr_orphan"]);
    await mock.signIn(ANNA);
    assert.equal((await mock.api.teacherStudents.getStudentCard("usr_sofia")).student.name, "Софья Орлова");
    assert.equal((await mock.api.teacherStudents.getStudentHomeworks("usr_sofia")).assignments[0]!.id, "hw_sofia_1");
    await mock.signIn(IGOR);
    await rejects(mock.api.teacherStudents.getStudentCard("usr_sofia"), "studentNotFound", 404);
  });

  it("removes the student from not-started lessons and un-issued drafts of other teachers, keeping history", async () => {
    const mock = await developer();
    const has = (lessonId: string) => mock.store.participants.findUnique("lessonStudent", `${lessonId}|usr_artem`) !== undefined;
    for (const lessonId of ["les_tomorrow_group", "les_unscheduled", "hp_generating", "les_live", "les_g1", "les_g_unfinalized", "hp_issued"]) {
      assert.equal(has(lessonId), true, lessonId);
    }
    assert.equal(mock.store.jobs.by("refId", "lp_hp_generating_artem").length, 1);

    assert.deepEqual(await mock.api.accounts.changeStudentOwners([{ studentId: "usr_artem", teacherId: "usr_igor" }]), { changed: 1 });

    // Planned for the future, without a start time, an un-issued draft: the participation is removed.
    assert.deepEqual(["les_tomorrow_group", "les_unscheduled", "hp_generating"].map(has), [false, false, false]);
    assert.equal(mock.store.jobs.by("refId", "lp_hp_generating_artem").length, 0);
    // Running, finished (also when not closed yet) and an issued draft stay as history.
    assert.deepEqual(["les_live", "les_g1", "les_g_unfinalized", "hp_issued"].map(has), [true, true, true, true]);
    assert.equal(mock.store.profiles.findUnique("userId", "usr_artem")!.groupId, null);
    // The other members of the group and of the lessons are untouched.
    assert.equal(mock.store.participants.by("lessonId", "les_tomorrow_group").length, 2);
    assert.equal(mock.store.profiles.findUnique("userId", "usr_polina")!.groupId, "grp_8a");

    // The previous owner no longer sees the student; the new one sees none of the old lessons.
    await mock.signIn(ANNA);
    await rejects(mock.api.teacherStudents.listStudentLessons("usr_artem"), "studentNotFound", 404);
    await mock.signIn(IGOR);
    assert.deepEqual(await mock.api.teacherStudents.listStudentLessons("usr_artem"), { lessons: [] });
    assert.ok((await mock.api.teacherStudents.getStudentHomeworks("usr_artem")).assignments.length > 0);
  });

  it("leaves the group and the lessons alone when the owner stays the same", async () => {
    const mock = await developer();
    const participants = mock.store.participants.by("studentId", "usr_artem").length;
    assert.deepEqual(await mock.api.accounts.changeStudentOwners([{ studentId: "usr_artem", teacherId: "usr_anna" }]), { changed: 1 });
    assert.equal(mock.store.participants.by("studentId", "usr_artem").length, participants);
    assert.equal(mock.store.profiles.findUnique("userId", "usr_artem")!.groupId, "grp_8a");
    // A student without a profile row is fine too.
    assert.deepEqual(await mock.api.accounts.changeStudentOwners([{ studentId: "usr_timur", teacherId: "usr_olga" }]), { changed: 1 });
    assert.equal(mock.store.users.get("usr_timur")!.teacherId, "usr_olga");
  });

  it("is all-or-nothing: 400 ownerInvalid for an empty, malformed or partly unknown list", async () => {
    const mock = await developer();
    const realtime = await listen(mock);
    const before = snapshot(mock);
    const invalid: unknown[] = [
      [],
      null,
      "usr_orphan",
      { studentId: "usr_orphan", teacherId: "usr_olga" },
      // Entries with an empty id are dropped; nothing is left.
      [{ studentId: "", teacherId: "usr_olga" }, { studentId: "usr_orphan", teacherId: "  " }, null],
      [{ studentId: "nope", teacherId: "usr_olga" }],
      [{ studentId: "usr_orphan", teacherId: "nope" }],
      // A teacher is not a student and a student is not a teacher.
      [{ studentId: "usr_igor", teacherId: "usr_olga" }],
      [{ studentId: "usr_orphan", teacherId: "usr_ilya" }],
      [{ studentId: "usr_orphan", teacherId: "usr_dev" }],
      // One stale row refuses the valid ones next to it.
      [{ studentId: "usr_orphan", teacherId: "usr_olga" }, { studentId: "usr_sofia", teacherId: "nope" }],
    ];
    for (const changes of invalid) {
      const error = await rejects(mock.api.accounts.changeStudentOwners(changes as OwnerChange[]), "ownerInvalid", 400);
      assert.equal(error.message, ru.students.accounts.notices.ownerInvalid);
    }
    assert.deepEqual(snapshot(mock), before);
    await settle();
    assert.deepEqual(realtime.kinds(), []);

    // A dropped entry next to a valid one does not count.
    assert.deepEqual(await mock.api.accounts.changeStudentOwners([{ studentId: "", teacherId: "usr_olga" }, { studentId: "usr_orphan", teacherId: "usr_olga" }]), { changed: 1 });
  });
});

describe("accounts.resetTeacherPassword", () => {
  it("sets the new password and ends every session of the teacher only", async () => {
    const mock = await developer();
    const realtime = await listen(mock);
    mock.ctx.auth.createSession("usr_igor");
    mock.ctx.auth.createSession("usr_igor");
    mock.ctx.auth.createSession("usr_sofia");
    const audits = mock.store.auditLogs.size;

    assert.equal(await mock.api.accounts.resetTeacherPassword("usr_igor", PASSWORD), undefined);

    assert.equal(mock.store.sessions.by("userId", "usr_igor").length, 0);
    // Students of the teacher and the developer stay signed in.
    assert.equal(mock.store.sessions.by("userId", "usr_sofia").length, 1);
    assert.equal((await mock.api.shell.getMe()).user.id, "usr_dev");
    assert.equal(mock.store.users.by("teacherId", "usr_igor").length, 2);

    assert.equal(mock.store.auditLogs.size, audits + 1);
    const audit = mock.store.auditLogs.all().at(-1)!;
    assert.deepEqual([audit.action, audit.actorId, audit.targetId, audit.summary], ["teacher.password_reset", "usr_dev", "usr_igor", "Сброшен пароль учителя"]);
    assert.equal(JSON.stringify(audit).includes(PASSWORD), false);
    await settle();
    assert.deepEqual(realtime.kinds(), []);

    await rejects(mock.api.shell.login({ login: IGOR, password: "teacher123" }), "invalidCredentials", 401);
    assert.equal((await mock.signIn(IGOR, PASSWORD)).id, "usr_igor");
  });

  it("checks the password before the teacher and answers 404 teacherNotFound for anything that is not a teacher", async () => {
    const mock = await developer();
    const api = mock.api.accounts;
    for (const password of ["Abc1234", `a1${"x".repeat(255)}`, "abcdefgh", "12345678", "1q2w3e4r", ""]) {
      for (const id of ["usr_igor", "nope"]) {
        const error = await rejects(api.resetTeacherPassword(id, password), "invalidData", 400);
        assert.equal(error.message, ru.students.accounts.notices.teacherPasswordInvalid);
      }
    }
    assert.equal(mock.api.controls.listLimiters().some((bucket) => bucket.scope === "reset-teacher-password"), false);

    for (const id of ["nope", "usr_ilya", "usr_dev", "", "  "]) {
      const error = await rejects(api.resetTeacherPassword(id, PASSWORD), "teacherNotFound", 404);
      assert.equal(error.message, ru.students.accounts.notices.teacherPasswordMissing, id);
    }
    assert.equal(mock.store.users.get("usr_ilya")!.password, "student123");
    assert.equal(mock.store.users.get("usr_igor")!.password, "teacher123");

    await api.resetTeacherPassword("usr_igor", `a1${"x".repeat(254)}`);
    assert.equal(mock.store.users.get("usr_igor")!.password.length, 256);
  });

  it("allows 20 valid requests per 10 minutes", async () => {
    const mock = await developer();
    const api = mock.api.accounts;
    // An empty id is refused before the limiter; an unknown one after it.
    await rejects(api.resetTeacherPassword("", PASSWORD), "teacherNotFound", 404);
    for (let index = 0; index < 20; index += 1) await rejects(api.resetTeacherPassword("nope", PASSWORD), "teacherNotFound", 404);

    const error = await rejects(api.resetTeacherPassword("usr_igor", PASSWORD), "rateLimited", 429);
    assert.deepEqual([error.message, error.retryAfterSeconds], [ru.students.accounts.notices.teacherPasswordRateLimited, 600]);
    assert.equal(mock.store.users.get("usr_igor")!.password, "teacher123");
    // The student-reset bucket is a separate one.
    await mock.api.teacherStudents.resetStudentPassword("usr_ilya", PASSWORD);

    mock.clock.advance(10 * MINUTE_MS);
    await api.resetTeacherPassword("usr_igor", PASSWORD);
    assert.equal(mock.store.users.get("usr_igor")!.password, PASSWORD);
  });
});

describe("accounts.deleteTeacher", () => {
  it("deletes a teacher without students straight away", async () => {
    const mock = await developer();
    const realtime = await listen(mock);
    mock.ctx.auth.createSession("usr_olga");
    const audits = mock.store.auditLogs.size;

    assert.deepEqual(await mock.api.accounts.deleteTeacher("usr_olga"), { transferredStudents: 0 });
    assert.equal(mock.store.users.has("usr_olga"), false);
    assert.equal(mock.store.sessions.by("userId", "usr_olga").length, 0);

    assert.equal(mock.store.auditLogs.size, audits + 1);
    const audit = mock.store.auditLogs.all().at(-1)!;
    assert.deepEqual([audit.action, audit.actorId, audit.targetId, audit.targetLabel, audit.summary], ["teacher.delete", "usr_dev", "usr_olga", "Ольга Новикова", "Удалён учитель Ольга Новикова; учеников переведено: 0"]);
    assert.deepEqual(audit.meta && { studentCount: (audit.meta as { studentCount: number }).studentCount, newOwnerId: (audit.meta as { newOwnerId: string | null }).newOwnerId }, { studentCount: 0, newOwnerId: null });
    await settle();
    assert.deepEqual(realtime.kinds(), ["students-changed"]);

    assert.deepEqual((await mock.api.accounts.getAccounts()).teachers.map((teacher) => teacher.id), ["usr_anna", "usr_igor"]);
    await rejects(mock.api.shell.login({ login: OLGA, password: "teacher123" }), "invalidCredentials", 401);
    // Deleting it again: the teacher is gone.
    assert.equal((await rejects(mock.api.accounts.deleteTeacher("usr_olga"), "teacherNotFound", 404)).message, ru.students.accounts.notices.teacherMissing);
  });

  it("refuses a teacher with students unless a DIFFERENT existing teacher takes them over", async () => {
    const mock = await developer();
    const before = snapshot(mock);
    for (const target of [undefined, "", "   ", "usr_igor", "nope", "usr_sofia", "usr_dev"]) {
      const error = await rejects(mock.api.accounts.deleteTeacher("usr_igor", target), "teacherTransfer", 409);
      assert.equal(error.message, ru.students.accounts.notices.teacherTransfer, String(target));
    }
    assert.deepEqual(snapshot(mock), before);
    assert.equal(mock.store.users.has("usr_igor"), true);

    for (const id of ["nope", "usr_ilya", "usr_dev", "", "  "]) {
      const error = await rejects(mock.api.accounts.deleteTeacher(id, "usr_olga"), "teacherNotFound", 404);
      assert.equal(error.message, ru.students.accounts.notices.teacherMissing, id);
    }
    assert.deepEqual(snapshot(mock), before);
    mock.setLocale("en");
    assert.equal((await rejects(mock.api.accounts.deleteTeacher("usr_igor"), "teacherTransfer", 409)).message, en.students.accounts.notices.teacherTransfer);
  });

  it("moves students, lessons, drafts and groups to the new owner and keeps their history", async () => {
    const mock = await developer();
    const { store } = mock;
    const realtime = await listen(mock);
    mock.ctx.auth.createSession("usr_anna");
    const lessons = store.lessons.by("teacherId", "usr_anna").map((lesson) => lesson.id);
    const groups = store.groups.by("teacherId", "usr_anna").map((group) => group.id);
    const calls = store.parentCalls.by("teacherId", "usr_anna").map((call) => call.id);
    const participants = store.participants.size;
    const submissions = store.submissions.size;
    assert.ok(lessons.length > 20 && groups.length === 2 && calls.length > 0);
    // A file the teacher uploaded: it must survive with the developer as its owner.
    store.files.update("file_linear_theory", { uploadedById: "usr_anna" });

    assert.deepEqual(await mock.api.accounts.deleteTeacher("usr_anna", "usr_igor"), { transferredStudents: 7 });

    assert.equal(store.users.has("usr_anna"), false);
    assert.equal(store.sessions.by("userId", "usr_anna").length, 0);
    assert.equal(store.users.by("teacherId", "usr_igor").length, 9);
    assert.equal(store.users.by("teacherId", "usr_anna").length, 0);
    assert.ok(lessons.every((id) => store.lessons.get(id)!.teacherId === "usr_igor"));
    assert.ok(groups.every((id) => store.groups.get(id)!.teacherId === "usr_igor"));
    // Attendance, results and hand-ins are kept; members stay in their groups.
    assert.equal(store.participants.size, participants);
    assert.equal(store.submissions.size, submissions);
    assert.equal(store.profiles.findUnique("userId", "usr_artem")!.groupId, "grp_8a");
    // The call journal keeps its rows without the teacher.
    assert.ok(calls.every((id) => store.parentCalls.get(id)!.teacherId === null));
    assert.deepEqual([store.files.get("file_linear_theory")!.uploadedById, store.topics.get("top_linear")!.theoryFileId], ["usr_dev", "file_linear_theory"]);

    const audit = store.auditLogs.all().at(-1)!;
    assert.equal(audit.summary, "Удалён учитель Анна Петрова; учеников переведено: 7");
    assert.deepEqual((audit.meta as { newOwnerId: string }).newOwnerId, "usr_igor");
    await settle();
    assert.deepEqual(realtime.kinds(), ["students-changed"]);

    const { teachers } = await mock.api.accounts.getAccounts();
    assert.deepEqual(teachers.map((teacher) => [teacher.id, teacher.studentCount, teacher.lessonCount]), [["usr_igor", 9, lessons.length + 1], ["usr_olga", 0, 0]]);

    // The new owner works with the transferred students and their lessons.
    await mock.signIn(IGOR);
    assert.equal((await mock.api.teacherStudents.listStudents()).students.length, 9);
    assert.equal((await mock.api.teacherStudents.listStudentLessons("usr_ilya")).lessons.length, 5);
    assert.equal((await mock.api.teacherStudents.getProgressHistory("usr_ilya", "num_118")).entries[1]!.reference?.kind, "lesson");
  });

  it("deletes the lessons and groups of a teacher who has no students, whatever transfer target is sent", async () => {
    const mock = await developer();
    const { store } = mock;
    // Igor's students leave first: they drop out of his not-started lesson and of his group.
    await mock.api.accounts.changeStudentOwners([
      { studentId: "usr_sofia", teacherId: "usr_anna" },
      { studentId: "usr_egor", teacherId: "usr_anna" },
    ]);
    assert.equal(store.lessons.has("les_igor_1"), true);
    assert.equal(store.groups.has("grp_10b"), true);
    store.files.update("file_log_answers", { uploadedById: "usr_igor" });

    assert.deepEqual(await mock.api.accounts.deleteTeacher("usr_igor", "usr_olga"), { transferredStudents: 0 });

    assert.equal(store.users.has("usr_igor"), false);
    assert.equal(store.lessons.has("les_igor_1"), false);
    assert.equal(store.participants.by("lessonId", "les_igor_1").length, 0);
    assert.equal(store.groups.has("grp_10b"), false);
    assert.equal(store.lessons.by("teacherId", "usr_olga").length, 0);
    assert.equal(store.files.get("file_log_answers")!.uploadedById, "usr_dev");
    // The former students are untouched.
    assert.equal(store.users.get("usr_sofia")!.teacherId, "usr_anna");
    assert.equal(store.homeworks.has("hw_sofia_1"), true);
    assert.equal(store.auditLogs.all().at(-1)!.summary, "Удалён учитель Игорь Соколов; учеников переведено: 0");
  });
});
