// Node's test runner and assert are typed by referencing only their declaration files: the project does not
// load `@types/node` globally (it would change DOM / React Native globals such as the timer return types).
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError } from "../src/api/errors";
import type { AnyApiErrorCode } from "../src/api/errors";
import type { RealtimeEvent, StudentTopicNumberStatus } from "../src/api/types";
import { LIMITS, RATE_LIMITS } from "../src/api/types";
import { DAY_MS, HOUR_MS, MINUTE_MS, isSameMskDay, mskDayKey } from "../src/domain/moscow-time";
import { MOCK_COVERAGE, TOPIC, USER, numberId } from "../src/mock";
import { TEST_T0, createTestMock, type TestMock } from "../src/mock/testing";

const T0 = Date.parse(TEST_T0);

const ILYA = "ilya@example.com";
const MARIA = "maria@example.com";
const SOFIA = "sofia@example.com";
const TIMUR = "timur@example.com";
const TEACHER = "teacher@example.com";
const DEVELOPER = "dev@example.com";

const RU = {
  sessionExpired: "Сессия истекла. Войдите заново.",
  rateLimited: "Слишком много запросов. Подождите немного и попробуйте снова.",
  serviceUnavailable: "Сервис временно недоступен. Попробуйте снова позже.",
  invalidNumber: "Введите корректный номер.",
  numberNotFound: "Такой номер не найден.",
  statusReadOnly: "Статус выставляется автоматической проверкой или учителем.",
  noteInvalidData: "Некорректные данные для сохранения номера.",
  noteNumberNotFound: "Номер задания для этой темы не найден.",
};

const EN = {
  sessionExpired: "Your session has expired. Please sign in again.",
  rateLimited: "Too many requests. Wait a moment and try again.",
  invalidNumber: "Enter a valid problem number.",
  numberNotFound: "No such problem found.",
  statusReadOnly: "The status is set by the automatic check or by the teacher.",
  noteInvalidData: "Invalid data for saving the problem.",
  noteNumberNotFound: "Problem not found for this topic.",
};

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
async function settle(): Promise<void> {
  for (let index = 0; index < 5; index += 1) await Promise.resolve();
}

function statusRow(mock: TestMock, studentId: string, label: string): StudentTopicNumberStatus | undefined {
  return mock.store.statuses.findUnique("studentNumber", `${studentId}|${numberId(label)}`);
}

/** Everything a note save must leave alone (journal, history, notifications) plus the status table itself. */
function sideEffectCounts(mock: TestMock) {
  return {
    // Sign-ins of the test itself write AUTH rows; everything else in the journal counts.
    audit: mock.store.auditLogs.count((row) => row.category !== "AUTH"),
    progressEvents: mock.store.progressEvents.size,
    notifications: mock.store.notifications.size,
    statuses: mock.store.statuses.size,
  };
}

/** Calls the note method with whatever a careless caller could put into the request body. */
function saveRaw(mock: TestMock, homeworkNumberId: unknown, note: unknown, signal?: AbortSignal) {
  const method = mock.api.studentStudy.saveNumberNote as unknown as (id: unknown, note: unknown, signal?: AbortSignal) => Promise<unknown>;
  return method(homeworkNumberId, note, signal);
}

function coverage(key: string) {
  const row = MOCK_COVERAGE.find((entry) => entry.key === key);
  assert.ok(row, `coverage row "${key}"`);
  return row;
}

async function signedIn(login: string): Promise<TestMock> {
  const mock = createTestMock();
  await mock.signIn(login);
  return mock;
}

/** The three role refusals every method of the member shares. */
async function assertStudentOnly(call: (mock: TestMock) => Promise<unknown>): Promise<void> {
  const mock = createTestMock();
  const before = sideEffectCounts(mock);

  const anonymous = await rejects(call(mock), "sessionExpired", 401);
  assert.equal(anonymous.message, RU.sessionExpired);

  await mock.signIn(TEACHER);
  const teacher = await rejects(call(mock), "unauthorized", 403);
  assert.equal(teacher.message, mock.ctx.dict().apiCommon.unauthorized);

  await mock.signIn(DEVELOPER);
  await rejects(call(mock), "unauthorized", 403);

  // A dead token is "no session", not a wrong role.
  mock.api.setSessionToken("0".repeat(64));
  await rejects(call(mock), "sessionExpired", 401);

  mock.setLocale("en");
  mock.signOut();
  assert.equal((await rejects(call(mock), "sessionExpired", 401)).message, EN.sessionExpired);

  assert.deepEqual(sideEffectCounts(mock), before);
}

// ───────────────────────────── getHomeworkDeadlines ─────────────────────────────

