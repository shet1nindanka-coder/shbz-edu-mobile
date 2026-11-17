// Node's test runner and assert are typed by referencing only their declaration files: the project does not
// load `@types/node` globally (it would change DOM / React Native globals such as the timer return types).
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError, isNetworkError } from "../src/api/errors";
import type { AnyApiErrorCode } from "../src/api/errors";
import type { FileUpload, RealtimeEvent, UpdateTopicRequest } from "../src/api/types";
import { MOCK_COVERAGE } from "../src/mock";
import { createTestMock, type TestMock } from "../src/mock/testing";

const DEV = "dev@example.com";
const ANNA = "teacher@example.com";
const IGOR = "teacher2@example.com";
const OLGA = "teacher3@example.com";
const ILYA = "ilya@example.com";

const MIB = 1024 * 1024;
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const LINEAR_NUMBERS = "112, 113, 118, 120, 121, 124, 127, 130";

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

/** Opens the realtime stream of the signed-in user and collects the `topic-content-changed` events. */
async function listen(mock: TestMock) {
  const events: RealtimeEvent[] = [];
  const unsubscribe = mock.api.shell.subscribeRealtime((event) => events.push(event));
  await settle();
  return {
    unsubscribe,
    /** `topicId` of every content event so far (null = published without a topic). */
    async content(): Promise<(string | null)[]> {
      await settle();
      return events.flatMap((event) => (event.kind === "topic-content-changed" ? [event.topicId ?? null] : []));
    },
  };
}

async function devMock(options: Parameters<typeof createTestMock>[0] = {}): Promise<TestMock> {
  const mock = createTestMock(options);
  await mock.signIn(DEV);
  return mock;
}

const upload = (name = "theory.pdf", size = 2048, mimeType = "application/pdf"): FileUpload => ({ uri: `file:///picked/${name}`, name, mimeType, size });

const linearUpdate = (patch: Partial<UpdateTopicRequest> = {}): UpdateTopicRequest => ({
  title: "Линейные уравнения",
  description: "Базовые свойства линейных уравнений, перенос слагаемых и проверка решения.",
  numbers: LINEAR_NUMBERS,
  ...patch,
});

/** Role refusals shared by every developer-only method. */
async function assertDeveloperOnly(call: (mock: TestMock) => Promise<unknown>): Promise<void> {
  const mock = createTestMock();
  await rejects(call(mock), "sessionExpired", 401);
  await mock.signIn(ANNA);
  const teacher = await rejects(call(mock), "developerRightsRequired", 403);
  assert.equal(teacher.message, "Нужны права разработчика.");
  mock.signOut();
  await mock.signIn(ILYA);
  await rejects(call(mock), "developerRightsRequired", 403);
  mock.setLocale("en");
  assert.equal((await rejects(call(mock), "developerRightsRequired", 403)).message, "Developer rights are required.");
}

/** Role refusals shared by the read methods open to both staff roles. */
async function assertStaffOnly(call: (mock: TestMock) => Promise<unknown>): Promise<void> {
  const mock = createTestMock();
  await rejects(call(mock), "sessionExpired", 401);
  await mock.signIn(ILYA);
  assert.equal((await rejects(call(mock), "unauthorized", 403)).message, "Нет доступа.");
}

// ───────────────────────────── read ─────────────────────────────

describe("content: listTopics", () => {
  it("lists the shared bank in display order with number totals", async () => {
    const mock = await devMock();
    const topics = await mock.api.content.listTopics();
    assert.deepEqual(topics.map((topic) => topic.id), ["top_linear", "top_quadratic", "top_derivative", "top_log", "top_systems", "top_empty", "top_word"]);
    assert.deepEqual(topics.map((topic) => topic.displayOrder), [1, 2, 3, 4, 5, 6, 7]);
    assert.deepEqual(topics.map((topic) => topic.totalNumbers), [8, 8, 6, 12, 5, 0, 40]);
    assert.deepEqual(Object.keys(topics[0]!).sort(), ["description", "displayOrder", "id", "studentsWithActivity", "title", "totalNumbers"]);
    assert.equal(topics[0]!.title, "Линейные уравнения");
    assert.equal(topics[5]!.description, "");
  });

  it("counts active students among own students for a teacher and among everybody for the developer", async () => {
    const mock = await devMock();
    const activity = async () => (await mock.api.content.listTopics()).map((topic) => topic.studentsWithActivity);
    assert.deepEqual(await activity(), [7, 5, 6, 3, 2, 0, 4]);

    mock.signOut();
    await mock.signIn(ANNA);
    assert.deepEqual(await activity(), [6, 5, 5, 3, 2, 0, 4]);

    mock.signOut();
    await mock.signIn(IGOR);
    assert.deepEqual(await activity(), [1, 0, 1, 0, 0, 0, 0]);

    // A teacher without students sees the same bank with no activity.
    mock.signOut();
    await mock.signIn(OLGA);
    assert.deepEqual(await activity(), [0, 0, 0, 0, 0, 0, 0]);

    // A row with a cleared colour is not activity.
    mock.signOut();
    await mock.signIn(DEV);
    for (const row of mock.store.statuses.all()) {
      if (mock.store.numbers.get(row.homeworkNumberId)?.topicId === "top_systems") mock.store.statuses.update(row.id, { status: null });
    }
    assert.equal((await activity())[4], 0);
  });

  it("is closed to students and to signed-out callers", async () => {
    await assertStaffOnly((mock) => mock.api.content.listTopics());
  });
});