describe("studentStudy.getHomeworkDeadlines", () => {
  it("returns every homework of the student in creation order with the label parts kept apart", async () => {
    const mock = await signedIn(ILYA);
    const response = await mock.api.studentStudy.getHomeworkDeadlines();

    assert.equal(response.serverNow, TEST_T0);
    assert.equal(response.today, "2026-11-16");
    assert.deepEqual(Object.keys(response).sort(), ["items", "serverNow", "today"]);

    assert.deepEqual(
      response.items.map((item) => [item.id, item.title, item.orderInTopic, item.topicTitle, item.totalNumbers, item.solvedCount]),
      [
        ["hw_ilya_done", "Повторение перед контрольной", 1, "Линейные уравнения", 2, 2],
        // Untitled: «ДЗ 2» — the titled homework before it counts too.
        ["hw_ilya_overdue", null, 2, "Линейные уравнения", 3, 0],
        ["hw_ilya_uncertain", "Парабола: вершина и нули", 1, "Квадратные функции", 4, 3],
        ["hw_ilya_failed", "Логарифмы — база", 1, "Логарифмические уравнения", 3, 1],
        ["hw_ilya_open", null, 1, "Производная и исследование функций", 3, 1],
        ["hw_ilya_soon", null, 3, "Линейные уравнения", 3, 2],
        ["hw_ilya_later", null, 2, "Логарифмические уравнения", 3, 2],
        ["hw_ilya_today", null, 2, "Квадратные функции", 2, 0],
        ["hw_ilya_far", null, 1, "Текстовые задачи", 12, 4],
      ],
    );

    // Order = `createdAt` asc of the stored rows.
    const created = response.items.map((item) => mock.store.homeworks.get(item.id)?.createdAt ?? "");
    assert.deepEqual(created, [...created].sort());

    // Exactly the seven wire fields; instants are ISO strings; nothing else of the row leaks.
    for (const item of response.items) {
      assert.deepEqual(Object.keys(item).sort(), ["deadlineAt", "id", "orderInTopic", "solvedCount", "title", "topicTitle", "totalNumbers"]);
      assert.ok(item.deadlineAt === null || new Date(item.deadlineAt).toISOString() === item.deadlineAt);
      const stored = mock.store.homeworks.get(item.id);
      assert.equal(stored?.studentId, USER.ilya);
      // «ДЗ N» is the same N the full homework list derives from the shared query helper.
      assert.equal(stored && mock.ctx.q.homeworkOrderInTopic(stored), item.orderInTopic);
    }
  });

  it("counts GREEN and YELLOW only: RED, a cleared mark and a bare note are not solved", async () => {
    const mock = await signedIn(ILYA);
    const byId = new Map((await mock.api.studentStudy.getHomeworkDeadlines()).items.map((item) => [item.id, item]));

    // 118 RED, 120 note without a colour, 124 cleared by the teacher.
    assert.deepEqual([statusRow(mock, USER.ilya, "118")?.status, statusRow(mock, USER.ilya, "120")?.status, statusRow(mock, USER.ilya, "124")?.status], ["RED", null, null]);
    assert.equal(byId.get("hw_ilya_overdue")?.solvedCount, 0);
    // 121 GREEN, 127 YELLOW, 130 RED.
    assert.equal(byId.get("hw_ilya_soon")?.solvedCount, 2);
  });

  it("shows the states of the coverage checklist: overdue, today, another month, no deadline, same day, done in advance", async () => {
    for (const key of ["homework.overdue", "homework.deadline.todaySoonFarNone", "homework.completedBeforeDeadline.twoOnOneDay"]) {
      const seeded = createTestMock();
      assert.equal(coverage(key).check?.(seeded.store, T0), true, key);
    }

    const ilya = await signedIn(ILYA);
    const mine = await ilya.api.studentStudy.getHomeworkDeadlines();
    const item = (id: string) => {
      const found = mine.items.find((entry) => entry.id === id);
      assert.ok(found, id);
      return found;
    };
    const serverNow = Date.parse(mine.serverNow);

    // Overdue and unfinished.
    const overdue = item("hw_ilya_overdue");
    assert.ok(overdue.deadlineAt !== null && Date.parse(overdue.deadlineAt) < serverNow && overdue.solvedCount < overdue.totalNumbers);
    // Completed after its deadline passed: done, hence not overdue.
    const done = item("hw_ilya_done");
    assert.ok(done.deadlineAt !== null && Date.parse(done.deadlineAt) < serverNow && done.solvedCount === done.totalNumbers);
    // Deadline today (23:59 Moscow time) lands on `today`.
    assert.equal(mskDayKey(item("hw_ilya_today").deadlineAt ?? 0), mine.today);
    // Tomorrow, and one in the next month.
    assert.equal(mskDayKey(item("hw_ilya_soon").deadlineAt ?? 0), "2026-11-17");
    assert.equal(mskDayKey(item("hw_ilya_far").deadlineAt ?? 0).slice(0, 7), "2026-12");
    // In progress vs not started.
    assert.ok(item("hw_ilya_uncertain").solvedCount > 0 && item("hw_ilya_uncertain").solvedCount < item("hw_ilya_uncertain").totalNumbers);
    assert.equal(item("hw_ilya_today").solvedCount, 0);

    const maria = await signedIn(MARIA);
    const hers = await maria.api.studentStudy.getHomeworkDeadlines();
    assert.deepEqual(
      hers.items.map((entry) => [entry.id, entry.orderInTopic, entry.deadlineAt === null]),
      [
        // No deadline: still listed (the client leaves it out of the calendar).
        ["hw_maria_legacy", 1, true],
        ["hw_maria_done1", 2, false],
        ["hw_maria_done2", 1, false],
        ["hw_maria_done3", 1, false],
      ],
    );
    const [, done1, done2, done3] = hers.items;
    assert.ok(done1 && done2 && done3 && done1.deadlineAt && done2.deadlineAt && done3.deadlineAt);
    // Two homeworks on one Moscow day, at different times.
    assert.notEqual(done1.deadlineAt, done2.deadlineAt);
    assert.ok(isSameMskDay(done1.deadlineAt, done2.deadlineAt));
    // Completed although the deadline is still ahead; the stored auto-title is data.
    assert.ok(Date.parse(done3.deadlineAt) > Date.parse(hers.serverNow));
    assert.equal(done3.solvedCount, done3.totalNumbers);
    assert.equal(done3.title, "ДЗ по теме «Квадратные функции» до 18 ноября 2026 г.");
    assert.ok(hers.items.every((entry) => entry.solvedCount === entry.totalNumbers));
  });

  it("is per student: an empty list for a new account, never another student's homework", async () => {
    const timur = await signedIn(TIMUR);
    assert.deepEqual((await timur.api.studentStudy.getHomeworkDeadlines()).items, []);

    const sofia = await signedIn(SOFIA);
    assert.deepEqual((await sofia.api.studentStudy.getHomeworkDeadlines()).items.map((item) => item.id), ["hw_sofia_1"]);
  });

  it("reports `today` as the Moscow calendar day of `serverNow`", async () => {
    const mock = await signedIn(ILYA);

    // 23:59 Moscow time is still the 16th …
    mock.clock.advance(11 * HOUR_MS + 59 * MINUTE_MS);
    let response = await mock.api.studentStudy.getHomeworkDeadlines();
    assert.deepEqual([response.serverNow, response.today], ["2026-11-16T20:59:00.000Z", "2026-11-16"]);

    // … and one minute later it is the 17th in Moscow while the UTC date is still the 16th.
    mock.clock.advance(MINUTE_MS);
    response = await mock.api.studentStudy.getHomeworkDeadlines();
    assert.deepEqual([response.serverNow, response.today], ["2026-11-16T21:00:00.000Z", "2026-11-17"]);
  });

  it("follows the current colours, new homeworks and cancellations", async () => {
    const mock = await signedIn(ILYA);
    const anna = mock.ctx.q.user(USER.anna);
    assert.ok(anna);
    const item = async (id: string) => (await mock.api.studentStudy.getHomeworkDeadlines()).items.find((entry) => entry.id === id);

    // The teacher marks 118 as solved: the counter of the homework that contains it moves.
    mock.ctx.progress.write({ source: "teacher", status: "GREEN", studentId: USER.ilya, homeworkNumberId: numberId("118"), actor: anna });
    assert.equal((await item("hw_ilya_overdue"))?.solvedCount, 1);

    // A new homework of the same topic is the 4th there; the status of a number is shared between homeworks.
    const deadlineAt = new Date(T0 + 3 * DAY_MS).toISOString();
    const issued = mock.ctx.homework.issue({
      studentId: USER.ilya,
      issuedBy: anna,
      topicId: TOPIC.linear,
      homeworkNumberIds: [numberId("130"), numberId("124")],
      deadlineAt,
      title: "  Работа над ошибками  ",
    });
    assert.ok(issued.ok);
    mock.clock.advance(MINUTE_MS);
    const added = await item(issued.assignmentId);
    assert.deepEqual(added, {
      id: issued.assignmentId,
      title: "Работа над ошибками",
      orderInTopic: 4,
      topicTitle: "Линейные уравнения",
      deadlineAt,
      totalNumbers: 2,
      solvedCount: 0,
    });
    const list = await mock.api.studentStudy.getHomeworkDeadlines();
    assert.equal(list.items[list.items.length - 1]?.id, issued.assignmentId);

    mock.ctx.progress.write({ source: "teacher", status: "YELLOW", studentId: USER.ilya, homeworkNumberId: numberId("130"), actor: anna });
    assert.equal((await item(issued.assignmentId))?.solvedCount, 1);
    assert.equal((await item("hw_ilya_soon"))?.solvedCount, 3);

    // A cancelled homework disappears; the later ones of the topic move up.
    mock.ctx.cascade.deleteHomework("hw_ilya_overdue");
    const after = await mock.api.studentStudy.getHomeworkDeadlines();
    assert.equal(after.items.some((entry) => entry.id === "hw_ilya_overdue"), false);
    assert.deepEqual(
      after.items.filter((entry) => entry.topicTitle === "Линейные уравнения").map((entry) => [entry.id, entry.orderInTopic]),
      [["hw_ilya_done", 1], ["hw_ilya_soon", 2], [issued.assignmentId, 3]],
    );
  });

  it("sends a blank title as null and a padded one trimmed", async () => {
    const mock = await signedIn(ILYA);
    mock.store.homeworks.update("hw_ilya_overdue", { title: "   " });
    mock.store.homeworks.update("hw_ilya_soon", { title: "  Перед зачётом " });
    const byId = new Map((await mock.api.studentStudy.getHomeworkDeadlines()).items.map((item) => [item.id, item.title]));
    assert.equal(byId.get("hw_ilya_overdue"), null);
    assert.equal(byId.get("hw_ilya_soon"), "Перед зачётом");
  });

  it("is refused without a session and for staff", async () => {
    await assertStudentOnly((mock) => mock.api.studentStudy.getHomeworkDeadlines());
  });
});