describe("content: getTopic", () => {
  it("returns the topic with file references, numbers in display order and the counters", async () => {
    const mock = await devMock();
    const detail = await mock.api.content.getTopic("top_linear");
    assert.deepEqual(detail.stats, { totalNumbers: 8, theoryAttached: true, homeworkAttached: true, conditionsCount: 7, answersCount: 6 });
    assert.deepEqual(Object.keys(detail.topic).sort(), ["description", "displayOrder", "homeworkFile", "homeworkNumbers", "id", "theoryFile", "title"]);
    // A file is referenced by id and metadata only: no URL, no uploader, no storage fields.
    assert.deepEqual(detail.topic.theoryFile, {
      id: "file_linear_theory",
      originalName: "linear-equations-theory.pdf",
      mimeType: "application/pdf",
      size: 49_152,
      uploadedAt: mock.store.files.get("file_linear_theory")!.uploadedAt,
    });
    assert.match(detail.topic.theoryFile!.uploadedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    assert.deepEqual(detail.topic.homeworkNumbers.map((number) => number.number), ["112", "113", "118", "120", "121", "124", "127", "130"]);
    assert.deepEqual(Object.keys(detail.topic.homeworkNumbers[0]!).sort(), ["answerLatex", "conditionLatex", "displayOrder", "estimatedMinutes", "id", "number"]);
    assert.deepEqual(detail.topic.homeworkNumbers[0], {
      id: "num_112",
      number: "112",
      displayOrder: 0,
      estimatedMinutes: null,
      conditionLatex: "Решите уравнение $3x - 7 = 11$.",
      answerLatex: "$x = 6$",
    });
  });

  it("serves the same payload, answers included, to a teacher", async () => {
    const mock = await devMock();
    const asDeveloper = await mock.api.content.getTopic("top_log");
    mock.signOut();
    await mock.signIn(OLGA);
    assert.deepEqual(await mock.api.content.getTopic("top_log"), asDeveloper);
    assert.equal(asDeveloper.topic.homeworkNumbers[0]!.answerLatex, "$x=7$");
  });

  it("shows the seeded edge cases (coverage rows emptyStates, numbers.edgeCases, files.kinds)", async () => {
    const mock = await devMock();
    for (const key of ["emptyStates", "numbers.edgeCases", "files.kinds"]) {
      const row = MOCK_COVERAGE.find((entry) => entry.key === key);
      assert.ok(row?.check, key);
      assert.equal(row.check(mock.store, mock.ctx.now()), true, key);
    }

    // No numbers, no files, an empty description.
    const empty = await mock.api.content.getTopic("top_empty");
    assert.deepEqual(empty.topic.homeworkNumbers, []);
    assert.equal(empty.topic.description, "");
    assert.deepEqual([empty.topic.theoryFile, empty.topic.homeworkFile], [null, null]);
    assert.deepEqual(empty.stats, { totalNumbers: 0, theoryAttached: false, homeworkAttached: false, conditionsCount: 0, answersCount: 0 });

    // Statement / answer gaps and the broken formula travel as stored.
    const linear = await mock.api.content.getTopic("top_linear");
    const byLabel = (label: string) => linear.topic.homeworkNumbers.find((number) => number.number === label)!;
    assert.deepEqual([byLabel("124").conditionLatex, byLabel("124").answerLatex], [null, null]);
    assert.equal(byLabel("127").answerLatex, null);
    assert.notEqual(byLabel("127").conditionLatex, null);
    const quadratic = await mock.api.content.getTopic("top_quadratic");
    assert.ok(quadratic.topic.homeworkNumbers.find((number) => number.number === "220")!.conditionLatex!.includes("\\frac{1}{x$"));

    // Leading zeros are kept and the order is numeric.
    const log = await mock.api.content.getTopic("top_log");
    assert.equal(log.topic.homeworkNumbers.length, 12);
    assert.deepEqual([log.topic.homeworkNumbers[0]!.number, log.topic.homeworkNumbers[11]!.number], ["010203", "010214"]);
    const word = await mock.api.content.getTopic("top_word");
    assert.equal(word.stats.totalNumbers, 40);
    assert.equal(word.stats.conditionsCount, 35);

    // File kinds: long PDF + DOCX, a PNG without a homework file, a JPEG; the answers file is not part of the DTO.
    assert.ok(quadratic.topic.theoryFile!.size > MIB);
    assert.equal(quadratic.topic.homeworkFile!.mimeType, DOCX_MIME);
    const derivative = await mock.api.content.getTopic("top_derivative");
    assert.equal(derivative.topic.theoryFile!.mimeType, "image/png");
    assert.equal(derivative.topic.homeworkFile, null);
    assert.deepEqual([derivative.stats.theoryAttached, derivative.stats.homeworkAttached], [true, false]);
    assert.equal(word.topic.theoryFile!.mimeType, "image/jpeg");
    assert.equal(JSON.stringify(log).includes("file_log_answers"), false);
  });

  it("answers 404 topicNotFound for an unknown topic and refuses students", async () => {
    const mock = await devMock();
    assert.equal((await rejects(mock.api.content.getTopic("top_missing"), "topicNotFound", 404)).message, "Тема не найдена.");
    mock.setLocale("en");
    assert.equal((await rejects(mock.api.content.getTopic(""), "topicNotFound", 404)).message, "Topic not found.");
    await assertStaffOnly((other) => other.api.content.getTopic("top_linear"));
  });
});

describe("content: getNumber", () => {
  it("finds a number by its normalised form and returns the recorded spelling", async () => {
    const mock = await devMock();
    const expected = {
      topic: { id: "top_log", title: "Логарифмические уравнения", description: "Простейшие логарифмические уравнения и уравнения, сводящиеся к ним." },
      number: { id: "num_010203", number: "010203", conditionLatex: "Решите уравнение $\\log_2(x+1)=3$.", answerLatex: "$x=7$" },
    };
    assert.deepEqual(await mock.api.content.getNumber("top_log", "010203"), expected);
    assert.deepEqual(await mock.api.content.getNumber("top_log", "10203"), expected);
    assert.deepEqual(await mock.api.content.getNumber("top_log", "00010203"), expected);

    // A teacher gets the same read-only payload.
    mock.signOut();
    await mock.signIn(ANNA);
    assert.deepEqual(await mock.api.content.getNumber("top_log", "10203"), expected);
    const empty = await mock.api.content.getNumber("top_linear", "124");
    assert.deepEqual(empty.number, { id: "num_124", number: "124", conditionLatex: null, answerLatex: null });
  });

  it("answers 404 numberNotFound for a missing number, a foreign topic, an unknown topic and a non-digit segment", async () => {
    const mock = await devMock();
    assert.equal((await rejects(mock.api.content.getNumber("top_linear", "999"), "numberNotFound", 404)).message, "Номер не найден.");
    // 204 exists, but in another topic.
    await rejects(mock.api.content.getNumber("top_linear", "204"), "numberNotFound", 404);
    await rejects(mock.api.content.getNumber("top_missing", "112"), "numberNotFound", 404);
    for (const segment of ["12a", "", " 112", "1.5", "-112"]) {
      await rejects(mock.api.content.getNumber("top_linear", segment), "numberNotFound", 404);
    }
    await assertStaffOnly((other) => other.api.content.getNumber("top_linear", "112"));
  });
});

describe("content: getTopicConditions", () => {
  it("resolves to the bare record of statements keyed by number id", async () => {
    const mock = await devMock();
    const conditions = await mock.api.content.getTopicConditions("top_linear");
    assert.deepEqual(Object.keys(conditions).sort(), ["num_112", "num_113", "num_118", "num_120", "num_121", "num_124", "num_127", "num_130"]);
    assert.equal(conditions.num_112, "Решите уравнение $3x - 7 = 11$.");
    assert.equal(conditions.num_124, null);

    mock.signOut();
    await mock.signIn(IGOR);
    assert.deepEqual(await mock.api.content.getTopicConditions("top_linear"), conditions);
  });

  it("never fails: an unknown or empty topic id yields an empty record", async () => {
    const mock = await devMock();
    assert.deepEqual(await mock.api.content.getTopicConditions("top_missing"), {});
    assert.deepEqual(await mock.api.content.getTopicConditions(""), {});
    assert.deepEqual(await mock.api.content.getTopicConditions("top_empty"), {});
  });

  it("is limited to 120 calls per minute per user", async () => {
    const mock = createTestMock();
    await mock.signIn(ANNA);
    for (let call = 0; call < 120; call += 1) await mock.api.content.getTopicConditions("top_systems");
    const refused = await rejects(mock.api.content.getTopicConditions("top_systems"), "rateLimited", 429);
    assert.equal(refused.retryAfterSeconds, 60);
    assert.equal(refused.message, "Слишком много запросов. Подождите немного и попробуйте снова.");
    mock.clock.advance(60_000);
    assert.equal(Object.keys(await mock.api.content.getTopicConditions("top_systems")).length, 5);
    await assertStaffOnly((other) => other.api.content.getTopicConditions("top_linear"));
  });
});

// ───────────────────────────── upload ─────────────────────────────

describe("content: uploadFile", () => {
  it("stores a picked file and returns its reference", async () => {
    const uploaded: string[] = [];
    const mock = await devMock({ onFileUploaded: (file) => uploaded.push(`${file.id}|${file.uri}|${file.mimeType}`) });
    const progress: number[] = [];
    // The declared type may be generic: the stored one is derived from the extension. The name is trimmed.
    const file = await mock.api.content.uploadFile(
      { uri: "file:///picked/a.docx", name: "  Логарифмы — теория.DOCX ", mimeType: "application/octet-stream", size: 4096 },
      { onProgress: (percent) => progress.push(percent) },
    );
    assert.deepEqual(Object.keys(file).sort(), ["id", "mimeType", "originalName", "size", "uploadedAt"]);
    assert.equal(file.originalName, "Логарифмы — теория.DOCX");
    assert.equal(file.mimeType, DOCX_MIME);
    assert.equal(file.size, 4096);
    assert.equal(file.uploadedAt, mock.ctx.nowIso());
    assert.deepEqual(progress, [25, 50, 75, 100]);

    const row = mock.store.files.get(file.id)!;
    assert.deepEqual([row.uploadedById, row.localUri, row.sample], ["usr_dev", "file:///picked/a.docx", null]);
    assert.deepEqual(uploaded, [`${file.id}|file:///picked/a.docx|${DOCX_MIME}`]);

    // Every allowed extension is accepted; an upload alone publishes nothing and is attached to nothing.
    const stream = await listen(mock);
    for (const name of ["a.pdf", "b.png", "c.jpg", "d.jpeg"]) {
      const stored = await mock.api.content.uploadFile({ uri: `file:///picked/${name}`, name, mimeType: "", size: 1 });
      assert.equal(stored.originalName, name);
    }
    assert.deepEqual(await stream.content(), []);
    stream.unsubscribe();
  });

  it("removes the file the slot held before only when it is the caller's own and unused", async () => {
    const removed: string[] = [];
    const mock = await devMock({ onFileRemoved: (fileId) => removed.push(fileId) });
    const first = await mock.api.content.uploadFile(upload("first.pdf"));
    const second = await mock.api.content.uploadFile(upload("second.pdf"), { previousFileId: first.id });
    assert.equal(mock.store.files.has(first.id), false);
    assert.equal(mock.store.files.has(second.id), true);
    assert.deepEqual(removed, [first.id]);

    // A file a topic uses stays, and so does somebody else's orphan.
    mock.store.files.insert({ id: "file_foreign", originalName: "x.pdf", mimeType: "application/pdf", size: 10, uploadedAt: mock.ctx.nowIso(), uploadedById: "usr_anna", sample: null, localUri: "file:///x.pdf" });
    await mock.api.content.uploadFile(upload("third.pdf"), { previousFileId: "file_linear_theory" });
    await mock.api.content.uploadFile(upload("fourth.pdf"), { previousFileId: "file_foreign" });
    await mock.api.content.uploadFile(upload("fifth.pdf"), { previousFileId: "file_missing" });
    assert.equal(mock.store.files.has("file_linear_theory"), true);
    assert.equal(mock.store.files.has("file_foreign"), true);
    assert.deepEqual(removed, [first.id]);
  });

  it("rejects a missing or empty file with fileRequired", async () => {
    const mock = await devMock();
    const empty = await rejects(mock.api.content.uploadFile(upload("a.pdf", 0)), "fileRequired", 400);
    assert.equal(empty.message, "Выберите файл для загрузки.");
    await rejects(mock.api.content.uploadFile({ ...upload(), uri: "" }), "fileRequired", 400);
    await rejects(mock.api.content.uploadFile(undefined as unknown as FileUpload), "fileRequired", 400);
    mock.setLocale("en");
    assert.equal((await rejects(mock.api.content.uploadFile(upload("a.pdf", 0)), "fileRequired", 400)).message, "Choose a file to upload.");
  });

  it("classifies validation failures into the shared upload codes at the site's limits", async () => {
    const mock = await devMock();
    const before = mock.store.files.size;

    // Type: extension and declared MIME.
    const extension = await rejects(mock.api.content.uploadFile(upload("notes.txt", 10, "text/plain")), "uploadUnsupportedType", 400);
    assert.equal(extension.message, "Поддерживаются только PDF, DOCX, PNG и JPG.");
    const mismatch = await rejects(mock.api.content.uploadFile(upload("scan.pdf", 10, "image/png")), "uploadUnsupportedType", 400);
    assert.equal(mismatch.message, "Тип файла не соответствует его расширению.");
    await rejects(mock.api.content.uploadFile(upload("no-extension", 10)), "uploadUnsupportedType", 400);

    // Name: 255 characters pass, 256 do not; control characters are refused.
    const longest = `${"a".repeat(251)}.pdf`;
    assert.equal(longest.length, 255);
    assert.equal((await mock.api.content.uploadFile(upload(longest))).originalName, longest);
    const tooLong = await rejects(mock.api.content.uploadFile(upload(`a${longest}`)), "uploadBadName", 400);
    assert.equal(tooLong.message, "Имя файла должно содержать не больше 255 символов.");
    assert.deepEqual(tooLong.params, { max: 255 });
    await rejects(mock.api.content.uploadFile(upload("   ")), "uploadBadName", 400);
    const control = await rejects(mock.api.content.uploadFile(upload("bad\u0007name.pdf")), "uploadBadName", 400);
    assert.equal(control.message, "Имя файла содержит недопустимые символы.");
    assert.equal(control.params, undefined);

    // Size: exactly 15 MiB passes, one byte more is 413; a size that is not a positive integer is rejected.
    assert.equal((await mock.api.content.uploadFile(upload("big.pdf", 15 * MIB))).size, 15 * MIB);
    const tooBig = await rejects(mock.api.content.uploadFile(upload("big.pdf", 15 * MIB + 1)), "uploadTooLarge", 413);
    assert.equal(tooBig.message, "Файл слишком большой. Максимальный размер — 15 МБ.");
    for (const size of [-1, 1.5, Number.NaN]) {
      const rejected = await rejects(mock.api.content.uploadFile(upload("odd.pdf", size)), "uploadRejected", 400);
      assert.equal(rejected.message, "Файл пуст или имеет некорректный размер.");
    }

    mock.setLocale("en");
    assert.equal((await rejects(mock.api.content.uploadFile(upload("notes.txt")), "uploadUnsupportedType", 400)).message, "Only PDF, DOCX, PNG and JPG are supported.");
    assert.equal((await rejects(mock.api.content.uploadFile(upload("big.pdf", 16 * MIB)), "uploadTooLarge", 413)).message, "The file is too big. Maximum size is 15 MB.");

    // Only the two valid uploads created a row.
    assert.equal(mock.store.files.size, before + 2);
  });

  it("treats progress as advisory: a listener that throws does not fail the upload", async () => {
    const mock = await devMock();
    const before = mock.store.files.size;
    const calls: number[] = [];
    const file = await mock.api.content.uploadFile(upload("noisy.pdf"), {
      onProgress: (percent) => {
        calls.push(percent);
        throw new Error("listener broke");
      },
    });
    assert.equal(file.originalName, "noisy.pdf");
    assert.equal(mock.store.files.size, before + 1);
    assert.deepEqual(calls, [25, 50, 75, 100]);
  });

  it("can be cancelled while the file is in transit, before anything is stored", async () => {
    const mock = await devMock();
    const before = mock.store.files.size;
    const controller = new AbortController();
    const progress: number[] = [];
    await assert.rejects(
      mock.api.content.uploadFile(upload("half.pdf"), {
        signal: controller.signal,
        onProgress: (percent) => {
          progress.push(percent);
          if (percent === 50) controller.abort();
        },
      }),
      (error: unknown) => isNetworkError(error),
    );
    assert.equal(mock.store.files.size, before);
    assert.deepEqual(progress, [25, 50]);
  });

  it("honours an aborted signal and writes nothing", async () => {
    const mock = await devMock();
    const before = mock.store.files.size;
    const controller = new AbortController();
    controller.abort();
    const progress: number[] = [];
    await assert.rejects(mock.api.content.uploadFile(upload(), { signal: controller.signal, onProgress: (percent) => progress.push(percent) }), (error: unknown) => isNetworkError(error));
    assert.equal(mock.store.files.size, before);
    assert.deepEqual(progress, []);
    // An aborted call does not consume the limiter.
    assert.equal(mock.store.limiterBuckets.get("api:teacher-uploads|usr_dev"), undefined);
  });

  it("is limited to 60 uploads per 10 minutes and is developer-only", async () => {
    const mock = await devMock();
    for (let call = 0; call < 60; call += 1) await mock.api.content.uploadFile(upload(`f${call}.pdf`));
    const refused = await rejects(mock.api.content.uploadFile(upload("one-more.pdf")), "rateLimited", 429);
    assert.equal(refused.retryAfterSeconds, 600);
    mock.clock.advance(9 * 60_000);
    assert.equal((await rejects(mock.api.content.uploadFile(upload("one-more.pdf")), "rateLimited", 429)).retryAfterSeconds, 60);
    mock.clock.advance(60_000);
    await mock.api.content.uploadFile(upload("one-more.pdf"));

    await assertDeveloperOnly((other) => other.api.content.uploadFile(upload()));
  });
});

// ───────────────────────────── create ─────────────────────────────

describe("content: createTopic", () => {
  it("creates a topic at the end of the list from two pre-uploaded files", async () => {
    const mock = await devMock();
    const stream = await listen(mock);
    const theory = await mock.api.content.uploadFile(upload("theory.pdf"));
    const homework = await mock.api.content.uploadFile(upload("homework.png", 512, "image/png"));
    const journalBefore = mock.store.auditLogs.size;

    const { topicId } = await mock.api.content.createTopic({
      title: "  Проценты \t и   доли ",
      description: "Первая строка   \r\nВторая строка\u0007  ",
      numbers: "10, 3-5; 01\n007 5",
      theoryFileId: theory.id,
      homeworkFileId: homework.id,
    });

    const detail = await mock.api.content.getTopic(topicId);
    assert.equal(detail.topic.title, "Проценты и доли");
    assert.equal(detail.topic.description, "Первая строка\nВторая строка");
    assert.equal(detail.topic.displayOrder, 8);
    assert.deepEqual([detail.topic.theoryFile!.id, detail.topic.homeworkFile!.id], [theory.id, homework.id]);
    // Parsed, de-duplicated by the normalised form (first spelling wins) and sorted numerically.
    assert.deepEqual(detail.topic.homeworkNumbers.map((number) => [number.number, number.displayOrder]), [["01", 1], ["3", 2], ["4", 3], ["5", 4], ["007", 5], ["10", 6]]);
    assert.ok(detail.topic.homeworkNumbers.every((number) => number.conditionLatex === null && number.answerLatex === null && number.estimatedMinutes === null));
    assert.deepEqual(detail.stats, { totalNumbers: 6, theoryAttached: true, homeworkAttached: true, conditionsCount: 0, answersCount: 0 });

    const row = mock.store.topics.get(topicId)!;
    assert.deepEqual([row.subject, row.grade, row.answersFileId, row.createdAt, row.updatedAt], ["MATH", null, null, mock.ctx.nowIso(), mock.ctx.nowIso()]);
    assert.equal((await mock.api.content.listTopics()).at(-1)!.id, topicId);

    // One realtime event with the topic id; no journal row for a manual creation.
    assert.deepEqual(await stream.content(), [topicId]);
    assert.equal(mock.store.auditLogs.size, journalBefore);
    stream.unsubscribe();
  });

  it("treats the description as optional and lets students see the new topic's files", async () => {
    const mock = await devMock();
    const theory = await mock.api.content.uploadFile(upload("t.pdf"));
    const homework = await mock.api.content.uploadFile(upload("h.pdf"));
    const { topicId } = await mock.api.content.createTopic({ title: "Без описания", numbers: "1", theoryFileId: theory.id, homeworkFileId: homework.id });
    assert.equal((await mock.api.content.getTopic(topicId)).topic.description, "");
    // An unattached upload is the developer's own; once it is a topic file, every role may read it.
    mock.signOut();
    await mock.signIn(ILYA);
    assert.equal(mock.ctx.files.lookup(theory.id)?.originalName, "t.pdf");
  });

  it("rejects an incomplete form with formInvalid", async () => {
    const mock = await devMock();
    const theory = await mock.api.content.uploadFile(upload("t.pdf"));
    const homework = await mock.api.content.uploadFile(upload("h.pdf"));
    const valid = { title: "Тема", numbers: "1-3", theoryFileId: theory.id, homeworkFileId: homework.id };
    const topicsBefore = mock.store.topics.size;

    const noTitle = await rejects(mock.api.content.createTopic({ ...valid, title: "  \t " }), "formInvalid", 400);
    assert.equal(noTitle.message, "Проверьте форму: название, оба файла и список номеров обязательны.");
    // Nothing parses: letters, a decimal, zero.
    await rejects(mock.api.content.createTopic({ ...valid, numbers: "abc, 1.5, 0" }), "formInvalid", 400);
    await rejects(mock.api.content.createTopic({ ...valid, theoryFileId: " " }), "formInvalid", 400);
    await rejects(mock.api.content.createTopic({ ...valid, homeworkFileId: "" }), "formInvalid", 400);
    mock.setLocale("en");
    assert.equal(
      (await rejects(mock.api.content.createTopic({ ...valid, title: "" }), "formInvalid", 400)).message,
      "Check the form: the title, both files and the problem list are required.",
    );
    assert.equal(mock.store.topics.size, topicsBefore);
  });

  it("rejects files that are missing, not the caller's own, or the same file twice with filesUnavailable", async () => {
    const mock = await devMock();
    const theory = await mock.api.content.uploadFile(upload("t.pdf"));
    const homework = await mock.api.content.uploadFile(upload("h.pdf"));
    mock.store.files.insert({ id: "file_foreign", originalName: "x.pdf", mimeType: "application/pdf", size: 10, uploadedAt: mock.ctx.nowIso(), uploadedById: "usr_anna", sample: null, localUri: "file:///x.pdf" });
    const valid = { title: "Тема", numbers: "1-3", theoryFileId: theory.id, homeworkFileId: homework.id };

    const missing = await rejects(mock.api.content.createTopic({ ...valid, theoryFileId: "file_missing" }), "filesUnavailable", 400);
    assert.equal(missing.message, "Файлы не найдены или уже недоступны. Загрузите их заново.");
    await rejects(mock.api.content.createTopic({ ...valid, homeworkFileId: "file_foreign" }), "filesUnavailable", 400);
    await rejects(mock.api.content.createTopic({ ...valid, homeworkFileId: theory.id }), "filesUnavailable", 400);
    assert.equal(mock.store.topics.size, 7);
  });

  it("is limited to 12 calls per minute and is developer-only", async () => {
    const mock = await devMock();
    // Refused attempts count too: the limiter runs before the form is looked at.
    for (let call = 0; call < 12; call += 1) await rejects(mock.api.content.createTopic({ title: "", numbers: "", theoryFileId: "", homeworkFileId: "" }), "formInvalid", 400);
    assert.equal((await rejects(mock.api.content.createTopic({ title: "", numbers: "", theoryFileId: "", homeworkFileId: "" }), "rateLimited", 429)).retryAfterSeconds, 60);

    await assertDeveloperOnly((other) => other.api.content.createTopic({ title: "Тема", numbers: "1", theoryFileId: "file_linear_theory", homeworkFileId: "file_linear_homework" }));
  });
});

// ───────────────────────────── numbers preview and update ─────────────────────────────

describe("content: previewNumbersChange", () => {
  it("describes what a new number list removes, adds and keeps, writing nothing", async () => {
    const mock = await devMock();
    const numbersBefore = mock.store.numbers.size;
    const preview = await mock.api.content.previewNumbersChange("top_linear", "112, 113, 124, 999");
    assert.deepEqual(preview, {
      keptCount: 3,
      added: ["999"],
      requiresConfirmation: true,
      requiresAssignedConfirmation: true,
      removed: [
        { number: "118", summary: "статус у 5 учеников, дедлайн у 2 учеников, входит в 2 активных ДЗ, 2 вердикта ИИ-проверки, 7 пунктов в наборах занятий, условие и ответ", hasStudentWork: true, isAssigned: true },
        { number: "120", summary: "статус у 4 учеников, заметки у 1 ученика, дедлайн у 1 ученика, входит в 2 активных ДЗ, 6 пунктов в наборах занятий, условие и ответ", hasStudentWork: true, isAssigned: true },
        { number: "121", summary: "статус у 5 учеников, дедлайн у 1 ученика, входит в 2 активных ДЗ, 4 пункта в наборах занятий, условие и ответ", hasStudentWork: true, isAssigned: true },
        { number: "127", summary: "статус у 3 учеников, дедлайн у 1 ученика, входит в 1 активное ДЗ, 6 пунктов в наборах занятий, условие", hasStudentWork: true, isAssigned: true },
        { number: "130", summary: "статус у 2 учеников, дедлайн у 1 ученика, входит в 1 активное ДЗ, 6 пунктов в наборах занятий, условие и ответ", hasStudentWork: true, isAssigned: true },
      ],
    });
    assert.equal(mock.store.numbers.size, numbersBefore);

    // Work without an active homework: confirmation, but no extra acknowledgement.
    assert.deepEqual(await mock.api.content.previewNumbersChange("top_systems", "401-404"), {
      keptCount: 4,
      added: [],
      requiresConfirmation: true,
      requiresAssignedConfirmation: false,
      removed: [{ number: "405", summary: "статус у 2 учеников, 3 пункта в наборах занятий, условие и ответ", hasStudentWork: true, isAssigned: false }],
    });

    // The same set, and a pure addition, need no confirmation.
    assert.deepEqual(await mock.api.content.previewNumbersChange("top_linear", "112-113 118; 120\n121, 124, 127, 130"), {
      keptCount: 8, added: [], requiresConfirmation: false, requiresAssignedConfirmation: false, removed: [],
    });
    assert.deepEqual(await mock.api.content.previewNumbersChange("top_empty", "3, 1, 2"), {
      keptCount: 0, added: ["1", "2", "3"], requiresConfirmation: false, requiresAssignedConfirmation: false, removed: [],
    });

    mock.setLocale("en");
    const english = await mock.api.content.previewNumbersChange("top_systems", "401-404");
    assert.equal(english.removed[0]!.summary, "status for 2 students, 3 items in lesson sets, statement and answer");
  });

  it("reports a number without any trace as safe to remove", async () => {
    const mock = await devMock();
    const theory = await mock.api.content.uploadFile(upload("t.pdf"));
    const homework = await mock.api.content.uploadFile(upload("h.pdf"));
    const { topicId } = await mock.api.content.createTopic({ title: "Новая", numbers: "1-3", theoryFileId: theory.id, homeworkFileId: homework.id });
    assert.deepEqual(await mock.api.content.previewNumbersChange(topicId, "1, 2"), {
      keptCount: 2,
      added: [],
      requiresConfirmation: false,
      requiresAssignedConfirmation: false,
      removed: [{ number: "3", summary: "ничего не потеряется", hasStudentWork: false, isAssigned: false }],
    });
  });

  it("rejects an empty list, a twin spelling and an unknown topic", async () => {
    const mock = await devMock();
    const empty = await rejects(mock.api.content.previewNumbersChange("top_linear", "abc, 0"), "emptyNumbers", 400);
    assert.equal(empty.message, "Список номеров пуст — тема не может остаться без номеров.");
    await rejects(mock.api.content.previewNumbersChange("top_linear", ""), "emptyNumbers", 400);

    // «10203» next to the stored «010203».
    const twin = await rejects(mock.api.content.previewNumbersChange("top_log", "10203, 010204-010214"), "numbersTwin", 400);
    assert.equal(twin.message, "Номера 10203 и 010203 — это один и тот же номер, оставьте один вариант записи.");
    assert.deepEqual(twin.params, { typed: "10203", existing: "010203" });
    mock.setLocale("en");
    assert.equal(
      (await rejects(mock.api.content.previewNumbersChange("top_log", "10203"), "numbersTwin", 400)).message,
      "Problems 10203 and 010203 are the same problem. Keep only one of them.",
    );

    assert.equal((await rejects(mock.api.content.previewNumbersChange("top_missing", "1"), "topicNotFound", 404)).message, "Topic not found.");
  });

  it("is limited to 60 calls per minute and is developer-only", async () => {
    const mock = await devMock();
    for (let call = 0; call < 60; call += 1) await mock.api.content.previewNumbersChange("top_systems", "401-405");
    assert.equal((await rejects(mock.api.content.previewNumbersChange("top_systems", "401-405"), "rateLimited", 429)).retryAfterSeconds, 60);
    await assertDeveloperOnly((other) => other.api.content.previewNumbersChange("top_linear", "112"));
  });
});

describe("content: updateTopic", () => {
  it("saves title, description and order, keeping every kept number with its student data", async () => {
    const mock = await devMock();
    const stream = await listen(mock);
    const before = await mock.api.content.getTopic("top_linear");
    const statusesBefore = mock.store.statuses.size;
    mock.clock.advance(5000);

    const detail = await mock.api.content.updateTopic("top_linear", linearUpdate({ title: " Линейные   уравнения — 7 класс ", description: "Строка 1  \r\nСтрока 2", numbers: "130, 127, 124, 121, 120, 118, 113, 112, 131" }));
    assert.equal(detail.topic.title, "Линейные уравнения — 7 класс");
    assert.equal(detail.topic.description, "Строка 1\nСтрока 2");
    // The list is stored sorted; a kept number keeps its id, statement and answer, the order becomes 1-based.
    assert.deepEqual(detail.topic.homeworkNumbers.map((number) => [number.number, number.displayOrder]), [
      ["112", 1], ["113", 2], ["118", 3], ["120", 4], ["121", 5], ["124", 6], ["127", 7], ["130", 8], ["131", 9],
    ]);
    for (const number of before.topic.homeworkNumbers) {
      const kept = detail.topic.homeworkNumbers.find((entry) => entry.number === number.number)!;
      assert.deepEqual([kept.id, kept.conditionLatex, kept.answerLatex], [number.id, number.conditionLatex, number.answerLatex]);
    }
    assert.deepEqual(detail.topic.theoryFile, before.topic.theoryFile);
    assert.deepEqual(detail.stats, { ...before.stats, totalNumbers: 9 });
    assert.equal(mock.store.statuses.size, statusesBefore);
    assert.equal(mock.store.topics.get("top_linear")!.updatedAt, mock.ctx.nowIso());
    assert.deepEqual(await mock.api.content.getTopic("top_linear"), detail);
    assert.deepEqual(await stream.content(), ["top_linear"]);
    stream.unsubscribe();
  });

  it("refuses to remove numbers with student work until the exact list is confirmed", async () => {
    const mock = await devMock();
    const stream = await listen(mock);
    const numbers = "112, 113, 118, 120, 121, 124";
    const preview = await mock.api.content.previewNumbersChange("top_linear", numbers);
    assert.deepEqual(preview.removed.map((entry) => entry.number), ["127", "130"]);

    const unconfirmed = await rejects(mock.api.content.updateTopic("top_linear", linearUpdate({ numbers })), "numbersConfirm", 409);
    assert.match(unconfirmed.message, /^Изменения не сохранены: удаление номеров с работой учеников нужно подтвердить\./);
    // Both refusals carry the fresh preview.
    assert.deepEqual(unconfirmed.details, preview);

    // A stale confirmation (only a part of the dangerous numbers, or other numbers) is refused too.
    await rejects(mock.api.content.updateTopic("top_linear", linearUpdate({ numbers, confirmNumbersRemoval: ["130"], allowAssignedRemoval: true })), "numbersConfirm", 409);
    await rejects(mock.api.content.updateTopic("top_linear", linearUpdate({ numbers, confirmNumbersRemoval: ["118", " x "], allowAssignedRemoval: true })), "numbersConfirm", 409);

    // Confirmed, but the numbers are in issued homework: a separate acknowledgement is required.
    const assigned = await rejects(mock.api.content.updateTopic("top_linear", linearUpdate({ numbers, confirmNumbersRemoval: ["127", "130"] })), "numbersAssigned", 409);
    assert.match(assigned.message, /^Изменения не сохранены: среди удаляемых есть номера из активных ДЗ\./);
    assert.deepEqual(assigned.details, preview);
    await rejects(
      mock.api.content.updateTopic("top_linear", linearUpdate({ numbers, confirmNumbersRemoval: ["127", "130"], allowAssignedRemoval: "1" as unknown as boolean })),
      "numbersAssigned",
      409,
    );

    mock.setLocale("en");
    assert.match((await rejects(mock.api.content.updateTopic("top_linear", linearUpdate({ numbers })), "numbersConfirm", 409)).message, /^Changes not saved: removing problems with student work needs confirmation\./);

    // Nothing was written and nothing was published.
    assert.equal((await mock.api.content.getTopic("top_linear")).stats.totalNumbers, 8);
    assert.deepEqual(await stream.content(), []);
    stream.unsubscribe();
  });

  it("removes confirmed numbers together with everything attached to them", async () => {
    const mock = await devMock();
    const { store } = mock;
    const count = (id: string) => ({
      statuses: store.statuses.by("homeworkNumberId", id).length,
      events: store.progressEvents.by("homeworkNumberId", id).length,
      homework: store.homeworkNumbers.by("homeworkNumberId", id).length,
      items: store.lessonItems.by("homeworkNumberId", id).length,
      verdicts: store.homeworkCheckResults.by("homeworkNumberId", id).length,
    });
    const removedBefore = count("num_118");
    assert.ok(removedBefore.statuses > 0 && removedBefore.homework === 2 && removedBefore.items === 7 && removedBefore.verdicts === 2);
    const keptBefore = count("num_120");
    const assignmentsBefore = store.homeworks.size;
    const holders = store.homeworkNumbers.by("homeworkNumberId", "num_118").map((link) => link.assignmentId);

    // The confirmation may list more than needed, in any spelling of whitespace.
    const detail = await mock.api.content.updateTopic(
      "top_linear",
      linearUpdate({ numbers: "112, 113, 120, 121, 124, 127, 130", confirmNumbersRemoval: [" 118 ", "999"], allowAssignedRemoval: true }),
    );
    assert.deepEqual(detail.topic.homeworkNumbers.map((number) => number.number), ["112", "113", "120", "121", "124", "127", "130"]);
    assert.equal(store.numbers.get("num_118"), undefined);
    assert.deepEqual(count("num_118"), { statuses: 0, events: 0, homework: 0, items: 0, verdicts: 0 });
    // Other numbers and the assignments themselves are untouched: a homework just got shorter.
    assert.deepEqual(count("num_120"), keptBefore);
    assert.equal(store.homeworks.size, assignmentsBefore);
    for (const assignmentId of holders) assert.ok(store.homeworks.has(assignmentId));
    await rejects(mock.api.content.getNumber("top_linear", "118"), "numberNotFound", 404);

    // The removed label can come back as a brand-new number without any history.
    const again = await mock.api.content.updateTopic("top_linear", linearUpdate({ numbers: "112, 113, 118, 120, 121, 124, 127, 130" }));
    const reborn = again.topic.homeworkNumbers.find((number) => number.number === "118")!;
    assert.notEqual(reborn.id, "num_118");
    assert.deepEqual([reborn.conditionLatex, reborn.answerLatex, reborn.displayOrder], [null, null, 3]);
    assert.deepEqual(count(reborn.id), { statuses: 0, events: 0, homework: 0, items: 0, verdicts: 0 });
  });

  it("needs no acknowledgement for unassigned work and no confirmation for an untouched number", async () => {
    const mock = await devMock();
    // 405 has statuses and lesson items but is in no homework.
    await rejects(mock.api.content.updateTopic("top_systems", { title: "Системы уравнений", description: "", numbers: "401-404" }), "numbersConfirm", 409);
    const systems = await mock.api.content.updateTopic("top_systems", { title: "Системы уравнений", description: "", numbers: "401-404", confirmNumbersRemoval: ["405"] });
    assert.deepEqual(systems.topic.homeworkNumbers.map((number) => number.number), ["401", "402", "403", "404"]);
    assert.equal(systems.topic.description, "");

    // A number nobody worked on goes without any confirmation.
    const first = await mock.api.content.updateTopic("top_empty", { title: "Тригонометрия", description: "", numbers: "1-3" });
    assert.deepEqual(first.topic.homeworkNumbers.map((number) => number.number), ["1", "2", "3"]);
    const second = await mock.api.content.updateTopic("top_empty", { title: "Тригонометрия", description: "", numbers: "2" });
    assert.deepEqual(second.topic.homeworkNumbers.map((number) => [number.number, number.displayOrder]), [["2", 1]]);
    // …but a statement alone already counts as work.
    await mock.api.content.saveCondition(second.topic.homeworkNumbers[0]!.id, "$x$");
    await rejects(mock.api.content.updateTopic("top_empty", { title: "Тригонометрия", description: "", numbers: "5" }), "numbersConfirm", 409);
  });

  it("replaces topic files by pre-uploaded ids and cleans up the old ones", async () => {
    const removed: string[] = [];
    const mock = await devMock({ onFileRemoved: (fileId) => removed.push(fileId) });
    const theory = await mock.api.content.uploadFile(upload("new-theory.png", 100, "image/png"));

    const detail = await mock.api.content.updateTopic("top_linear", linearUpdate({ theoryFileId: theory.id }));
    assert.equal(detail.topic.theoryFile!.id, theory.id);
    assert.equal(detail.topic.theoryFile!.mimeType, "image/png");
    assert.equal(detail.topic.homeworkFile!.id, "file_linear_homework");
    assert.equal(mock.store.files.has("file_linear_theory"), false);
    assert.deepEqual(removed, ["file_linear_theory"]);

    // Omitted, empty or unchanged ids keep the current file; a topic without a file gets one.
    const same = await mock.api.content.updateTopic("top_linear", linearUpdate({ theoryFileId: theory.id, homeworkFileId: "" }));
    assert.deepEqual([same.topic.theoryFile!.id, same.topic.homeworkFile!.id], [theory.id, "file_linear_homework"]);
    const homework = await mock.api.content.uploadFile(upload("derivative-homework.pdf"));
    const derivative = await mock.api.content.updateTopic("top_derivative", { title: "Производная", description: "", numbers: "301, 302, 305, 308, 310, 312", homeworkFileId: homework.id });
    assert.equal(derivative.topic.homeworkFile!.id, homework.id);
    assert.equal(derivative.stats.homeworkAttached, true);
    assert.deepEqual(removed, ["file_linear_theory"]);

    // An unknown file, or one uploaded by somebody else, is refused and nothing changes.
    mock.store.files.insert({ id: "file_foreign", originalName: "x.pdf", mimeType: "application/pdf", size: 10, uploadedAt: mock.ctx.nowIso(), uploadedById: "usr_anna", sample: null, localUri: "file:///x.pdf" });
    await rejects(mock.api.content.updateTopic("top_linear", linearUpdate({ title: "Другое", theoryFileId: "file_missing" })), "filesUnavailable", 400);
    await rejects(mock.api.content.updateTopic("top_linear", linearUpdate({ title: "Другое", homeworkFileId: "file_foreign" })), "filesUnavailable", 400);
    assert.equal((await mock.api.content.getTopic("top_linear")).topic.title, "Линейные уравнения");
  });

  it("rejects twins, an incomplete form and an unknown topic", async () => {
    const mock = await devMock();
    const twin = await rejects(
      mock.api.content.updateTopic("top_log", { title: "Логарифмические уравнения", description: "", numbers: "10203, 010204-010214", confirmNumbersRemoval: ["010203"], allowAssignedRemoval: true }),
      "numbersTwin",
      400,
    );
    assert.match(twin.message, /^Изменения не сохранены: среди новых номеров есть совпадающие с существующими с точностью до ведущих нулей/);
    assert.equal((await mock.api.content.getTopic("top_log")).topic.homeworkNumbers[0]!.number, "010203");

    const noTitle = await rejects(mock.api.content.updateTopic("top_linear", linearUpdate({ title: " " })), "invalidData", 400);
    assert.equal(noTitle.message, "Проверьте форму: название, описание и список номеров обязательны.");
    await rejects(mock.api.content.updateTopic("top_linear", linearUpdate({ numbers: "нет номеров" })), "invalidData", 400);
    mock.setLocale("en");
    assert.equal(
      (await rejects(mock.api.content.updateTopic("top_linear", linearUpdate({ numbers: "" })), "invalidData", 400)).message,
      "Check the form: title, description and the problem list are required.",
    );

    // The topic is looked up before the form is read.
    await rejects(mock.api.content.updateTopic("top_missing", linearUpdate({ title: "" })), "topicNotFound", 404);
    await assertDeveloperOnly((other) => other.api.content.updateTopic("top_linear", linearUpdate()));
  });
});

// ───────────────────────────── topic files, impact, delete, order ─────────────────────────────

describe("content: deleteTopicFile", () => {
  it("detaches the file, removes it from storage and is idempotent", async () => {
    const removed: string[] = [];
    const mock = await devMock({ onFileRemoved: (fileId) => removed.push(fileId) });
    const stream = await listen(mock);

    assert.equal(await mock.api.content.deleteTopicFile("top_linear", "theory"), undefined);
    const detail = await mock.api.content.getTopic("top_linear");
    assert.equal(detail.topic.theoryFile, null);
    assert.equal(detail.topic.homeworkFile!.id, "file_linear_homework");
    assert.deepEqual([detail.stats.theoryAttached, detail.stats.homeworkAttached], [false, true]);
    assert.equal(mock.store.files.has("file_linear_theory"), false);
    assert.deepEqual(removed, ["file_linear_theory"]);
    assert.deepEqual(await stream.content(), ["top_linear"]);

    // Nothing attached: a success that changes nothing and publishes nothing.
    await mock.api.content.deleteTopicFile("top_linear", "theory");
    await mock.api.content.deleteTopicFile("top_derivative", "homework");
    await mock.api.content.deleteTopicFile("top_empty", "theory");
    assert.deepEqual(await stream.content(), ["top_linear"]);

    await mock.api.content.deleteTopicFile("top_linear", "homework");
    assert.deepEqual(removed, ["file_linear_theory", "file_linear_homework"]);
    assert.deepEqual(await stream.content(), ["top_linear", "top_linear"]);
    stream.unsubscribe();
  });

  it("keeps a file another topic still uses and never touches the answers file", async () => {
    const mock = await devMock();
    // Both topics point at the same stored files.
    const { topicId } = await mock.api.content.createTopic({ title: "Копия", numbers: "1", theoryFileId: "file_log_theory", homeworkFileId: "file_log_homework" });
    await mock.api.content.deleteTopicFile("top_log", "theory");
    assert.equal(mock.store.files.has("file_log_theory"), true);
    assert.equal((await mock.api.content.getTopic(topicId)).topic.theoryFile!.id, "file_log_theory");
    assert.equal(mock.store.topics.get("top_log")!.answersFileId, "file_log_answers");
    await mock.api.content.deleteTopicFile(topicId, "theory");
    assert.equal(mock.store.files.has("file_log_theory"), false);
  });

  it("rejects an unknown topic and an unknown kind", async () => {
    const mock = await devMock();
    await rejects(mock.api.content.deleteTopicFile("top_missing", "theory"), "topicNotFound", 404);
    await rejects(mock.api.content.deleteTopicFile("top_log", "answers" as unknown as "theory"), "invalidData", 400);
    assert.equal(mock.store.topics.get("top_log")!.answersFileId, "file_log_answers");
    await assertDeveloperOnly((other) => other.api.content.deleteTopicFile("top_linear", "theory"));
  });
});

describe("content: getTopicImpact", () => {
  it("sums up what deleting the topic destroys, with localised lines", async () => {
    const mock = await devMock();
    assert.deepEqual(await mock.api.content.getTopicImpact("top_linear"), {
      summary: { totalNumbers: 8, numbersWithWork: 8, statusCount: 31, noteCount: 2, activeAssignments: 17, checkResults: 7, lessonItems: 45, numbersWithCondition: 7, numbersWithAnswer: 6 },
      lines: [
        "31 статус светофора у учеников",
        "2 заметки учеников",
        "17 номеров из активных ДЗ (сами ДЗ тоже удалятся вместе с фото решений)",
        "7 вердиктов ИИ-проверок",
        "45 пунктов в наборах занятий и черновиках ДЗ",
        "LaTeX: условий — 7, ответов — 6",
      ],
    });
    assert.deepEqual(await mock.api.content.getTopicImpact("top_empty"), {
      summary: { totalNumbers: 0, numbersWithWork: 0, statusCount: 0, noteCount: 0, activeAssignments: 0, checkResults: 0, lessonItems: 0, numbersWithCondition: 0, numbersWithAnswer: 0 },
      lines: [],
    });

    mock.setLocale("en");
    const english = await mock.api.content.getTopicImpact("top_systems");
    assert.equal(english.summary.numbersWithWork, 5);
    assert.equal(english.lines.length, 3);
    assert.ok(english.lines.every((line) => !/[а-яё]/i.test(line)), english.lines.join(" | "));
  });

  it("rejects an unknown topic and is developer-only", async () => {
    const mock = await devMock();
    await rejects(mock.api.content.getTopicImpact("top_missing"), "topicNotFound", 404);
    await assertDeveloperOnly((other) => other.api.content.getTopicImpact("top_linear"));
  });
});

describe("content: deleteTopic", () => {
  it("deletes a topic without work straight away", async () => {
    const mock = await devMock();
    const stream = await listen(mock);
    assert.equal(await mock.api.content.deleteTopic("top_empty", 0), undefined);
    assert.equal(mock.store.topics.has("top_empty"), false);
    assert.equal((await mock.api.content.listTopics()).length, 6);
    await rejects(mock.api.content.getTopic("top_empty"), "topicNotFound", 404);

    // Filtered by target: the seeded journal has a `topic.delete` row of its own (an older topic).
    const row = mock.store.auditLogs.all().filter((entry) => entry.action === "topic.delete" && entry.targetId === "top_empty");
    assert.equal(row.length, 1);
    assert.equal(row[0]!.summary, "Удалена тема, файлов вычищено: 0");
    // Published without a topic id.
    assert.deepEqual(await stream.content(), [null]);
    stream.unsubscribe();
  });

  it("requires the acknowledged amount of work to match the current one", async () => {
    const mock = await devMock();
    const stream = await listen(mock);
    const impact = await mock.api.content.getTopicImpact("top_linear");
    assert.equal(impact.summary.numbersWithWork, 8);

    for (const acknowledged of [0, 7, 9, 8.5, Number.NaN, undefined as unknown as number]) {
      const refused = await rejects(mock.api.content.deleteTopic("top_linear", acknowledged), "deleteChanged", 409);
      assert.deepEqual(refused.details, impact);
      assert.match(refused.message, /^Тема не удалена: с момента открытия страницы у неё изменился объём работы учеников\./);
    }
    mock.setLocale("en");
    assert.match((await rejects(mock.api.content.deleteTopic("top_linear", 0), "deleteChanged", 409)).message, /^Topic not deleted: the amount of student work has changed/);
    mock.setLocale("ru");

    // The work changed after the dialog was shown: the old acknowledgement is stale.
    await mock.api.content.deleteCondition("num_127");
    await mock.api.content.updateTopic("top_linear", linearUpdate({ numbers: `${LINEAR_NUMBERS}, 131` }));
    assert.equal((await mock.api.content.getTopicImpact("top_linear")).summary.numbersWithWork, 8);
    await mock.api.content.saveCondition((await mock.api.content.getNumber("top_linear", "131")).number.id, "$1$");
    const stale = await rejects(mock.api.content.deleteTopic("top_linear", 8), "deleteChanged", 409);
    assert.equal((stale.details as { summary: { numbersWithWork: number } }).summary.numbersWithWork, 9);

    assert.equal(mock.store.topics.has("top_linear"), true);
    assert.equal(mock.store.auditLogs.all().some((entry) => entry.action === "topic.delete" && entry.targetId === "top_linear"), false);
    assert.equal((await stream.content()).includes(null), false);
    stream.unsubscribe();
  });

  it("deletes a topic with everything attached, cleans up its files and writes the journal row", async () => {
    const removed: string[] = [];
    const mock = await devMock({ onFileRemoved: (fileId) => removed.push(fileId) });
    const { store } = mock;
    const stream = await listen(mock);
    const numberIds = store.numbers.by("topicId", "top_linear").map((number) => number.id);
    const foreignStatuses = store.statuses.all().filter((row) => !numberIds.includes(row.homeworkNumberId)).length;
    assert.ok(store.homeworks.by("topicId", "top_linear").length > 0);
    assert.equal(store.lessons.get("hp_conflict")!.topicId, "top_linear");

    await mock.api.content.deleteTopic("top_linear", 8);

    assert.equal(store.topics.has("top_linear"), false);
    assert.equal(store.numbers.by("topicId", "top_linear").length, 0);
    for (const id of numberIds) {
      assert.equal(store.statuses.by("homeworkNumberId", id).length, 0);
      assert.equal(store.progressEvents.by("homeworkNumberId", id).length, 0);
      assert.equal(store.lessonItems.by("homeworkNumberId", id).length, 0);
      assert.equal(store.homeworkCheckResults.by("homeworkNumberId", id).length, 0);
    }
    // Homeworks of the topic go with it; a draft of the topic survives without a topic.
    assert.equal(store.homeworks.by("topicId", "top_linear").length, 0);
    assert.equal(store.homeworks.has("hw_ilya_done"), false);
    assert.equal(store.lessons.get("hp_conflict")!.topicId, null);
    // Everything of other topics is intact.
    assert.equal(store.statuses.size, foreignStatuses);
    assert.equal(store.numbers.size, 79 - 8);
    assert.deepEqual((await mock.api.content.listTopics()).map((topic) => topic.id), ["top_quadratic", "top_derivative", "top_log", "top_systems", "top_empty", "top_word"]);

    // The device layer hears about every file row that went away: the topic's own two files and the
    // solution photos of the homework that was deleted with the topic (kept by its checks' snapshots).
    assert.deepEqual(
      removed.filter((fileId) => fileId.startsWith("file_linear_")).sort(),
      ["file_linear_homework", "file_linear_theory"],
    );
    const photos = removed.filter((fileId) => !fileId.startsWith("file_linear_"));
    assert.ok(photos.length > 0);
    // Files of other topics are not among them.
    assert.equal(photos.some((fileId) => /^file_(quadratic|derivative|log|systems|word)_/.test(fileId)), false);
    assert.equal(new Set(removed).size, removed.length);
    for (const fileId of removed) assert.equal(store.files.has(fileId), false, fileId);

    const rows = store.auditLogs.all().filter((entry) => entry.action === "topic.delete" && entry.targetId === "top_linear");
    assert.equal(rows.length, 1);
    const row = rows[0]!;
    assert.deepEqual(
      [row.category, row.outcome, row.actorId, row.actorName, row.actorRole, row.targetType, row.targetId, row.summary, row.createdAt],
      ["DATA", "ok", "usr_dev", "Разработчик ШБЗ", "DEVELOPER", "Topic", "top_linear", "Удалена тема, файлов вычищено: 2", mock.ctx.nowIso()],
    );
    assert.deepEqual(row.meta, { cleanedFileCount: 2, i18n: { key: "topic.deleted", params: { count: 2 } } });
    assert.deepEqual(await stream.content(), [null]);
    stream.unsubscribe();

    // The second delete of the same topic is a 404.
    await rejects(mock.api.content.deleteTopic("top_linear", 8), "topicNotFound", 404);
  });

  it("counts the answers file and per-number answer files among the cleaned files", async () => {
    const mock = await devMock();
    const answer = await mock.api.content.uploadFile(upload("answer-010203.pdf"));
    mock.store.numbers.update("num_010203", { answerFileId: answer.id });
    const impact = await mock.api.content.getTopicImpact("top_log");
    await mock.api.content.deleteTopic("top_log", impact.summary.numbersWithWork);
    for (const fileId of ["file_log_theory", "file_log_homework", "file_log_answers", answer.id]) assert.equal(mock.store.files.has(fileId), false, fileId);
    assert.equal(mock.store.auditLogs.all().find((entry) => entry.action === "topic.delete" && entry.targetId === "top_log")!.summary, "Удалена тема, файлов вычищено: 4");
  });

  it("rejects an unknown topic and is developer-only", async () => {
    const mock = await devMock();
    await rejects(mock.api.content.deleteTopic("top_missing", 0), "topicNotFound", 404);
    await assertDeveloperOnly((other) => other.api.content.deleteTopic("top_empty", 0));
  });
});

describe("content: reorderTopics", () => {
  const SEEDED = ["top_linear", "top_quadratic", "top_derivative", "top_log", "top_systems", "top_empty", "top_word"];

  it("stores the full order and returns it", async () => {
    const mock = await devMock();
    const stream = await listen(mock);
    const reversed = [...SEEDED].reverse();
    assert.deepEqual(await mock.api.content.reorderTopics(reversed), reversed);
    const topics = await mock.api.content.listTopics();
    assert.deepEqual(topics.map((topic) => topic.id), reversed);
    assert.deepEqual(topics.map((topic) => topic.displayOrder), [1, 2, 3, 4, 5, 6, 7]);
    // The order is global: a teacher sees it too.
    mock.signOut();
    await mock.signIn(ANNA);
    assert.deepEqual((await mock.api.content.listTopics()).map((topic) => topic.id), reversed);
    assert.deepEqual(await stream.content(), [null]);
    stream.unsubscribe();
  });

  it("accepts only a permutation of the current topics", async () => {
    const mock = await devMock();
    const stale = await rejects(mock.api.content.reorderTopics(SEEDED.slice(1)), "listChanged", 409);
    assert.equal(stale.message, "Список тем изменился. Обновите страницу и повторите перетаскивание.");
    await rejects(mock.api.content.reorderTopics([...SEEDED, "top_missing"]), "listChanged", 409);
    await rejects(mock.api.content.reorderTopics([...SEEDED.slice(1), "top_missing"]), "listChanged", 409);
    await rejects(mock.api.content.reorderTopics([...SEEDED.slice(1), "top_word"]), "listChanged", 409);
    await rejects(mock.api.content.reorderTopics([]), "listChanged", 409);
    // Ids are trimmed, blanks dropped.
    assert.equal((await mock.api.content.reorderTopics([" top_word ", "", ...SEEDED.slice(0, 6)]))[0], "top_word");

    const invalid = await rejects(mock.api.content.reorderTopics("top_linear" as unknown as string[]), "invalidRequest", 400);
    assert.equal(invalid.message, "Некорректный запрос на изменение порядка тем.");
    await rejects(mock.api.content.reorderTopics(undefined as unknown as string[]), "invalidRequest", 400);
    mock.setLocale("en");
    assert.equal((await rejects(mock.api.content.reorderTopics(["x"]), "listChanged", 409)).message, "The topic list has changed. Refresh the page and drag again.");
  });

  it("is limited to 30 calls per minute and is developer-only", async () => {
    const mock = await devMock();
    for (let call = 0; call < 30; call += 1) await mock.api.content.reorderTopics(call % 2 === 0 ? [...SEEDED].reverse() : SEEDED);
    assert.equal((await rejects(mock.api.content.reorderTopics(SEEDED), "rateLimited", 429)).retryAfterSeconds, 60);
    mock.clock.advance(60_000);
    assert.deepEqual(await mock.api.content.reorderTopics(SEEDED), SEEDED);
    await assertDeveloperOnly((other) => other.api.content.reorderTopics(SEEDED));
  });
});

// ───────────────────────────── statement and answer ─────────────────────────────

describe("content: saveCondition / deleteCondition", () => {
  it("stores the normalised statement and returns it", async () => {
    const mock = await devMock();
    const stream = await listen(mock);
    const stored = await mock.api.content.saveCondition("num_124", "  Решите уравнение:  \r\n$$x^2 = 4$$\u0007 \r\n\r\n  ");
    assert.equal(stored, "Решите уравнение:\n$$x^2 = 4$$");
    assert.equal((await mock.api.content.getNumber("top_linear", "124")).number.conditionLatex, stored);
    assert.equal((await mock.api.content.getTopicConditions("top_linear")).num_124, stored);
    assert.equal((await mock.api.content.getTopic("top_linear")).stats.conditionsCount, 8);
    // The answer is not touched; no length limit is enforced.
    assert.equal(mock.store.numbers.get("num_124")!.answerLatex, null);
    assert.equal((await mock.api.content.saveCondition("num_124", "x".repeat(20_000))).length, 20_000);
    assert.deepEqual(await stream.content(), ["top_linear", "top_linear"]);
    stream.unsubscribe();
  });

  it("deletes a statement idempotently", async () => {
    const mock = await devMock();
    const stream = await listen(mock);
    assert.equal(await mock.api.content.deleteCondition("num_112"), undefined);
    assert.equal(mock.store.numbers.get("num_112")!.conditionLatex, null);
    assert.equal(mock.store.numbers.get("num_112")!.answerLatex, "$x = 6$");
    // Nothing stored: a success without an event.
    await mock.api.content.deleteCondition("num_112");
    await mock.api.content.deleteCondition("num_124");
    assert.deepEqual(await stream.content(), ["top_linear"]);
    stream.unsubscribe();
  });

  it("rejects a blank statement and an unknown number", async () => {
    const mock = await devMock();
    const blank = await rejects(mock.api.content.saveCondition("num_112", " \r\n \u0007 "), "latexRequired", 400);
    assert.equal(blank.message, "Введите LaTeX-условие для номера.");
    await rejects(mock.api.content.saveCondition("num_112", undefined as unknown as string), "latexRequired", 400);
    assert.equal(mock.store.numbers.get("num_112")!.conditionLatex, "Решите уравнение $3x - 7 = 11$.");
    assert.equal((await rejects(mock.api.content.saveCondition("num_missing", "$x$"), "numberNotFound", 404)).message, "Номер не найден.");
    await rejects(mock.api.content.deleteCondition("num_missing"), "numberNotFound", 404);
    await rejects(mock.api.content.deleteCondition(""), "numberNotFound", 404);
    mock.setLocale("en");
    assert.equal((await rejects(mock.api.content.saveCondition("num_112", ""), "latexRequired", 400)).message, "Enter the LaTeX statement for the problem.");
  });

  it("shares one bucket of 60 calls per minute between save and delete, and is developer-only", async () => {
    const mock = await devMock();
    for (let call = 0; call < 30; call += 1) {
      await mock.api.content.saveCondition("num_124", `$${call}$`);
      await mock.api.content.deleteCondition("num_124");
    }
    assert.equal((await rejects(mock.api.content.saveCondition("num_124", "$x$"), "rateLimited", 429)).retryAfterSeconds, 60);
    await rejects(mock.api.content.deleteCondition("num_124"), "rateLimited", 429);
    // The answer bucket is separate.
    assert.equal(await mock.api.content.saveAnswer("num_124", "$1$"), "$1$");

    await assertDeveloperOnly((other) => other.api.content.saveCondition("num_112", "$x$"));
    await assertDeveloperOnly((other) => other.api.content.deleteCondition("num_112"));
  });
});

describe("content: saveAnswer / deleteAnswer", () => {
  it("stores the trimmed answer and returns it", async () => {
    const mock = await devMock();
    const stream = await listen(mock);
    // Only trimmed: inner line breaks are kept as sent.
    const stored = await mock.api.content.saveAnswer("num_127", "  а) $x = 5$\r\nб) $x = 7$  ");
    assert.equal(stored, "а) $x = 5$\r\nб) $x = 7$");
    assert.equal((await mock.api.content.getNumber("top_linear", "127")).number.answerLatex, stored);
    assert.equal((await mock.api.content.getTopic("top_linear")).stats.answersCount, 7);
    assert.deepEqual(await stream.content(), ["top_linear"]);
    stream.unsubscribe();
  });

  it("replaces the legacy answer file of a number and deletes it idempotently", async () => {
    const removed: string[] = [];
    const mock = await devMock({ onFileRemoved: (fileId) => removed.push(fileId) });
    const first = await mock.api.content.uploadFile(upload("answer-124.pdf"));
    const second = await mock.api.content.uploadFile(upload("answer-127.pdf"));
    mock.store.numbers.update("num_124", { answerFileId: first.id });
    mock.store.numbers.update("num_127", { answerFileId: second.id });

    // Saving a LaTeX answer drops the file.
    await mock.api.content.saveAnswer("num_124", "$42$");
    assert.deepEqual([mock.store.numbers.get("num_124")!.answerLatex, mock.store.numbers.get("num_124")!.answerFileId], ["$42$", null]);
    assert.deepEqual(removed, [first.id]);

    // A number with only a file still has something to delete.
    const stream = await listen(mock);
    await mock.api.content.deleteAnswer("num_127");
    assert.deepEqual([mock.store.numbers.get("num_127")!.answerLatex, mock.store.numbers.get("num_127")!.answerFileId], [null, null]);
    assert.deepEqual(removed, [first.id, second.id]);
    await mock.api.content.deleteAnswer("num_124");
    assert.equal(mock.store.numbers.get("num_124")!.answerLatex, null);
    assert.equal(mock.store.numbers.get("num_124")!.conditionLatex, null);
    // Nothing stored any more: successes without events.
    await mock.api.content.deleteAnswer("num_124");
    await mock.api.content.deleteAnswer("num_127");
    assert.deepEqual(await stream.content(), ["top_linear", "top_linear"]);
    stream.unsubscribe();
  });

  it("rejects a blank answer and an unknown number", async () => {
    const mock = await devMock();
    const blank = await rejects(mock.api.content.saveAnswer("num_112", "   \n "), "latexRequired", 400);
    assert.equal(blank.message, "Введите LaTeX-ответ для номера.");
    assert.equal(mock.store.numbers.get("num_112")!.answerLatex, "$x = 6$");
    await rejects(mock.api.content.saveAnswer("num_missing", "$x$"), "numberNotFound", 404);
    await rejects(mock.api.content.deleteAnswer("num_missing"), "numberNotFound", 404);
    mock.setLocale("en");
    assert.equal((await rejects(mock.api.content.saveAnswer("num_112", ""), "latexRequired", 400)).message, "Enter the LaTeX answer for the problem.");
  });

  it("shares one bucket of 60 calls per minute between save and delete, and is developer-only", async () => {
    const mock = await devMock();
    for (let call = 0; call < 30; call += 1) {
      await mock.api.content.saveAnswer("num_124", `$${call}$`);
      await mock.api.content.deleteAnswer("num_124");
    }
    assert.equal((await rejects(mock.api.content.deleteAnswer("num_124"), "rateLimited", 429)).retryAfterSeconds, 60);
    await rejects(mock.api.content.saveAnswer("num_124", "$x$"), "rateLimited", 429);
    mock.clock.advance(60_000);
    assert.equal(await mock.api.content.saveAnswer("num_124", "$x$"), "$x$");

    await assertDeveloperOnly((other) => other.api.content.saveAnswer("num_112", "$x$"));
    await assertDeveloperOnly((other) => other.api.content.deleteAnswer("num_112"));
  });
});