// ───────────────────────────── getTheoryLibrary ─────────────────────────────

describe("studentStudy.getTheoryLibrary", () => {
  it("lists only the topics with a theory file, in display order, as file references", async () => {
    const seeded = createTestMock();
    assert.equal(coverage("files.kinds").check?.(seeded.store, T0), true);

    const mock = await signedIn(ILYA);
    const { topics } = await mock.api.studentStudy.getTheoryLibrary();

    assert.deepEqual(
      topics.map((topic) => [topic.id, topic.title, topic.theoryFile.id, topic.theoryFile.mimeType]),
      [
        [TOPIC.linear, "Линейные уравнения", "file_linear_theory", "application/pdf"],
        [TOPIC.quadratic, "Квадратные функции", "file_quadratic_theory", "application/pdf"],
        [TOPIC.derivative, "Производная и исследование функций", "file_derivative_theory", "image/png"],
        [TOPIC.log, "Логарифмические уравнения", "file_log_theory", "application/pdf"],
        [TOPIC.word, "Текстовые задачи", "file_word_theory", "image/jpeg"],
      ],
    );
    // «Системы уравнений» and the empty topic have no theory file.
    assert.equal(topics.some((topic) => topic.id === TOPIC.systems || topic.id === TOPIC.empty), false);

    assert.deepEqual(topics[0], {
      id: TOPIC.linear,
      title: "Линейные уравнения",
      description: "Базовые свойства линейных уравнений, перенос слагаемых и проверка решения.",
      theoryFile: {
        id: "file_linear_theory",
        originalName: "linear-equations-theory.pdf",
        mimeType: "application/pdf",
        size: 49152,
        uploadedAt: "2026-06-19T06:00:00.000Z",
      },
    });

    for (const topic of topics) {
      assert.deepEqual(Object.keys(topic).sort(), ["description", "id", "theoryFile", "title"]);
      // `StoredFileRef`: metadata by id — no URL, no storage fields, no uploader.
      assert.deepEqual(Object.keys(topic.theoryFile).sort(), ["id", "mimeType", "originalName", "size", "uploadedAt"]);
      assert.equal(new Date(topic.theoryFile.uploadedAt).toISOString(), topic.theoryFile.uploadedAt);
      // The bytes are readable by this student through the file service.
      assert.equal(mock.ctx.files.lookup(topic.theoryFile.id)?.mimeType, topic.theoryFile.mimeType);
    }

    // The homework and answers files of a topic are not part of the library.
    const json = JSON.stringify(topics);
    for (const topic of mock.store.topics.all()) {
      for (const fileId of [topic.homeworkFileId, topic.answersFileId]) {
        if (fileId) assert.equal(json.includes(fileId), false, fileId);
      }
    }
    assert.equal(/https?:|file:|mock-sample:|localUri|"sample"/.test(json), false);
  });

  it("is one shared list: every student gets the same topics", async () => {
    const ilya = await signedIn(ILYA);
    const sofia = await signedIn(SOFIA);
    const timur = await signedIn(TIMUR);
    const expected = await ilya.api.studentStudy.getTheoryLibrary();
    assert.deepEqual(await sofia.api.studentStudy.getTheoryLibrary(), expected);
    assert.deepEqual(await timur.api.studentStudy.getTheoryLibrary(), expected);
  });

  it("follows content changes: order, a removed file, a new file", async () => {
    const mock = await signedIn(ILYA);
    const ids = async () => (await mock.api.studentStudy.getTheoryLibrary()).topics.map((topic) => topic.id);

    // `displayOrder` asc, then `createdAt` asc.
    mock.store.topics.update(TOPIC.word, { displayOrder: 0 });
    assert.deepEqual(await ids(), [TOPIC.word, TOPIC.linear, TOPIC.quadratic, TOPIC.derivative, TOPIC.log]);
    const linearCreatedAt = mock.store.topics.get(TOPIC.linear)?.createdAt ?? "";
    mock.store.topics.update(TOPIC.log, { displayOrder: 1, createdAt: new Date(Date.parse(linearCreatedAt) - DAY_MS).toISOString() });
    assert.deepEqual(await ids(), [TOPIC.word, TOPIC.log, TOPIC.linear, TOPIC.quadratic, TOPIC.derivative]);

    // A topic that lost its theory file leaves the library; one that got a file enters it.
    mock.store.topics.update(TOPIC.quadratic, { theoryFileId: null });
    mock.store.topics.update(TOPIC.systems, { theoryFileId: "file_quadratic_theory" });
    assert.deepEqual(await ids(), [TOPIC.word, TOPIC.log, TOPIC.linear, TOPIC.derivative, TOPIC.systems]);

    // A dangling file id is "no file".
    mock.store.topics.update(TOPIC.derivative, { theoryFileId: "file_missing" });
    assert.deepEqual(await ids(), [TOPIC.word, TOPIC.log, TOPIC.linear, TOPIC.systems]);
  });

  it("is refused without a session and for staff", async () => {
    await assertStudentOnly((mock) => mock.api.studentStudy.getTheoryLibrary());
  });
});

// ───────────────────────────── getNumberDetail ─────────────────────────────

describe("studentStudy.getNumberDetail", () => {
  it("returns the topic, the statement and the student's own state", async () => {
    const seeded = createTestMock();
    assert.equal(coverage("status.note").check?.(seeded.store, T0), true);

    const mock = await signedIn(ILYA);
    assert.deepEqual(await mock.api.studentStudy.getNumberDetail("113"), {
      topic: {
        id: TOPIC.linear,
        title: "Линейные уравнения",
        description: "Базовые свойства линейных уравнений, перенос слагаемых и проверка решения.",
      },
      number: {
        id: numberId("113"),
        number: "113",
        conditionLatex: "Решите уравнение:\nа) $2x + 5 = 17$ б) $4 - 3x = 10$ в) $\\dfrac{x}{2} - 1 = 3$",
        status: "YELLOW",
        note: "Перепутал знак при раскрытии скобок",
        // Mirrored deadline of the homework that contains the number.
        deadlineAt: mock.store.homeworks.get("hw_ilya_done")?.deadlineAt,
        // `updatedAt` of the row (the note was written after the colour).
        statusUpdatedAt: statusRow(mock, USER.ilya, "113")?.updatedAt,
      },
      notesEnabled: true,
    });
  });

  it("never contains the answer or any teacher-only field", async () => {
    const mock = await signedIn(ILYA);
    for (const label of ["112", "113", "010209", "301", "501"]) {
      const stored = mock.store.numbers.get(numberId(label));
      assert.ok(stored?.answerLatex, label);
      const detail = await mock.api.studentStudy.getNumberDetail(label);
      assert.deepEqual(Object.keys(detail).sort(), ["notesEnabled", "number", "topic"]);
      assert.deepEqual(Object.keys(detail.topic).sort(), ["description", "id", "title"]);
      assert.deepEqual(Object.keys(detail.number).sort(), ["conditionLatex", "deadlineAt", "id", "note", "number", "status", "statusUpdatedAt"]);
      assert.equal(JSON.stringify(detail).includes(JSON.stringify(stored.answerLatex).slice(1, -1)), false, label);
    }
  });

  it("resolves the recorded and the normalised spelling to the same number and answers with the recorded one", async () => {
    const mock = await signedIn(ILYA);
    const recorded = await mock.api.studentStudy.getNumberDetail("010207");
    assert.equal(recorded.number.id, numberId("010207"));
    assert.equal(recorded.number.number, "010207");
    assert.equal(recorded.topic.id, TOPIC.log);
    assert.equal(recorded.number.status, "GREEN");

    for (const spelling of ["10207", "0010207", "  010207 ", "\t10207\n"]) {
      assert.deepEqual(await mock.api.studentStudy.getNumberDetail(spelling), recorded, JSON.stringify(spelling));
    }
    // Leading zeros of a short number are insignificant too.
    assert.equal((await mock.api.studentStudy.getNumberDetail("000113")).number.number, "113");
  });

  it("shows the edge states: no row, a note without a colour, a manual clear, no statement, broken LaTeX", async () => {
    const seeded = createTestMock();
    assert.equal(coverage("numbers.edgeCases").check?.(seeded.store, T0), true);
    assert.equal(coverage("status.nullWithNote.todayEmptyYesterdayActive").check?.(seeded.store, T0), true);

    const mock = await signedIn(ILYA);

    // Never touched: no row at all.
    assert.equal(statusRow(mock, USER.ilya, "308"), undefined);
    const untouched = await mock.api.studentStudy.getNumberDetail("308");
    assert.deepEqual(
      [untouched.number.status, untouched.number.note, untouched.number.deadlineAt, untouched.number.statusUpdatedAt],
      [null, "", null, null],
    );
    assert.equal(statusRow(mock, USER.ilya, "308"), undefined, "a read creates no row");

    // A note on a number without a colour.
    const noted = await mock.api.studentStudy.getNumberDetail("120");
    assert.deepEqual([noted.number.status, noted.number.note], [null, "Спросить на занятии про проверку корня."]);
    assert.equal(noted.number.deadlineAt, mock.store.homeworks.get("hw_ilya_overdue")?.deadlineAt);

    // Cleared by the teacher: no colour, no statement, but the row (and its time) exists.
    const cleared = await mock.api.studentStudy.getNumberDetail("124");
    assert.deepEqual([cleared.number.status, cleared.number.note, cleared.number.conditionLatex], [null, "", null]);
    assert.equal(cleared.number.statusUpdatedAt, statusRow(mock, USER.ilya, "124")?.updatedAt);

    // Each colour.
    assert.equal((await mock.api.studentStudy.getNumberDetail("112")).number.status, "GREEN");
    assert.equal((await mock.api.studentStudy.getNumberDetail("118")).number.status, "RED");

    // The statement is delivered verbatim, broken formula included.
    assert.equal((await mock.api.studentStudy.getNumberDetail("220")).number.conditionLatex, "Найдите значение выражения $\\frac{1}{x$ при $x = 2$.");
    assert.equal((await mock.api.studentStudy.getNumberDetail("218")).number.conditionLatex, "Постройте график функции и найдите её нули:\n\n\\[ y = 2x^2 - 8x + 6 \\]");
  });

  it("is per student, and is not limited to assigned homework", async () => {
    const ilya = await signedIn(ILYA);
    const maria = await signedIn(MARIA);
    const sofia = await signedIn(SOFIA);

    const his = await ilya.api.studentStudy.getNumberDetail("118");
    const hers = await maria.api.studentStudy.getNumberDetail("118");
    assert.deepEqual([his.number.status, hers.number.status], ["RED", "GREEN"]);
    assert.deepEqual([his.number.id, his.topic, his.number.conditionLatex], [hers.number.id, hers.topic, hers.number.conditionLatex]);

    // Ilya's note stays his.
    assert.equal((await maria.api.studentStudy.getNumberDetail("113")).number.note, "");

    // Another teacher's student opens a number that was never assigned to her.
    const foreign = await sofia.api.studentStudy.getNumberDetail("113");
    assert.deepEqual([foreign.number.status, foreign.number.note, foreign.number.deadlineAt, foreign.number.statusUpdatedAt], [null, "", null, null]);
  });

  it("picks the first topic in display order when several topics carry the number", async () => {
    const mock = await signedIn(ILYA);
    mock.store.numbers.insert({
      id: "num_twin_112",
      topicId: TOPIC.word,
      number: "0112",
      displayOrder: 99,
      conditionLatex: "Двойник номера 112.",
      answerLatex: null,
      answerFileId: null,
      estimatedMinutes: null,
      usableInDiagnostic: true,
    });

    // «Линейные уравнения» (order 1) is before «Текстовые задачи» (order 7), whatever spelling is asked.
    for (const spelling of ["112", "0112"]) {
      const detail = await mock.api.studentStudy.getNumberDetail(spelling);
      assert.deepEqual([detail.topic.id, detail.number.id, detail.number.number], [TOPIC.linear, numberId("112"), "112"]);
    }

    mock.store.topics.update(TOPIC.word, { displayOrder: 0 });
    const twin = await mock.api.studentStudy.getNumberDetail("112");
    assert.deepEqual([twin.topic.id, twin.number.id, twin.number.number, twin.number.status], [TOPIC.word, "num_twin_112", "0112", null]);
  });

  it("rejects anything that is not digits with 400 invalidNumber", async () => {
    const mock = await signedIn(ILYA);
    const call = mock.api.studentStudy.getNumberDetail as unknown as (number: unknown) => Promise<unknown>;

    for (const value of ["", "   ", "abc", "12a", "-5", "1.5", "1 2", "١٢٣", "113/", undefined, null, 113, ["113"]]) {
      const error = await rejects(call(value), "invalidNumber", 400);
      assert.equal(error.message, RU.invalidNumber, JSON.stringify(value));
    }

    mock.setLocale("en");
    assert.equal((await rejects(call("x"), "invalidNumber", 400)).message, EN.invalidNumber);
  });

  it("answers 404 numberNotFound for digits that match no number", async () => {
    const mock = await signedIn(ILYA);

    // "0" is never a number; a long run of digits is simply not found (no length cap on this route).
    for (const value of ["999999", "0", "000", "1130", "11", "9".repeat(LIMITS.numberSearchMaxDigits), "9".repeat(LIMITS.numberSearchMaxDigits + 1)]) {
      const error = await rejects(mock.api.studentStudy.getNumberDetail(value), "numberNotFound", 404);
      assert.equal(error.message, RU.numberNotFound, value);
    }

    mock.setLocale("en");
    assert.equal((await rejects(mock.api.studentStudy.getNumberDetail("999999"), "numberNotFound", 404)).message, EN.numberNotFound);

    // A deleted number is gone for the student as well.
    mock.ctx.cascade.deleteNumber(numberId("113"));
    await rejects(mock.api.studentStudy.getNumberDetail("113"), "numberNotFound", 404);
  });

  it("reflects a colour set by the teacher and a newly mirrored deadline", async () => {
    const mock = await signedIn(ILYA);
    const anna = mock.ctx.q.user(USER.anna);
    assert.ok(anna);

    mock.clock.advance(5 * MINUTE_MS);
    mock.ctx.progress.write({ source: "teacher", status: "GREEN", studentId: USER.ilya, homeworkNumberId: numberId("308"), actor: anna });
    let detail = await mock.api.studentStudy.getNumberDetail("308");
    assert.deepEqual([detail.number.status, detail.number.statusUpdatedAt, detail.number.deadlineAt], ["GREEN", new Date(T0 + 5 * MINUTE_MS).toISOString(), null]);

    const deadlineAt = new Date(T0 + 2 * DAY_MS).toISOString();
    const issued = mock.ctx.homework.issue({ studentId: USER.ilya, issuedBy: anna, topicId: TOPIC.derivative, homeworkNumberIds: [numberId("310")], deadlineAt, title: null });
    assert.ok(issued.ok);
    detail = await mock.api.studentStudy.getNumberDetail("310");
    assert.deepEqual([detail.number.status, detail.number.deadlineAt], [null, deadlineAt]);
  });

  it("is refused without a session and for staff", async () => {
    await assertStudentOnly((mock) => mock.api.studentStudy.getNumberDetail("113"));
  });
});

// ───────────────────────────── saveNumberNote ─────────────────────────────

describe("studentStudy.saveNumberNote", () => {
  it("saves the note of a coloured number and touches nothing but the note", async () => {
    const mock = await signedIn(ILYA);
    const before = statusRow(mock, USER.ilya, "113");
    assert.ok(before);
    const counts = sideEffectCounts(mock);
    const streak = await mock.api.shell.getStreak();

    mock.clock.advance(MINUTE_MS);
    const result = await mock.api.studentStudy.saveNumberNote(numberId("113"), "Проверить знак во втором пункте");

    // The typed result is the wire body without `ok`; the colour comes back unchanged.
    assert.deepEqual(result, { status: "YELLOW", note: "Проверить знак во втором пункте", notesEnabled: true });
    assert.deepEqual(statusRow(mock, USER.ilya, "113"), {
      ...before,
      note: "Проверить знак во втором пункте",
      updatedAt: new Date(T0 + MINUTE_MS).toISOString(),
    });

    // No journal row, no history event, no notification, no new row; the streak is the same.
    assert.deepEqual(sideEffectCounts(mock), counts);
    assert.deepEqual(await mock.api.shell.getStreak(), streak);

    const detail = await mock.api.studentStudy.getNumberDetail("113");
    assert.deepEqual([detail.number.note, detail.number.status, detail.number.statusUpdatedAt], ["Проверить знак во втором пункте", "YELLOW", new Date(T0 + MINUTE_MS).toISOString()]);
  });

  it("creates a row without a colour for a number the student never touched, and removes it when the note is cleared", async () => {
    const mock = await signedIn(ILYA);
    const rows = mock.store.statuses.size;
    assert.equal(statusRow(mock, USER.ilya, "308"), undefined);

    assert.deepEqual(await mock.api.studentStudy.saveNumberNote(numberId("308"), "Спросить про \\text{А)}"), {
      status: null,
      note: "Спросить про \\text{А)}",
      notesEnabled: true,
    });
    const created = statusRow(mock, USER.ilya, "308");
    assert.ok(created);
    assert.deepEqual(
      [created.status, created.note, created.deadlineAt, created.statusChangedAt, created.createdAt, created.updatedAt],
      [null, "Спросить про \\text{А)}", null, null, TEST_T0, TEST_T0],
    );
    assert.equal(mock.store.statuses.size, rows + 1);
    // A note is not progress: the history and the timeline do not see it.
    assert.equal(mock.store.progressEvents.by("studentNumber", `${USER.ilya}|${numberId("308")}`).length, 0);

    // Overwriting keeps the same row.
    await mock.api.studentStudy.saveNumberNote(numberId("308"), "Вторая версия");
    assert.equal(statusRow(mock, USER.ilya, "308")?.id, created.id);
    assert.equal(mock.store.statuses.size, rows + 1);

    // Cleared and nothing else on the row → the row goes.
    assert.deepEqual(await mock.api.studentStudy.saveNumberNote(numberId("308"), ""), { status: null, note: "", notesEnabled: true });
    assert.equal(statusRow(mock, USER.ilya, "308"), undefined);
    assert.equal(mock.store.statuses.size, rows);
    assert.equal((await mock.api.studentStudy.getNumberDetail("308")).number.statusUpdatedAt, null);

    // Clearing what does not exist is fine and creates nothing.
    assert.deepEqual(await mock.api.studentStudy.saveNumberNote(numberId("310"), "   "), { status: null, note: "", notesEnabled: true });
    assert.equal(statusRow(mock, USER.ilya, "310"), undefined);
    assert.equal(mock.store.statuses.size, rows);
  });

  it("keeps a cleared row that still carries a colour, a deadline or a status time", async () => {
    const mock = await signedIn(ILYA);

    // 113: YELLOW with a note → the colour keeps the row.
    assert.deepEqual(await mock.api.studentStudy.saveNumberNote(numberId("113"), ""), { status: "YELLOW", note: "", notesEnabled: true });
    assert.deepEqual([statusRow(mock, USER.ilya, "113")?.status, statusRow(mock, USER.ilya, "113")?.note], ["YELLOW", null]);

    // 120: no colour, never marked, but the mirrored homework deadline keeps the row.
    const deadline = statusRow(mock, USER.ilya, "120")?.deadlineAt;
    assert.ok(deadline);
    assert.deepEqual(await mock.api.studentStudy.saveNumberNote(numberId("120"), " \n "), { status: null, note: "", notesEnabled: true });
    const kept = statusRow(mock, USER.ilya, "120");
    assert.deepEqual([kept?.status, kept?.note, kept?.deadlineAt, kept?.statusChangedAt], [null, null, deadline, null]);

    // A fresh manual clear by the teacher (no colour, no deadline, `statusChangedAt` set) survives too.
    const manual = mock.ctx.progress.ensureRow(USER.ilya, numberId("312"));
    mock.store.statuses.update(manual.id, { statusChangedAt: new Date(T0 - DAY_MS).toISOString() });
    await mock.api.studentStudy.saveNumberNote(numberId("312"), "временная заметка");
    await mock.api.studentStudy.saveNumberNote(numberId("312"), "");
    const survivor = statusRow(mock, USER.ilya, "312");
    assert.deepEqual([survivor?.id, survivor?.status, survivor?.note, survivor?.statusChangedAt], [manual.id, null, null, new Date(T0 - DAY_MS).toISOString()]);
    assert.equal(coverage("status.manualClearSurvives").check?.(mock.store, T0), true);
  });

  it("trims the note and cuts it to 240 characters", async () => {
    const mock = await signedIn(ILYA);
    const max = LIMITS.noteMaxLength;
    assert.equal(max, 240);
    const id = numberId("308");

    const exact = "я".repeat(max);
    assert.equal((await mock.api.studentStudy.saveNumberNote(id, exact)).note, exact);
    assert.equal(statusRow(mock, USER.ilya, "308")?.note, exact);

    // One over the limit: the tail is dropped.
    const over = `${"a".repeat(max)}b`;
    assert.equal((await mock.api.studentStudy.saveNumberNote(id, over)).note, "a".repeat(max));

    // Trimmed FIRST, then cut: the surrounding blanks do not eat into the limit.
    const padded = `  \n${"c".repeat(max - 1)}d   `;
    assert.equal((await mock.api.studentStudy.saveNumberNote(id, padded)).note, `${"c".repeat(max - 1)}d`);

    // Inner line breaks are kept (plain multi-line text).
    assert.equal((await mock.api.studentStudy.saveNumberNote(id, " строка 1\nстрока 2\n\nстрока 3 ")).note, "строка 1\nстрока 2\n\nстрока 3");
    assert.equal((await mock.api.studentStudy.saveNumberNote(id, "x")).note, "x");
  });

  it("reads the body like the server: null clears, a missing note or number id is 400 invalidData", async () => {
    const mock = await signedIn(ILYA);
    const counts = sideEffectCounts(mock);

    // `{ note: null }` is "clear".
    assert.deepEqual(await saveRaw(mock, numberId("113"), null), { status: "YELLOW", note: "", notesEnabled: true });
    assert.equal(statusRow(mock, USER.ilya, "113")?.note, null);
    // Any other scalar is stringified.
    assert.deepEqual(await saveRaw(mock, numberId("113"), 42), { status: "YELLOW", note: "42", notesEnabled: true });
    // The whole wire body handed over as an object is read as the body.
    assert.deepEqual(await saveRaw(mock, numberId("113"), { note: "  из тела запроса " }), { status: "YELLOW", note: "из тела запроса", notesEnabled: true });
    // The id is trimmed like on the site.
    assert.deepEqual(await saveRaw(mock, `  ${numberId("113")} `, "с пробелами"), { status: "YELLOW", note: "с пробелами", notesEnabled: true });
    assert.deepEqual(sideEffectCounts(mock), counts);

    for (const [id, note] of [
      [numberId("113"), undefined],
      [numberId("113"), {}],
      ["", "заметка"],
      ["   ", "заметка"],
      [undefined, "заметка"],
      [null, "заметка"],
      [17, "заметка"],
    ] as const) {
      const error = await rejects(saveRaw(mock, id, note), "invalidData", 400);
      assert.equal(error.message, RU.noteInvalidData);
    }
    assert.equal(statusRow(mock, USER.ilya, "113")?.note, "с пробелами");

    mock.setLocale("en");
    assert.equal((await rejects(saveRaw(mock, numberId("113"), undefined), "invalidData", 400)).message, EN.noteInvalidData);
  });

  it("refuses a body with a `status` key with 403 statusReadOnly and writes nothing", async () => {
    const mock = await signedIn(ILYA);
    const before = statusRow(mock, USER.ilya, "118");
    const counts = sideEffectCounts(mock);
    const events: RealtimeEvent[] = [];
    const unsubscribe = mock.api.shell.subscribeRealtime((event) => events.push(event));
    await settle();

    // Any value of the key, even null, even together with a valid note; checked before everything else in the body.
    for (const body of [{ note: "x", status: "GREEN" }, { note: "x", status: null }, { status: "RED" }, { note: "x", status: undefined }]) {
      const error = await rejects(saveRaw(mock, numberId("118"), body), "statusReadOnly", 403);
      assert.equal(error.message, RU.statusReadOnly);
    }
    await rejects(saveRaw(mock, "num_missing", { note: "x", status: "GREEN" }), "statusReadOnly", 403);
    await rejects(saveRaw(mock, "", { status: "GREEN" }), "statusReadOnly", 403);

    mock.setLocale("en");
    assert.equal((await rejects(saveRaw(mock, numberId("118"), { note: "x", status: "GREEN" }), "statusReadOnly", 403)).message, EN.statusReadOnly);

    await settle();
    assert.deepEqual(statusRow(mock, USER.ilya, "118"), before);
    assert.equal(before?.status, "RED");
    assert.deepEqual(sideEffectCounts(mock), counts);
    assert.deepEqual(events, []);
    unsubscribe();
  });

  it("answers 404 numberNotFound for an unknown number", async () => {
    const mock = await signedIn(ILYA);
    const counts = sideEffectCounts(mock);
    const events: RealtimeEvent[] = [];
    const unsubscribe = mock.api.shell.subscribeRealtime((event) => events.push(event));
    await settle();

    // A label is not an id; a status-row id is not a number id.
    for (const id of ["num_missing", "113", statusRow(mock, USER.ilya, "113")?.id ?? "", TOPIC.linear]) {
      const error = await rejects(mock.api.studentStudy.saveNumberNote(id, "заметка"), "numberNotFound", 404);
      assert.equal(error.message, RU.noteNumberNotFound, id);
    }
    mock.setLocale("en");
    assert.equal((await rejects(mock.api.studentStudy.saveNumberNote("num_missing", ""), "numberNotFound", 404)).message, EN.noteNumberNotFound);

    // A number deleted by the developer takes the note with it.
    mock.ctx.cascade.deleteNumber(numberId("113"));
    await rejects(mock.api.studentStudy.saveNumberNote(numberId("113"), "заметка"), "numberNotFound", 404);

    await settle();
    assert.deepEqual(events, []);
    assert.deepEqual(sideEffectCounts(mock), { ...counts, statuses: mock.store.statuses.size });
    unsubscribe();
  });

  it("publishes student-progress-changed with the topic after every accepted save", async () => {
    const mock = await signedIn(ILYA);
    const events: RealtimeEvent[] = [];
    const unsubscribe = mock.api.shell.subscribeRealtime((event) => events.push(event));
    await settle();

    await mock.api.studentStudy.saveNumberNote(numberId("010207"), "логарифмы");
    await settle();
    assert.deepEqual(events, [{ kind: "student-progress-changed", occurredAt: TEST_T0, studentId: USER.ilya, topicId: TOPIC.log }]);

    // Also when the note is cleared, and when there was nothing to clear (the site publishes unconditionally).
    mock.clock.advance(1000);
    await mock.api.studentStudy.saveNumberNote(numberId("010207"), "");
    await mock.api.studentStudy.saveNumberNote(numberId("310"), "");
    await settle();
    assert.deepEqual(
      events.slice(1).map((event) => [event.kind, "studentId" in event ? event.studentId : null, "topicId" in event ? event.topicId : null, event.occurredAt]),
      [
        ["student-progress-changed", USER.ilya, TOPIC.log, new Date(T0 + 1000).toISOString()],
        ["student-progress-changed", USER.ilya, TOPIC.derivative, new Date(T0 + 1000).toISOString()],
      ],
    );
    unsubscribe();
  });

  it("is limited to 90 saves per minute per student, refused attempts included", async () => {
    const rule = RATE_LIMITS["api:student-status"];
    assert.deepEqual([rule.limit, rule.windowSeconds, rule.window], [90, 60, "fixed"]);

    const mock = await signedIn(ILYA);
    mock.clock.advance(15_000);
    const id = numberId("113");

    for (let index = 0; index < rule.limit - 2; index += 1) await mock.api.studentStudy.saveNumberNote(id, `заметка ${index}`);
    // Invalid and unknown requests burn a slot as well: the limiter runs before the body is read.
    await rejects(saveRaw(mock, id, undefined), "invalidData", 400);
    await rejects(mock.api.studentStudy.saveNumberNote("num_missing", "x"), "numberNotFound", 404);

    // The 91st request of the window.
    const refused = await rejects(mock.api.studentStudy.saveNumberNote(id, "лишняя"), "rateLimited", 429);
    assert.equal(refused.message, RU.rateLimited);
    // The window is aligned to the minute: 45 seconds are left.
    assert.equal(refused.retryAfterSeconds, 45);
    assert.equal(statusRow(mock, USER.ilya, "113")?.note, `заметка ${rule.limit - 3}`);
    // The limit is checked before the body: even a forbidden body gets the 429.
    await rejects(saveRaw(mock, id, { status: "GREEN" }), "rateLimited", 429);

    mock.clock.advance(44_000);
    assert.equal((await rejects(mock.api.studentStudy.saveNumberNote(id, "лишняя"), "rateLimited", 429)).retryAfterSeconds, 1);
    mock.setLocale("en");
    assert.equal((await rejects(mock.api.studentStudy.saveNumberNote(id, "extra"), "rateLimited", 429)).message, EN.rateLimited);
    mock.setLocale("ru");

    // The reads of the member are not limited on the site.
    await mock.api.studentStudy.getNumberDetail("113");
    await mock.api.studentStudy.getHomeworkDeadlines();
    await mock.api.studentStudy.getTheoryLibrary();

    // A new window starts at the next minute.
    mock.clock.advance(1000);
    assert.equal((await mock.api.studentStudy.saveNumberNote(id, "новое окно")).note, "новое окно");

    // The bucket is per user.
    const other = createTestMock();
    await other.signIn(ILYA);
    other.api.controls.exhaust("api:student-status", USER.ilya);
    const pinned = await rejects(other.api.studentStudy.saveNumberNote(id, "x"), "rateLimited", 429);
    assert.equal(pinned.retryAfterSeconds, 60);
    await other.signIn(MARIA);
    assert.equal((await other.api.studentStudy.saveNumberNote(id, "заметка Марии")).note, "заметка Марии");
  });

  it("drops a cancelled request without consuming a slot or writing", async () => {
    const mock = await signedIn(ILYA);
    const before = statusRow(mock, USER.ilya, "113");
    const events: RealtimeEvent[] = [];
    const unsubscribe = mock.api.shell.subscribeRealtime((event) => events.push(event));
    await settle();

    // Aborted before the call.
    const early = new AbortController();
    early.abort();
    const first = await rejects(mock.api.studentStudy.saveNumberNote(numberId("113"), "черновик", early.signal), "network", 0);
    assert.equal(first.message, mock.ctx.m().common.errors.network);

    // Superseded while the request was on its way.
    const late = new AbortController();
    const pending = mock.api.studentStudy.saveNumberNote(numberId("113"), "черновик 2", late.signal);
    late.abort();
    await rejects(pending, "network", 0);

    await settle();
    assert.deepEqual(statusRow(mock, USER.ilya, "113"), before);
    assert.deepEqual(events, []);
    assert.equal(mock.api.controls.listLimiters().some((bucket) => bucket.scope === "api:student-status"), false);

    // A live signal changes nothing.
    const live = new AbortController();
    assert.equal((await mock.api.studentStudy.saveNumberNote(numberId("113"), "итог", live.signal)).note, "итог");
    unsubscribe();
  });

  it("is per student and survives a later mark of the teacher", async () => {
    const mock = createTestMock();
    await mock.signIn(MARIA);
    assert.deepEqual(await mock.api.studentStudy.saveNumberNote(numberId("113"), "заметка Марии"), { status: "YELLOW", note: "заметка Марии", notesEnabled: true });
    assert.equal(statusRow(mock, USER.ilya, "113")?.note, "Перепутал знак при раскрытии скобок");

    await mock.signIn(ILYA);
    assert.equal((await mock.api.studentStudy.getNumberDetail("113")).number.note, "Перепутал знак при раскрытии скобок");
    await mock.api.studentStudy.saveNumberNote(numberId("113"), "");
    assert.equal(statusRow(mock, USER.maria, "113")?.note, "заметка Марии");

    // The colour is the teacher's: a mark after the note keeps the note, clearing the note keeps the mark.
    const anna = mock.ctx.q.user(USER.anna);
    assert.ok(anna);
    await mock.api.studentStudy.saveNumberNote(numberId("308"), "разобрать на уроке");
    mock.clock.advance(MINUTE_MS);
    mock.ctx.progress.write({ source: "teacher", status: "RED", studentId: USER.ilya, homeworkNumberId: numberId("308"), actor: anna });
    assert.deepEqual([statusRow(mock, USER.ilya, "308")?.status, statusRow(mock, USER.ilya, "308")?.note], ["RED", "разобрать на уроке"]);
    assert.deepEqual(await mock.api.studentStudy.saveNumberNote(numberId("308"), ""), { status: "RED", note: "", notesEnabled: true });
    const row = statusRow(mock, USER.ilya, "308");
    assert.deepEqual([row?.status, row?.note, row?.statusChangedAt], ["RED", null, new Date(T0 + MINUTE_MS).toISOString()]);
  });

  it("dates a legacy coloured row without `statusChangedAt` by the row's update time, as the site does", async () => {
    const mock = await signedIn(SOFIA);
    // An old row: a colour, no `statusChangedAt`, last updated ten days ago.
    const legacy = mock.ctx.progress.ensureRow(USER.sofia, numberId("112"));
    const old = new Date(T0 - 10 * DAY_MS).toISOString();
    mock.store.statuses.update(legacy.id, { status: "GREEN", createdAt: old, updatedAt: old });
    assert.equal((await mock.api.shell.getStreak()).streak.solvedToday, 0);

    // Writing the note moves `updatedAt`, which is what the timeline falls back to for such a row.
    await mock.api.studentStudy.saveNumberNote(numberId("112"), "старая строка");
    assert.deepEqual([statusRow(mock, USER.sofia, "112")?.statusChangedAt, statusRow(mock, USER.sofia, "112")?.updatedAt], [null, TEST_T0]);
    assert.equal((await mock.api.shell.getStreak()).streak.solvedToday, 1);
  });

  it("is persisted with the store", async () => {
    const mock = await signedIn(ILYA);
    await mock.api.studentStudy.saveNumberNote(numberId("308"), "переживёт перезапуск");
    await mock.api.flush();

    const restarted = createTestMock({ storage: mock.storage, clock: mock.clock });
    await restarted.signIn(ILYA);
    assert.equal((await restarted.api.studentStudy.getNumberDetail("308")).number.note, "переживёт перезапуск");
  });

  it("is refused without a session and for staff", async () => {
    await assertStudentOnly((mock) => mock.api.studentStudy.saveNumberNote(numberId("113"), "чужая заметка"));
    // The refusal consumed no limiter slot of the note bucket.
    const mock = await signedIn(TEACHER);
    await rejects(mock.api.studentStudy.saveNumberNote(numberId("113"), "x"), "unauthorized", 403);
    assert.equal(mock.api.controls.listLimiters().some((bucket) => bucket.scope === "api:student-status"), false);
  });
});

// ───────────────────────────── demo controls ─────────────────────────────

describe("studentStudy: forced errors and connectivity", () => {
  it("fails the next call with the forced error and leaves the store alone", async () => {
    assert.equal(coverage("anyCall.forcedError").control, "forceNextError");
    const mock = await signedIn(ILYA);
    const before = statusRow(mock, USER.ilya, "113");

    mock.api.controls.set("forceNextError", { method: "studentStudy.getHomeworkDeadlines", error: "serviceUnavailable", times: 1 });
    // Another method is not affected.
    await mock.api.studentStudy.getTheoryLibrary();
    const unavailable = await rejects(mock.api.studentStudy.getHomeworkDeadlines(), "serviceUnavailable", 503);
    assert.deepEqual([unavailable.retryAfterSeconds, unavailable.message], [5, RU.serviceUnavailable]);
    assert.equal((await mock.api.studentStudy.getHomeworkDeadlines()).items.length, 9);

    mock.api.controls.set("forceNextError", { method: "studentStudy.getNumberDetail", error: "notFound", times: 1 });
    await rejects(mock.api.studentStudy.getNumberDetail("113"), "numberNotFound", 404);
    assert.equal((await mock.api.studentStudy.getNumberDetail("113")).number.number, "113");

    mock.api.controls.set("forceNextError", { method: "studentStudy.getTheoryLibrary", error: "sessionExpired", times: 1 });
    await rejects(mock.api.studentStudy.getTheoryLibrary(), "sessionExpired", 401);

    mock.api.controls.set("forceNextError", { method: "studentStudy.saveNumberNote", error: "rateLimited", times: 2 });
    const limited = await rejects(mock.api.studentStudy.saveNumberNote(numberId("113"), "x"), "rateLimited", 429);
    assert.ok((limited.retryAfterSeconds ?? 0) > 0);
    await rejects(mock.api.studentStudy.saveNumberNote(numberId("113"), "x"), "rateLimited", 429);
    assert.deepEqual(statusRow(mock, USER.ilya, "113"), before);

    mock.api.controls.set("forceNextError", { method: "*", error: "network", times: 1 });
    await rejects(mock.api.studentStudy.saveNumberNote(numberId("113"), "x"), "network", 0);
    assert.deepEqual(statusRow(mock, USER.ilya, "113"), before);
    assert.equal((await mock.api.studentStudy.saveNumberNote(numberId("113"), "после сбоя")).note, "после сбоя");
  });

  it("rejects every method with the network error while offline", async () => {
    const mock = await signedIn(ILYA);
    const before = statusRow(mock, USER.ilya, "113");
    mock.setOnline(false);

    await rejects(mock.api.studentStudy.getHomeworkDeadlines(), "network", 0);
    await rejects(mock.api.studentStudy.getTheoryLibrary(), "network", 0);
    await rejects(mock.api.studentStudy.getNumberDetail("113"), "network", 0);
    await rejects(mock.api.studentStudy.saveNumberNote(numberId("113"), "офлайн"), "network", 0);
    assert.deepEqual(statusRow(mock, USER.ilya, "113"), before);

    // Back online the same call goes through (the pending-writes queue of the app replays it).
    mock.setOnline(true);
    assert.equal((await mock.api.studentStudy.saveNumberNote(numberId("113"), "офлайн")).note, "офлайн");
  });
});
