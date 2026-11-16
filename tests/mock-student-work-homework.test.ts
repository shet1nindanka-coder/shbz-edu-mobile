// `studentWork` on the mock store, part 1: homework list and detail, the photo batch and the AI check
// (docs/spec/90-addendum-5.md Part A; 03 §3 – §4; 90-addendum-3; 90-addendum-6 §4 – §5, §9).
// Everything runs on the manual clock: time moves only through `mock.clock.advance()`.
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError } from "../src/api/errors";
import type { AnyApiErrorCode } from "../src/api/errors";
import type { CheckErrorCode, PhotoUpload } from "../src/api/types";
import { HOUR_MS, MINUTE_MS } from "../src/domain/moscow-time";
import type { RealtimeEventInput } from "../src/mock/rules/realtime";
import { TEST_T0, createTestMock, type TestMock } from "../src/mock/testing";

const T0 = Date.parse(TEST_T0);
const MIB = 1024 * 1024;

/** Fields a student must never receive, in any payload of this member. */
const PRIVATE_FIELDS = ["errorKind", "errorNote", "injectionSuspected", "injectionNote", "copySuspected", "copyReason", "confidence", "modelUsed", "answerLatex", "storageKey", "localUri"];

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

function photo(name = "IMG_0001.jpg", size = 240_000, mimeType: string = name.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg"): PhotoUpload {
  return { uri: `file:///cache/${name}`, name, mimeType: mimeType as PhotoUpload["mimeType"], size };
}

const photos = (count: number, prefix = "IMG"): PhotoUpload[] => Array.from({ length: count }, (_, index) => photo(`${prefix}_${index + 1}.jpg`));

/** Records every realtime event the backend publishes, whoever would receive it. */
function recordEvents(mock: TestMock): RealtimeEventInput[] {
  const events: RealtimeEventInput[] = [];
  const realtime = mock.ctx.realtime as { publish(event: RealtimeEventInput): void };
  const publish = realtime.publish.bind(realtime);
  realtime.publish = (event) => {
    events.push(event);
    publish(event);
  };
  return events;
}

function assertNoPrivateFields(payload: unknown): void {
  const json = JSON.stringify(payload);
  for (const field of PRIVATE_FIELDS) assert.equal(json.includes(`"${field}"`), false, `the payload leaks "${field}"`);
}

const statusOf = (mock: TestMock, studentId: string, label: string) => mock.ctx.q.status(studentId, `num_${label}`)?.status ?? null;

const budgetHits = (mock: TestMock, scope: string) => mock.store.limiterBuckets.get(`${scope}|global`)?.hits ?? 0;

/** Attaches photos, starts a check and returns its id. */
async function startCheck(mock: TestMock, assignmentId: string, attach: number): Promise<string> {
  if (attach > 0) await mock.api.studentWork.uploadHomeworkPhotos(assignmentId, photos(attach));
  const { check } = await mock.api.studentWork.startHomeworkCheck(assignmentId);
  return check.id;
}

async function ilya(options: Parameters<typeof createTestMock>[0] = {}): Promise<TestMock> {
  const mock = createTestMock(options);
  await mock.signIn("ilya@example.com");
  return mock;
}

describe("studentWork: role and session", () => {
  const calls: [string, (mock: TestMock) => Promise<unknown>][] = [
    ["listHomeworks", (mock) => mock.api.studentWork.listHomeworks()],
    ["getHomework", (mock) => mock.api.studentWork.getHomework("hw_ilya_open")],
    ["uploadHomeworkPhotos", (mock) => mock.api.studentWork.uploadHomeworkPhotos("hw_ilya_open", [photo()])],
    ["deleteHomeworkPhoto", (mock) => mock.api.studentWork.deleteHomeworkPhoto("hw_ilya_open", "hwp_ilya_open_1")],
    ["startHomeworkCheck", (mock) => mock.api.studentWork.startHomeworkCheck("hw_ilya_open")],
    ["getLatestHomeworkCheck", (mock) => mock.api.studentWork.getLatestHomeworkCheck("hw_ilya_open")],
    ["getLiveLesson", (mock) => mock.api.studentWork.getLiveLesson()],
    ["joinLesson", (mock) => mock.api.studentWork.joinLesson("les_live")],
    ["submitLessonItem", (mock) => mock.api.studentWork.submitLessonItem("les_live", "any", [photo()])],
    ["getLiveLessonState", (mock) => mock.api.studentWork.getLiveLessonState("les_live")],
  ];

  it("answers 401 sessionExpired without a session", async () => {
    const mock = createTestMock();
    for (const [name, call] of calls) {
      const error = await rejects(call(mock), "sessionExpired", 401);
      assert.equal(error.message, "Сессия истекла. Войдите заново.", name);
    }
  });

  it("answers 403 unauthorized to a teacher and to a developer, before anything else", async () => {
    for (const login of ["teacher@example.com", "dev@example.com"]) {
      const mock = createTestMock();
      await mock.signIn(login);
      const before = mock.store.limiterBuckets.count();
      for (const [name, call] of calls) {
        const error = await rejects(call(mock), "unauthorized", 403);
        assert.equal(error.message, "Нет доступа.", `${login} ${name}`);
      }
      // The role is checked first: no limiter slot is consumed and nothing is written.
      assert.equal(mock.store.limiterBuckets.count(), before);
      assert.equal(mock.store.homeworkPhotos.by("assignmentId", "hw_ilya_open").length, 3);
      assert.equal(mock.ctx.q.participantOf("les_live", "usr_kirill")?.joinedAt, null);
    }
  });

  it("rejects an aborted read or upload with the client-side network error and writes nothing", async () => {
    const mock = await ilya();
    const controller = new AbortController();
    controller.abort();
    const opts = { signal: controller.signal };
    const aborted: Promise<unknown>[] = [
      mock.api.studentWork.listHomeworks(opts),
      mock.api.studentWork.getHomework("hw_ilya_open", opts),
      mock.api.studentWork.uploadHomeworkPhotos("hw_ilya_open", [photo()], opts),
      mock.api.studentWork.getLatestHomeworkCheck("hw_ilya_open", opts),
      mock.api.studentWork.getLiveLesson(opts),
      mock.api.studentWork.submitLessonItem("les_manual", "any", [photo()], opts),
      mock.api.studentWork.getLiveLessonState("les_manual", opts),
    ];
    for (const call of aborted) await rejects(call, "network", 0);
    assert.equal(mock.store.homeworkPhotos.by("assignmentId", "hw_ilya_open").length, 3);
    assert.equal(mock.store.limiterBuckets.count((bucket) => bucket.identifier === "usr_ilya" && bucket.scope.startsWith("api:")), 0);
  });
});

describe("studentWork.listHomeworks", () => {
  it("returns the student's homeworks attention-sorted, with ranks, counts and the latest check status", async () => {
    const mock = await ilya();
    const response = await mock.api.studentWork.listHomeworks();

    assert.equal(response.serverNow, TEST_T0);
    assert.equal(response.available, true);
    assert.deepEqual(response.limits, { maxPhotosPerAssignment: 10 });
    assert.deepEqual(
      response.assignments.map((entry) => [entry.id, entry.attentionRank]),
      [
        ["hw_ilya_overdue", 0],
        ["hw_ilya_uncertain", 1],
        ["hw_ilya_today", 2],
        ["hw_ilya_open", 2],
        ["hw_ilya_failed", 2],
        ["hw_ilya_far", 2],
        ["hw_ilya_soon", 3],
        ["hw_ilya_later", 4],
        ["hw_ilya_done", 5],
      ],
    );

    const overdue = response.assignments[0]!;
    assert.deepEqual(Object.keys(overdue).sort(), [
      "attentionRank", "createdAt", "deadlineAt", "id", "latestCheckStatus", "numbers", "orderInTopic", "photosCount",
      "solvedCount", "solvedPercent", "title", "topicId", "topicTitle", "totalNumbers",
    ]);
    assert.deepEqual(
      { title: overdue.title, orderInTopic: overdue.orderInTopic, topicId: overdue.topicId, totalNumbers: overdue.totalNumbers, solvedCount: overdue.solvedCount, solvedPercent: overdue.solvedPercent, photosCount: overdue.photosCount, latestCheckStatus: overdue.latestCheckStatus },
      { title: null, orderInTopic: 2, topicId: "top_linear", totalNumbers: 3, solvedCount: 0, solvedPercent: 0, photosCount: 0, latestCheckStatus: "DONE" },
    );
    assert.equal(overdue.topicTitle, mock.store.topics.get("top_linear")?.title);
    assert.deepEqual(overdue.numbers, [
      { homeworkNumberId: "num_118", number: "118", status: "RED" },
      { homeworkNumberId: "num_120", number: "120", status: null },
      { homeworkNumberId: "num_124", number: "124", status: null },
    ]);

    const byId = new Map(response.assignments.map((entry) => [entry.id, entry] as const));
    assert.equal(byId.get("hw_ilya_done")?.title, "Повторение перед контрольной");
    assert.equal(byId.get("hw_ilya_done")?.solvedPercent, 100);
    assert.equal(byId.get("hw_ilya_uncertain")?.solvedPercent, 75);
    assert.equal(byId.get("hw_ilya_far")?.solvedPercent, 33);
    assert.equal(byId.get("hw_ilya_open")?.photosCount, 3);
    assert.equal(byId.get("hw_ilya_open")?.latestCheckStatus, null);
    assert.equal(byId.get("hw_ilya_failed")?.latestCheckStatus, "FAILED");
    // Leading zeros are kept and the order is numeric.
    assert.deepEqual(byId.get("hw_ilya_later")?.numbers.map((entry) => entry.number), ["010203", "010204", "010209"]);
    assertNoPrivateFields(response);
  });

  it("is empty for a student without homeworks and never shows another student's rows", async () => {
    const mock = createTestMock();
    await mock.signIn("timur@example.com");
    assert.deepEqual((await mock.api.studentWork.listHomeworks()).assignments, []);

    mock.signOut();
    await mock.signIn("maria@example.com");
    const ids = (await mock.api.studentWork.listHomeworks()).assignments.map((entry) => entry.id);
    assert.deepEqual([...ids].sort(), ["hw_maria_done1", "hw_maria_done2", "hw_maria_done3", "hw_maria_legacy"]);
  });

  it("re-ranks against the clock and follows the photo limit setting", async () => {
    const mock = await ilya();
    mock.store.patchSettings({ maxPhotosPerAssignment: 4 });
    // Two days later `hw_ilya_soon` (deadline +1 d) is overdue as well.
    mock.clock.advance(48 * HOUR_MS);
    const response = await mock.api.studentWork.listHomeworks();
    assert.deepEqual(response.limits, { maxPhotosPerAssignment: 4 });
    assert.equal(response.serverNow, new Date(T0 + 48 * HOUR_MS).toISOString());
    const overdue = response.assignments.filter((entry) => entry.attentionRank === 0).map((entry) => entry.id);
    assert.deepEqual(overdue, ["hw_ilya_overdue", "hw_ilya_today", "hw_ilya_soon"]);
  });

  it("does not start the timer of a seeded running check (only a read of the check itself does)", async () => {
    const mock = createTestMock();
    await mock.signIn("artem@example.com");
    const response = await mock.api.studentWork.listHomeworks();
    assert.equal(response.assignments.find((entry) => entry.id === "hw_artem_running")?.latestCheckStatus, "CHECKING");
    assert.deepEqual(mock.ctx.jobs.pending("chk_artem_running_1").map((job) => job.state), ["waiting"]);
  });
});

describe("studentWork.getHomework", () => {
  it("returns the detail: photos by id, statements, statuses, notes and the limits", async () => {
    const mock = await ilya();
    const response = await mock.api.studentWork.getHomework("hw_ilya_open");

    assert.equal(response.serverNow, TEST_T0);
    assert.deepEqual(response.limits, { maxPhotosPerAssignment: 10, noteMaxLength: 240 });
    assert.equal(response.notesEnabled, true);
    assert.equal(response.aiCheckAvailable, true);

    const { assignment } = response;
    assert.deepEqual([assignment.id, assignment.title, assignment.orderInTopic, assignment.topicId, assignment.attentionRank], ["hw_ilya_open", null, 1, "top_derivative", 2]);
    assert.deepEqual([assignment.totalNumbers, assignment.solvedCount, assignment.solvedPercent, assignment.photosCount, assignment.latestCheckStatus], [3, 1, 33, 3, null]);
    assert.equal(assignment.latestCheck, null);

    assert.deepEqual(assignment.photos.map((entry) => [entry.id, entry.originalName, entry.mimeType]), [
      ["hwp_ilya_open_1", "IMG_2041.jpg", "image/jpeg"],
      ["hwp_ilya_open_2", "IMG_2042.jpg", "image/jpeg"],
      ["hwp_ilya_open_3", "решение-305.png", "image/png"],
    ]);
    // A response never contains a URL: a photo is referenced by ids only.
    for (const entry of assignment.photos) {
      assert.deepEqual(Object.keys(entry).sort(), ["createdAt", "fileId", "id", "mimeType", "originalName"]);
      assert.ok(mock.store.files.has(entry.fileId));
    }

    assert.deepEqual(assignment.numbers.map((entry) => [entry.homeworkNumberId, entry.number, entry.status, entry.note]), [
      ["num_301", "301", "YELLOW", ""],
      ["num_302", "302", null, ""],
      ["num_305", "305", null, ""],
    ]);
    for (const entry of assignment.numbers) {
      assert.deepEqual(Object.keys(entry).sort(), ["conditionLatex", "homeworkNumberId", "note", "number", "status"]);
      assert.equal(entry.conditionLatex, mock.store.numbers.get(entry.homeworkNumberId)?.conditionLatex ?? null);
    }
    assert.ok(assignment.numbers.some((entry) => typeof entry.conditionLatex === "string" && entry.conditionLatex.length > 0));
    assertNoPrivateFields(response);

    const overdue = await mock.api.studentWork.getHomework("hw_ilya_overdue");
    assert.equal(overdue.assignment.numbers.find((entry) => entry.number === "120")?.note, "Спросить на занятии про проверку корня.");
  });

  it("projects the latest check for a student: UNCERTAIN hides the model's answer and comment", async () => {
    const mock = await ilya();
    const ru = await mock.api.studentWork.getHomework("hw_ilya_uncertain");
    const check = ru.assignment.latestCheck;
    assert.ok(check);
    assert.deepEqual([check.id, check.status, check.errorCode], ["chk_ilya_uncertain_1", "DONE", null]);
    assert.ok(check.checkedAt);
    assert.deepEqual(check.results.map((result) => [result.number, result.verdict]), [["204", "CORRECT"], ["207", "CORRECT"], ["211", "UNCERTAIN"], ["215", "CORRECT"]]);
    for (const result of check.results) assert.deepEqual(Object.keys(result).sort(), ["comment", "homeworkNumberId", "number", "recognizedAnswer", "verdict"]);

    const uncertain = check.results[2]!;
    assert.equal(uncertain.recognizedAnswer, null);
    assert.equal(uncertain.comment, "Не удалось уверенно разобрать решение по фото. Покажи его учителю — он проверит вручную.");
    // The stored row keeps the model's comment and the teacher-only diagnostics.
    const stored = mock.ctx.q.checkResults("chk_ilya_uncertain_1").find((row) => row.homeworkNumberId === "num_211");
    assert.deepEqual([stored?.comment, stored?.injectionSuspected], ["Верно.", true]);
    assertNoPrivateFields(ru);
    assert.equal(JSON.stringify(ru).includes("проверяющий"), false);
    assert.equal(JSON.stringify(ru).includes("решебником"), false);

    mock.setLocale("en");
    const en = await mock.api.studentWork.getHomework("hw_ilya_uncertain");
    assert.equal(en.assignment.latestCheck?.results[2]?.comment, "Could not confidently read the solution from the photo. Show it to your teacher — they'll check it by hand.");
  });

  it("shows a failed check as its error class only, an empty DONE check, and the newest of several checks", async () => {
    const mock = await ilya();
    const failed = await mock.api.studentWork.getHomework("hw_ilya_failed");
    assert.deepEqual([failed.assignment.latestCheck?.status, failed.assignment.latestCheck?.errorCode], ["FAILED", "unavailable"]);
    assert.deepEqual(failed.assignment.latestCheck?.results, []);
    assert.ok(failed.assignment.latestCheck?.checkedAt);
    assert.equal(failed.assignment.photos.length, 2);
    // The raw provider text is never sent.
    assert.equal(JSON.stringify(failed).includes("rate limit exceeded"), false);
    assert.equal(JSON.stringify(failed).includes('"error"'), false);

    const empty = await mock.api.studentWork.getHomework("hw_ilya_later");
    assert.deepEqual([empty.assignment.latestCheck?.status, empty.assignment.latestCheck?.results], ["DONE", []]);

    const done = await mock.api.studentWork.getHomework("hw_ilya_done");
    assert.equal(done.assignment.latestCheck?.status, "DONE");
    assert.deepEqual(done.assignment.latestCheck?.results.map((result) => result.verdict), ["CORRECT", "CORRECT"]);
    assert.equal(done.assignment.attentionRank, 5);
  });

  it("answers 404 homeworkNotFound for an unknown id and for another student's homework", async () => {
    const mock = await ilya();
    for (const id of ["hw_missing", "hw_maria_done1", "hw_sofia_1", ""]) {
      const error = await rejects(mock.api.studentWork.getHomework(id), "homeworkNotFound", 404);
      assert.equal(error.message, "ДЗ не найдено.");
    }
    mock.setLocale("en");
    const error = await rejects(mock.api.studentWork.getHomework("hw_maria_done1"), "homeworkNotFound", 404);
    assert.equal(error.message, "Homework not found.");
  });

  it("reports the runtime switches of the screen: AI availability and the batch limit", async () => {
    const mock = await ilya();
    mock.store.patchSettings({ aiEnabled: false, maxPhotosPerAssignment: 30 });
    const response = await mock.api.studentWork.getHomework("hw_ilya_open");
    assert.equal(response.aiCheckAvailable, false);
    assert.equal(response.limits.maxPhotosPerAssignment, 30);
  });
});

describe("studentWork.uploadHomeworkPhotos", () => {
  it("stores every file of the call, returns the created photos and tells the teacher's screen", async () => {
    const uploaded: { id: string; uri: string; size: number }[] = [];
    const mock = await ilya({ onFileUploaded: (file) => uploaded.push({ id: file.id, uri: file.uri, size: file.size }) });
    const events = recordEvents(mock);
    const progress: number[] = [];

    const result = await mock.api.studentWork.uploadHomeworkPhotos(
      "hw_ilya_overdue",
      [photo("  стр 1.JPG ", 300_000), photo("page-2.jpeg", 100_000, "application/octet-stream"), photo("page-3.png", 100_000, "")],
      { onProgress: (percent) => progress.push(percent) },
    );

    assert.equal(result.photosCount, 3);
    assert.deepEqual(result.photos.map((entry) => [entry.originalName, entry.mimeType, entry.createdAt]), [
      // The name is trimmed; the stored MIME type is the one of the extension.
      ["стр 1.JPG", "image/jpeg", TEST_T0],
      ["page-2.jpeg", "image/jpeg", TEST_T0],
      ["page-3.png", "image/png", TEST_T0],
    ]);
    assert.deepEqual(progress, [60, 80, 100]);

    for (const entry of result.photos) {
      assert.deepEqual(Object.keys(entry).sort(), ["createdAt", "fileId", "id", "mimeType", "originalName"]);
      const file = mock.store.files.get(entry.fileId);
      assert.deepEqual([file?.uploadedById, file?.sample, file?.originalName], ["usr_ilya", null, entry.originalName]);
      // The mock FileService resolves the picked file under its id.
      assert.equal(mock.ctx.files.lookup(entry.fileId)?.mimeType, entry.mimeType);
    }
    assert.deepEqual(uploaded.map((file) => [file.uri, file.size]), [
      ["file:///cache/  стр 1.JPG ", 300_000],
      ["file:///cache/page-2.jpeg", 100_000],
      ["file:///cache/page-3.png", 100_000],
    ]);
    assert.deepEqual(uploaded.map((file) => file.id), result.photos.map((entry) => entry.fileId));

    assert.deepEqual(events, [{ kind: "student-progress-changed", studentId: "usr_ilya", topicId: "top_linear" }]);
    // No status changes and no check.
    assert.deepEqual(["118", "120", "124"].map((label) => statusOf(mock, "usr_ilya", label)), ["RED", null, null]);

    const detail = await mock.api.studentWork.getHomework("hw_ilya_overdue");
    assert.deepEqual(detail.assignment.photos, result.photos);
    const list = await mock.api.studentWork.listHomeworks();
    assert.equal(list.assignments.find((entry) => entry.id === "hw_ilya_overdue")?.photosCount, 3);

    // A second call appends: the result carries only the created photos.
    const second = await mock.api.studentWork.uploadHomeworkPhotos("hw_ilya_overdue", [photo("page-4.jpg")]);
    assert.deepEqual([second.photos.length, second.photos[0]?.originalName, second.photosCount], [1, "page-4.jpg", 4]);
    assert.deepEqual((await mock.api.studentWork.getHomework("hw_ilya_overdue")).assignment.photos.map((entry) => entry.originalName), ["стр 1.JPG", "page-2.jpeg", "page-3.png", "page-4.jpg"]);
  });

  it("rejects malformed uploads with the upload classes, in the site's order", async () => {
    const mock = await ilya();
    const upload = (files: unknown) => mock.api.studentWork.uploadHomeworkPhotos("hw_ilya_overdue", files as PhotoUpload[]);

    assert.equal((await rejects(upload([]), "uploadInvalid", 400)).message, "Некорректные данные для загрузки фото.");
    await rejects(upload(undefined), "uploadInvalid", 400);
    await rejects(upload([photo("a.jpg"), photo("b.jpg", 0)]), "uploadInvalid", 400);
    await rejects(upload([photo("a.jpg", -5)]), "uploadInvalid", 400);
    await rejects(upload([photo("a.jpg", Number.NaN)]), "uploadInvalid", 400);

    // The 15 MiB sum is checked before the files are looked at one by one.
    const tooLarge = await rejects(upload([photo("a.jpg", 15 * MIB), photo("b.gif", 1)]), "uploadTooLarge", 413);
    assert.equal(tooLarge.message, "Суммарный размер фотографий не должен превышать 15 МБ.");
    await rejects(upload([photo("a.jpg", 15 * MIB + 1)]), "uploadTooLarge", 413);

    const emptyName = await rejects(upload([photo("   ")]), "uploadBadName", 400);
    assert.deepEqual([emptyName.message, emptyName.params], ["Имя файла должно содержать не больше 255 символов.", { max: 255 }]);
    const longName = await rejects(upload([photo(`${"a".repeat(252)}.jpg`)]), "uploadBadName", 400);
    assert.deepEqual(longName.params, { max: 255 });
    const badChars = await rejects(upload([photo("a\u0007b.jpg")]), "uploadBadName", 400);
    assert.deepEqual([badChars.message, badChars.params], ["Имя файла содержит недопустимые символы.", undefined]);

    assert.equal((await rejects(upload([photo("scan.gif", 1000, "image/gif")]), "uploadUnsupportedType", 400)).message, "Поддерживаются только PDF, DOCX, PNG и JPG.");
    assert.equal((await rejects(upload([photo("scan.heic", 1000, "image/heic")]), "uploadUnsupportedType", 400)).message, "Поддерживаются только PDF, DOCX, PNG и JPG.");
    assert.equal((await rejects(upload([photo("scan.png", 1000, "image/jpeg")]), "uploadUnsupportedType", 400)).message, "Тип файла не соответствует его расширению.");
    // A valid PDF / DOCX passes the generic metadata rules and is refused as "not a photo".
    assert.equal((await rejects(upload([photo("solution.pdf", 1000, "application/pdf")]), "uploadUnsupportedType", 400)).message, "Можно загружать только фото в формате PNG или JPG.");
    await rejects(upload([photo("ok.jpg"), photo("solution.docx", 1000, "")]), "uploadUnsupportedType", 400);

    mock.setLocale("en");
    assert.equal((await rejects(upload([photo("solution.pdf", 1000, "application/pdf")]), "uploadUnsupportedType", 400)).message, "Only PNG or JPG photos can be uploaded.");
    assert.equal((await rejects(upload([photo(`${"a".repeat(300)}.jpg`)]), "uploadBadName", 400)).message, "The file name must be at most 255 characters.");

    // Nothing was stored by any of the refused calls.
    assert.equal(mock.store.homeworkPhotos.by("assignmentId", "hw_ilya_overdue").length, 0);
    assert.equal(mock.store.files.count((file) => file.localUri !== null), 0);
  });

  it("accepts the boundary values: 255 characters of name and exactly 15 MiB in total", async () => {
    const mock = await ilya();
    const name = `${"я".repeat(251)}.jpg`;
    assert.equal(name.length, 255);
    const result = await mock.api.studentWork.uploadHomeworkPhotos("hw_ilya_overdue", [photo(name, 15 * MIB - 10), photo("b.png", 10)]);
    assert.deepEqual([result.photosCount, result.photos[0]?.originalName], [2, name]);
    assert.equal(mock.store.files.get(result.photos[0]?.fileId)?.size, 15 * MIB - 10);
  });

  it("validates the files before it looks the homework up, then answers 404 for a foreign homework", async () => {
    const mock = await ilya();
    await rejects(mock.api.studentWork.uploadHomeworkPhotos("hw_maria_done1", []), "uploadInvalid", 400);
    await rejects(mock.api.studentWork.uploadHomeworkPhotos("hw_maria_done1", [photo("a.gif")]), "uploadUnsupportedType", 400);
    for (const id of ["hw_maria_done1", "hw_missing"]) {
      const error = await rejects(mock.api.studentWork.uploadHomeworkPhotos(id, [photo()]), "homeworkNotFound", 404);
      assert.equal(error.message, "ДЗ не найдено.");
    }
    assert.equal(mock.store.files.count((file) => file.localUri !== null), 0);
  });

  it("limits the photos attached at once: photoLimit with params.max, all or nothing", async () => {
    const mock = createTestMock();
    await mock.signIn("polina@example.com");
    const full = await rejects(mock.api.studentWork.uploadHomeworkPhotos("hw_polina_limit", [photo()]), "photoLimit", 400);
    assert.deepEqual([full.message, full.params], ["К одному ДЗ можно прикрепить не больше 10 фото.", { max: 10 }]);
    mock.setLocale("en");
    assert.equal((await rejects(mock.api.studentWork.uploadHomeworkPhotos("hw_polina_limit", [photo()]), "photoLimit", 400)).message, "You can attach at most 10 photos to one homework.");

    // The setting moved: one free slot.
    mock.store.patchSettings({ maxPhotosPerAssignment: 11 });
    assert.equal((await mock.api.studentWork.uploadHomeworkPhotos("hw_polina_limit", [photo()])).photosCount, 11);

    const other = await ilya();
    // `hw_ilya_today` has one photo: nine more fit, ten do not — and then none of the ten is stored.
    await rejects(other.api.studentWork.uploadHomeworkPhotos("hw_ilya_today", photos(10)), "photoLimit", 400);
    assert.equal(other.store.homeworkPhotos.by("assignmentId", "hw_ilya_today").length, 1);
    assert.equal((await other.api.studentWork.uploadHomeworkPhotos("hw_ilya_today", photos(9))).photosCount, 10);
    await rejects(other.api.studentWork.uploadHomeworkPhotos("hw_ilya_today", [photo()]), "photoLimit", 400);

    other.store.patchSettings({ maxPhotosPerAssignment: 1 });
    const single = await rejects(other.api.studentWork.uploadHomeworkPhotos("hw_ilya_overdue", photos(2)), "photoLimit", 400);
    assert.deepEqual([single.message, single.params], ["К одному ДЗ можно прикрепить не больше 1 фото.", { max: 1 }]);
  });

  it("shares the 60 / 60 s bucket with the delete call and is checked before the files", async () => {
    const mock = await ilya();
    for (let call = 0; call < 59; call += 1) await rejects(mock.api.studentWork.uploadHomeworkPhotos("hw_ilya_overdue", []), "uploadInvalid", 400);
    assert.equal((await mock.api.studentWork.deleteHomeworkPhoto("hw_ilya_open", "hwp_ilya_open_1")).photosCount, 2);

    mock.clock.advance(20_000);
    const upload = await rejects(mock.api.studentWork.uploadHomeworkPhotos("hw_ilya_overdue", []), "rateLimited", 429);
    assert.deepEqual([upload.retryAfterSeconds, upload.message], [40, "Слишком много запросов. Подождите немного и попробуйте снова."]);
    await rejects(mock.api.studentWork.deleteHomeworkPhoto("hw_ilya_open", "hwp_ilya_open_2"), "rateLimited", 429);
    assert.equal(mock.store.homeworkPhotos.by("assignmentId", "hw_ilya_open").length, 2);

    mock.clock.advance(40_000);
    assert.equal((await mock.api.studentWork.uploadHomeworkPhotos("hw_ilya_overdue", [photo()])).photosCount, 1);
  });
});

describe("studentWork.deleteHomeworkPhoto", () => {
  it("removes an attached photo together with its file and reports the new count", async () => {
    const removed: string[] = [];
    const mock = await ilya({ onFileRemoved: (fileId) => removed.push(fileId) });
    const events = recordEvents(mock);
    const fileId = mock.store.homeworkPhotos.get("hwp_ilya_open_2")?.fileId ?? "";

    assert.deepEqual(await mock.api.studentWork.deleteHomeworkPhoto("hw_ilya_open", "hwp_ilya_open_2"), { photosCount: 2 });
    assert.equal(mock.store.homeworkPhotos.has("hwp_ilya_open_2"), false);
    assert.equal(mock.store.files.has(fileId), false);
    assert.deepEqual(removed, [fileId]);
    assert.deepEqual(events, [{ kind: "student-progress-changed", studentId: "usr_ilya", topicId: "top_derivative" }]);
    assert.deepEqual((await mock.api.studentWork.getHomework("hw_ilya_open")).assignment.photos.map((entry) => entry.id), ["hwp_ilya_open_1", "hwp_ilya_open_3"]);

    // Deleting it again is the same 404 as a photo that never existed.
    await rejects(mock.api.studentWork.deleteHomeworkPhoto("hw_ilya_open", "hwp_ilya_open_2"), "photoNotFound", 404);
  });

  it("keeps the file of a photo that a check has already snapshotted", async () => {
    const mock = await ilya();
    // The two failed checks of `hw_ilya_failed` point at the photos that are still attached.
    const attached = mock.ctx.q.homeworkPhotos("hw_ilya_failed")[0]!;
    assert.ok(mock.store.homeworkCheckPhotos.by("fileId", attached.fileId).length > 0);
    assert.deepEqual(await mock.api.studentWork.deleteHomeworkPhoto("hw_ilya_failed", attached.id), { photosCount: 1 });
    assert.equal(mock.store.files.has(attached.fileId), true);
  });

  it("answers 404 photoNotFound for a missing photo, another homework's photo and another student's photo", async () => {
    const mock = await ilya();
    const cases: [string, string][] = [
      ["hw_ilya_open", "hwp_missing"],
      // A photo of another homework of the same student: the path must name its own homework.
      ["hw_ilya_open", "hwp_ilya_failed_1"],
      ["hw_ilya_failed", "hwp_ilya_open_1"],
      // Another student's photo, addressed through either homework id.
      ["hw_polina_limit", "hwp_polina_limit_1"],
      ["hw_ilya_open", "hwp_polina_limit_1"],
      ["hw_missing", "hwp_ilya_open_1"],
    ];
    for (const [assignmentId, photoId] of cases) {
      const error = await rejects(mock.api.studentWork.deleteHomeworkPhoto(assignmentId, photoId), "photoNotFound", 404);
      assert.equal(error.message, "Фото не найдено.", `${assignmentId} / ${photoId}`);
    }
    assert.equal(mock.store.homeworkPhotos.by("assignmentId", "hw_ilya_open").length, 3);
    assert.equal(mock.store.homeworkPhotos.by("assignmentId", "hw_polina_limit").length, 10);
  });

  it("is rate limited before the photo is looked up", async () => {
    const mock = await ilya();
    mock.api.controls.exhaust("api:homework-submissions", "usr_ilya");
    const error = await rejects(mock.api.studentWork.deleteHomeworkPhoto("hw_ilya_open", "hwp_missing"), "rateLimited", 429);
    assert.equal(error.retryAfterSeconds, 60);
  });
});

describe("studentWork.startHomeworkCheck", () => {
  it("creates a PENDING check with a snapshot of the batch and takes one hourly and one daily slot", async () => {
    const mock = await ilya();
    const { check } = await mock.api.studentWork.startHomeworkCheck("hw_ilya_open");
    assert.deepEqual({ ...check, id: "" }, { id: "", status: "PENDING", errorCode: null, createdAt: TEST_T0, checkedAt: null, results: [] });

    const row = mock.store.homeworkChecks.get(check.id);
    assert.deepEqual([row?.assignmentId, row?.status, row?.activeSlot, row?.error], ["hw_ilya_open", "PENDING", 1, null]);
    // The snapshot keeps the upload order.
    const attached = mock.ctx.q.homeworkPhotos("hw_ilya_open").map((entry) => entry.fileId);
    assert.deepEqual(mock.ctx.q.checkPhotos(check.id).map((entry) => [entry.fileId, entry.order]), attached.map((fileId, order) => [fileId, order]));
    assert.deepEqual(mock.ctx.jobs.pending(check.id).map((job) => [job.kind, job.dueAt, job.payload.locale]).sort(), [
      ["homeworkCheck.begin", T0 + 1000, "ru"],
      ["homeworkCheck.finish", T0 + 8000, "ru"],
    ]);
    assert.equal(mock.store.limiterBuckets.get("api:homework-checks|usr_ilya")?.hits, 1);
    assert.equal(budgetHits(mock, "api:homework-checks:global"), 1);

    // The detail and the list show the running check; the photos stay attached while it runs.
    const detail = await mock.api.studentWork.getHomework("hw_ilya_open");
    assert.deepEqual([detail.assignment.latestCheck?.id, detail.assignment.latestCheck?.status, detail.assignment.photos.length], [check.id, "PENDING", 3]);
    assert.equal((await mock.api.studentWork.listHomeworks()).assignments.find((entry) => entry.id === "hw_ilya_open")?.latestCheckStatus, "PENDING");
  });

  it("runs on the mock clock: CHECKING after 1 s, three verdicts after 8 s with every side effect (example 1)", async () => {
    const mock = await ilya();
    const events = recordEvents(mock);
    const checkId = await startCheck(mock, "hw_ilya_overdue", 3);
    const batch = mock.ctx.q.homeworkPhotos("hw_ilya_overdue").map((entry) => entry.fileId);
    events.length = 0;

    mock.clock.advance(999);
    assert.equal((await mock.api.studentWork.getLatestHomeworkCheck("hw_ilya_overdue")).check?.status, "PENDING");
    mock.clock.advance(1);
    const checking = await mock.api.studentWork.getLatestHomeworkCheck("hw_ilya_overdue");
    assert.deepEqual([checking.check?.status, checking.check?.checkedAt, checking.photos.length, checking.solvedCount], ["CHECKING", null, 3, 0]);
    mock.clock.advance(6999);
    assert.equal((await mock.api.studentWork.getLatestHomeworkCheck("hw_ilya_overdue")).check?.status, "CHECKING");
    assert.deepEqual(events, []);

    mock.clock.advance(1);
    const done = await mock.api.studentWork.getLatestHomeworkCheck("hw_ilya_overdue");
    const doneAt = new Date(T0 + 8000).toISOString();
    assert.deepEqual(done, {
      check: {
        id: checkId,
        status: "DONE",
        errorCode: null,
        createdAt: TEST_T0,
        checkedAt: doneAt,
        results: [
          { number: "118", homeworkNumberId: "num_118", verdict: "CORRECT", recognizedAnswer: "совпадает с эталоном", comment: "Верно." },
          { number: "120", homeworkNumberId: "num_120", verdict: "INCORRECT", recognizedAnswer: "x = 3", comment: "Ошибка вычислительного характера — пересчитай выкладки внимательнее." },
          { number: "124", homeworkNumberId: "num_124", verdict: "UNCERTAIN", recognizedAnswer: null, comment: "Не удалось уверенно разобрать решение по фото. Покажи его учителю — он проверит вручную." },
        ],
      },
      // The checked batch left the homework.
      photos: [],
      numbers: [
        { homeworkNumberId: "num_118", status: "YELLOW" },
        { homeworkNumberId: "num_120", status: "RED" },
        { homeworkNumberId: "num_124", status: null },
      ],
      solvedCount: 1,
    });
    assertNoPrivateFields(done);

    // Statuses through the progress writer: RED → YELLOW ("solved after a failure"), null → RED, uncertain → untouched.
    const history = mock.store.progressEvents.filter((event) => event.context.checkId === checkId);
    assert.deepEqual(
      history.map((event) => [event.homeworkNumberId, event.source, event.previousStatus, event.status, event.decision, event.actorId]).sort(),
      [
        ["num_118", "homework_check", "RED", "YELLOW", "changed", null],
        ["num_120", "homework_check", null, "RED", "changed", null],
        ["num_124", "homework_check", null, null, "uncertain", null],
      ],
    );
    assert.equal(mock.ctx.q.status("usr_ilya", "num_118")?.statusChangedAt, doneAt);

    // The photos live on in the check history (the teacher sees them there); the files are not deleted.
    assert.deepEqual(mock.ctx.q.checkPhotos(checkId).map((entry) => entry.fileId), batch);
    assert.equal(mock.store.homeworkPhotos.by("assignmentId", "hw_ilya_overdue").length, 0);
    for (const fileId of batch) assert.ok(mock.ctx.files.lookup(fileId));

    // Diagnostics are stored for the teacher and the planner only.
    const stored = mock.ctx.q.checkResults(checkId).find((row) => row.homeworkNumberId === "num_120");
    assert.deepEqual([stored?.errorKind, stored?.confidence, typeof stored?.errorNote], ["ARITHMETIC", 0.88, "string"]);
    assert.deepEqual([mock.store.homeworkChecks.get(checkId)?.activeSlot, mock.store.homeworkChecks.get(checkId)?.modelUsed], [null, "mock"]);

    assert.deepEqual(events, [{ kind: "student-progress-changed", studentId: "usr_ilya", topicId: "top_linear" }]);

    const bell = await mock.api.shell.listNotifications();
    const notification = bell.notifications[0]!;
    assert.deepEqual(
      [notification.type, notification.params, notification.href, notification.target, notification.readAt, notification.createdAt],
      ["homework-checked", { correct: 1, incorrect: 1, uncertain: 1, applied: 2 }, "/student/homeworks/hw_ilya_overdue", { screen: "student.homework", assignmentId: "hw_ilya_overdue" }, null, doneAt],
    );
    assert.equal(notification.title, "Результат автопроверки готов");

    const journal = mock.store.auditLogs.filter((row) => row.action === "solution.check" && row.targetId === "hw_ilya_overdue" && row.createdAt === doneAt);
    assert.equal(journal.length, 1);
    assert.deepEqual(
      [journal[0]?.category, journal[0]?.outcome, journal[0]?.actorId, journal[0]?.actorRole, journal[0]?.targetType, journal[0]?.model, journal[0]?.summary, journal[0]?.durationMs],
      ["AI", "ok", "usr_ilya", "STUDENT", "HomeworkAssignment", "mock", "Автопроверка: верно 1, с ошибкой 1, не распознано 1", 8000],
    );
    assert.equal(mock.ctx.jobs.pending(checkId).length, 0);
    assert.equal(mock.ctx.jobs.lastError(), null);

    // The shared store: other members read the new colours.
    assert.equal((await mock.api.studentWork.listHomeworks()).assignments.find((entry) => entry.id === "hw_ilya_overdue")?.solvedCount, 1);

    // Second and third batch (example 1 continued): the homework gets completed.
    await startCheck(mock, "hw_ilya_overdue", 2);
    mock.clock.advance(8000);
    assert.deepEqual((await mock.api.studentWork.getLatestHomeworkCheck("hw_ilya_overdue")).numbers.map((entry) => entry.status), ["YELLOW", "YELLOW", "RED"]);
    await startCheck(mock, "hw_ilya_overdue", 1);
    mock.clock.advance(8000);
    const last = await mock.api.studentWork.getLatestHomeworkCheck("hw_ilya_overdue");
    assert.deepEqual([last.numbers.map((entry) => entry.status), last.solvedCount], [["YELLOW", "YELLOW", "YELLOW"], 3]);
    assert.equal((await mock.api.studentWork.listHomeworks()).assignments.find((entry) => entry.id === "hw_ilya_overdue")?.attentionRank, 5);
  });

  it("never lowers a colour: a completed homework stays as it is (example 2)", async () => {
    const mock = await ilya();
    const events = recordEvents(mock);
    const checkId = await startCheck(mock, "hw_ilya_done", 2);
    events.length = 0;
    mock.clock.advance(8000);

    const done = await mock.api.studentWork.getLatestHomeworkCheck("hw_ilya_done");
    assert.deepEqual(done.check?.results.map((result) => [result.number, result.verdict]), [["112", "CORRECT"], ["113", "INCORRECT"]]);
    assert.deepEqual(done.numbers.map((entry) => entry.status), ["GREEN", "YELLOW"]);
    assert.deepEqual(
      mock.store.progressEvents.filter((event) => event.context.checkId === checkId).map((event) => [event.homeworkNumberId, event.decision]).sort(),
      [["num_112", "unchanged"], ["num_113", "downgrade_blocked"]],
    );
    // Nothing was applied: no progress event for the dashboards, and the notification says so.
    assert.deepEqual(events, []);
    const notification = (await mock.api.shell.listNotifications()).notifications[0]!;
    assert.deepEqual(notification.params, { correct: 1, incorrect: 1, uncertain: 0, applied: 0 });
    assert.ok(notification.body?.includes("Статусы не изменены"));
  });

  it("gives a verdict only to as many unsolved numbers as there are photos (example 3)", async () => {
    const mock = await ilya();
    const solvedBefore = (await mock.api.shell.getStreak()).streak.solvedToday;
    await mock.api.studentWork.startHomeworkCheck("hw_ilya_today");
    mock.clock.advance(8000);
    const done = await mock.api.studentWork.getLatestHomeworkCheck("hw_ilya_today");
    assert.deepEqual(done.check?.results.map((result) => [result.number, result.verdict]), [["218", "CORRECT"]]);
    assert.deepEqual(done.numbers, [{ homeworkNumberId: "num_218", status: "GREEN" }, { homeworkNumberId: "num_220", status: null }]);
    // One shared store: the colour written by the check is what the streak of the shell counts.
    assert.equal((await mock.api.shell.getStreak()).streak.solvedToday, solvedBefore + 1);
    assert.deepEqual((await mock.api.shell.listNotifications()).notifications[0]?.params, { correct: 1, incorrect: 0, uncertain: 0, applied: 1 });
  });

  it("keeps photos attached after the start as the next batch and writes comments in the request language", async () => {
    const mock = await ilya();
    mock.setLocale("en");
    await startCheck(mock, "hw_ilya_overdue", 2);
    const late = await mock.api.studentWork.uploadHomeworkPhotos("hw_ilya_overdue", [photo("late.jpg")]);
    assert.equal(late.photosCount, 3);

    // The language of the comments is the one of the request that started the check, not of the poll.
    mock.setLocale("ru");
    mock.clock.advance(8000);
    const done = await mock.api.studentWork.getLatestHomeworkCheck("hw_ilya_overdue");
    assert.deepEqual(done.check?.results.map((result) => [result.number, result.comment]), [
      ["118", "Correct."],
      ["120", "A calculation error — recheck your working carefully."],
    ]);
    assert.deepEqual(done.photos.map((entry) => entry.originalName), ["late.jpg"]);
  });

  it("yields to a mark the teacher made after the check was started", async () => {
    const mock = await ilya();
    const checkId = await startCheck(mock, "hw_ilya_today", 0);
    mock.clock.advance(3000);
    const teacher = mock.ctx.q.user("usr_anna")!;
    mock.ctx.progress.write({ source: "teacher", status: "RED", studentId: "usr_ilya", homeworkNumberId: "num_218", actor: teacher });
    mock.clock.advance(5000);

    const done = await mock.api.studentWork.getLatestHomeworkCheck("hw_ilya_today");
    assert.equal(done.check?.results[0]?.verdict, "CORRECT");
    assert.equal(done.numbers[0]?.status, "RED");
    assert.deepEqual(mock.store.progressEvents.filter((event) => event.context.checkId === checkId).map((event) => event.decision), ["newer_status"]);
    assert.equal((await mock.api.shell.listNotifications()).notifications[0]?.params?.applied, 0);
  });

  it("refuses in the site's order: queue, hourly limit, switch, ownership, photos, numbers, running check", async () => {
    const mock = await ilya();
    const start = (id: string) => mock.api.studentWork.startHomeworkCheck(id);
    const hourly = () => mock.store.limiterBuckets.get("api:homework-checks|usr_ilya")?.hits ?? 0;

    // 1. The queue is checked first and consumes nothing.
    mock.api.controls.set("checkQueueFull", true);
    const queue = await rejects(start("hw_missing"), "queueFull", 503);
    assert.deepEqual([queue.retryAfterSeconds, queue.message], [120, "Очередь автопроверки переполнена. Попробуйте через несколько минут."]);
    assert.equal(hourly(), 0);
    mock.api.controls.set("checkQueueFull", false);

    // 3. The switch: 503 without a retry time — and the hourly slot is already gone.
    mock.store.patchSettings({ aiEnabled: false });
    const disabled = await rejects(start("hw_missing"), "checkDisabled", 503);
    assert.deepEqual([disabled.retryAfterSeconds, disabled.message], [undefined, "Автоматическая проверка сейчас отключена. Попросите разработчика включить её."]);
    assert.equal(hourly(), 1);
    mock.store.patchSettings({ aiEnabled: true });

    // 5. Ownership.
    for (const id of ["hw_missing", "hw_maria_done1"]) assert.equal((await rejects(start(id), "homeworkNotFound", 404)).message, "ДЗ не найдено.");
    // 6. No attached photo.
    assert.equal((await rejects(start("hw_ilya_overdue"), "attachPhotosFirst", 400)).message, "Сначала прикрепите фото решения.");
    // 7. No numbers (the photo check comes first, so the homework needs a photo to get here).
    for (const link of mock.store.homeworkNumbers.by("assignmentId", "hw_ilya_today")) mock.store.homeworkNumbers.delete(link.id);
    assert.equal((await rejects(start("hw_ilya_today"), "noNumbers", 400)).message, "В этом ДЗ нет номеров для проверки.");
    // 8. One active check per homework.
    await start("hw_ilya_open");
    assert.equal((await rejects(start("hw_ilya_open"), "alreadyRunning", 409)).message, "Проверка уже идёт — дождитесь результата.");
    mock.clock.advance(1000);
    await rejects(start("hw_ilya_open"), "alreadyRunning", 409);

    // Every attempt after the queue check took an hourly slot; only the started check took a daily one.
    assert.equal(hourly(), 8);
    assert.equal(budgetHits(mock, "api:homework-checks:global"), 1);
    assert.equal(mock.store.homeworkChecks.count((check) => check.activeSlot === 1 && check.assignmentId.startsWith("hw_ilya")), 1);

    // 2. The hourly limit (default 10) is consumed before any validation: two more attempts, then 429.
    await rejects(start("hw_missing"), "homeworkNotFound", 404);
    await rejects(start("hw_missing"), "homeworkNotFound", 404);
    const limited = await rejects(start("hw_ilya_failed"), "rateLimited", 429);
    assert.deepEqual([limited.retryAfterSeconds, limited.message], [3599, "Слишком много запросов. Подождите немного и попробуйте снова."]);
    // The limit beats the switch; the queue beats the limit.
    mock.store.patchSettings({ aiEnabled: false });
    await rejects(start("hw_ilya_failed"), "rateLimited", 429);
    mock.api.controls.set("checkQueueFull", true);
    await rejects(start("hw_ilya_failed"), "queueFull", 503);
  });

  it("follows the per-student hourly limit of the settings and frees it at the hour boundary", async () => {
    const mock = await ilya();
    mock.store.patchSettings({ aiPerStudentHourlyLimit: 1 });
    await mock.api.studentWork.startHomeworkCheck("hw_ilya_open");
    mock.clock.advance(30 * MINUTE_MS);
    const limited = await rejects(mock.api.studentWork.startHomeworkCheck("hw_ilya_failed"), "rateLimited", 429);
    assert.equal(limited.retryAfterSeconds, 1800);
    mock.clock.advance(30 * MINUTE_MS);
    assert.equal((await mock.api.studentWork.startHomeworkCheck("hw_ilya_failed")).check.status, "PENDING");
  });

  it("answers 503 queueFull when 60 checks are really waiting", async () => {
    const mock = await ilya();
    const template = mock.store.submissions.get("sub_les_live_polina_010208_1")!;
    assert.equal(template.status, "PENDING");
    for (let index = 0; index < 58; index += 1) mock.store.submissions.insert({ ...template, id: `sub_waiting_${index}`, activeSlot: null });
    // 59 waiting: there is room for one more.
    await mock.api.studentWork.startHomeworkCheck("hw_ilya_open");
    const error = await rejects(mock.api.studentWork.startHomeworkCheck("hw_ilya_failed"), "queueFull", 503);
    assert.equal(error.retryAfterSeconds, 120);
  });

  it("takes the school-wide daily budget last and removes the row again when it is exhausted", async () => {
    const mock = await ilya();
    mock.api.controls.exhaust("api:homework-checks:global", "global");
    const before = mock.store.homeworkChecks.count();
    const snapshotsBefore = mock.store.homeworkCheckPhotos.count();

    const error = await rejects(mock.api.studentWork.startHomeworkCheck("hw_ilya_open"), "rateLimited", 429);
    // Fixed window aligned to 00:00 UTC: 15 hours from 09:00 UTC.
    assert.deepEqual([error.retryAfterSeconds, error.message], [15 * 3600, "Слишком много запросов. Подождите немного и попробуйте снова."]);
    assert.equal(mock.store.homeworkChecks.count(), before);
    assert.equal(mock.store.homeworkCheckPhotos.count(), snapshotsBefore);
    assert.equal(mock.ctx.q.activeHomeworkCheck("hw_ilya_open"), undefined);
    assert.equal(mock.store.jobs.count((job) => job.kind.startsWith("homeworkCheck") && job.state === "armed"), 0);
    // The photos are still attached and their files alive.
    const detail = await mock.api.studentWork.getHomework("hw_ilya_open");
    assert.deepEqual([detail.assignment.photos.length, detail.assignment.latestCheck], [3, null]);
    for (const entry of detail.assignment.photos) assert.ok(mock.store.files.has(entry.fileId));
    // A refused attempt still burned the hourly slot.
    assert.equal(mock.store.limiterBuckets.get("api:homework-checks|usr_ilya")?.hits, 1);

    // One second before the boundary it is still refused; at 00:00 UTC the next start succeeds.
    mock.clock.advance(15 * HOUR_MS - 1000);
    assert.equal((await rejects(mock.api.studentWork.startHomeworkCheck("hw_ilya_open"), "rateLimited", 429)).retryAfterSeconds, 1);
    mock.clock.advance(1000);
    assert.equal((await mock.api.studentWork.startHomeworkCheck("hw_ilya_open")).check.status, "PENDING");
  });

  it("fails with each error class on demand; nothing is detached and no status changes (control)", async () => {
    const classes: CheckErrorCode[] = ["interrupted", "disabled", "timeout", "quota", "unavailable", "queue", "image", "unknown"];
    for (const errorClass of classes) {
      const mock = await ilya();
      const events = recordEvents(mock);
      const notifications = mock.store.notifications.count();
      const checkId = await startCheck(mock, "hw_ilya_overdue", 2);
      events.length = 0;
      mock.api.controls.set("nextCheckOutcome", { kind: "failed", errorClass });
      mock.clock.advance(8000);

      const failed = await mock.api.studentWork.getLatestHomeworkCheck("hw_ilya_overdue");
      assert.deepEqual([failed.check?.status, failed.check?.errorCode, failed.check?.results, failed.check?.checkedAt], ["FAILED", errorClass, [], new Date(T0 + 8000).toISOString()], errorClass);
      assert.equal(failed.photos.length, 2, errorClass);
      assert.deepEqual(failed.numbers.map((entry) => entry.status), ["RED", null, null], errorClass);
      assert.equal(mock.store.notifications.count(), notifications, errorClass);
      assert.deepEqual(events, [], errorClass);
      assert.equal(mock.store.progressEvents.count((event) => event.context.checkId === checkId), 0, errorClass);
      // The raw text is stored for the staff, never sent to the student.
      const raw = mock.store.homeworkChecks.get(checkId)?.error ?? "";
      assert.ok(raw.length > 0, errorClass);
      assert.equal(JSON.stringify(failed).includes(raw), false, errorClass);

      // A failure before the model stage gives the daily slot back and leaves no journal row.
      const preModel = errorClass === "disabled" || errorClass === "image";
      assert.equal(budgetHits(mock, "api:homework-checks:global"), preModel ? 0 : 1, errorClass);
      const journal = mock.store.auditLogs.filter((row) => row.action === "solution.check" && row.targetId === "hw_ilya_overdue" && row.outcome === "failed" && row.model === "mock");
      assert.equal(journal.length, preModel ? 0 : 1, errorClass);
      if (!preModel) assert.deepEqual([journal[0]?.category, journal[0]?.actorId, journal[0]?.error, journal[0]?.summary], ["AI", "usr_ilya", raw, "Автопроверка не удалась"], errorClass);

      // The control is one-shot and the student may retry: the next check runs by the rule.
      assert.equal(mock.api.controls.get().nextCheckOutcome, null, errorClass);
      await mock.api.studentWork.startHomeworkCheck("hw_ilya_overdue");
      mock.clock.advance(8000);
      assert.equal((await mock.api.studentWork.getLatestHomeworkCheck("hw_ilya_overdue")).check?.status, "DONE", errorClass);
    }
  });

  it("finishes DONE with empty results or with forced verdicts on demand (control)", async () => {
    const mock = await ilya();
    await startCheck(mock, "hw_ilya_overdue", 3);
    mock.api.controls.set("nextCheckOutcome", { kind: "doneEmpty" });
    mock.clock.advance(8000);
    const empty = await mock.api.studentWork.getLatestHomeworkCheck("hw_ilya_overdue");
    assert.deepEqual([empty.check?.status, empty.check?.results, empty.photos], ["DONE", [], []]);
    assert.deepEqual(empty.numbers.map((entry) => entry.status), ["RED", null, null]);
    assert.deepEqual((await mock.api.shell.listNotifications()).notifications[0]?.params, { correct: 0, incorrect: 0, uncertain: 0, applied: 0 });

    await startCheck(mock, "hw_ilya_overdue", 3);
    mock.api.controls.set("nextCheckOutcome", { kind: "verdicts", verdicts: ["INCORRECT", "CORRECT"] });
    mock.clock.advance(8000);
    const forced = await mock.api.studentWork.getLatestHomeworkCheck("hw_ilya_overdue");
    // By index of the found numbers; the third falls back to the cycle (index 2 → UNCERTAIN).
    assert.deepEqual(forced.check?.results.map((result) => result.verdict), ["INCORRECT", "CORRECT", "UNCERTAIN"]);
    assert.deepEqual(forced.numbers.map((entry) => entry.status), ["RED", "GREEN", null]);
    assert.equal(mock.api.controls.get().nextCheckOutcome, null);
  });

  it("fails before the model when checking was switched off after the start, and refunds the daily slot", async () => {
    const mock = await ilya();
    const checkId = await startCheck(mock, "hw_ilya_open", 0);
    mock.store.patchSettings({ aiEnabled: false });
    mock.clock.advance(1000);
    const failed = await mock.api.studentWork.getLatestHomeworkCheck("hw_ilya_open");
    assert.deepEqual([failed.check?.status, failed.check?.errorCode, failed.photos.length], ["FAILED", "disabled", 3]);
    assert.equal(mock.store.homeworkChecks.get(checkId)?.error, "Автопроверка отключена разработчиком.");
    assert.equal(budgetHits(mock, "api:homework-checks:global"), 0);
    // The later "finish" job finds a finished check and does nothing.
    mock.clock.advance(7000);
    assert.equal((await mock.api.studentWork.getLatestHomeworkCheck("hw_ilya_open")).check?.status, "FAILED");
    assert.equal(mock.ctx.jobs.lastError(), null);
  });

  it("stores a low-confidence verdict as UNCERTAIN when the threshold of the settings is above it", async () => {
    const mock = await ilya();
    mock.store.patchSettings({ aiMinConfidence: 0.9 });
    await startCheck(mock, "hw_ilya_overdue", 2);
    mock.clock.advance(8000);
    const done = await mock.api.studentWork.getLatestHomeworkCheck("hw_ilya_overdue");
    // CORRECT (0.93) stays; INCORRECT (0.88) is below 0.9.
    assert.deepEqual(done.check?.results.map((result) => [result.number, result.verdict, result.recognizedAnswer]), [["118", "CORRECT", "совпадает с эталоном"], ["120", "UNCERTAIN", null]]);
    assert.deepEqual(done.numbers.map((entry) => entry.status), ["YELLOW", null, null]);
  });

  it("keeps only the newest finished checks of a student and deletes older ones with their photos", async () => {
    const removed: string[] = [];
    const mock = await ilya({ onFileRemoved: (fileId) => removed.push(fileId) });
    const before = mock.ctx.q.homeworksOfStudent("usr_ilya").flatMap((assignment) => mock.ctx.q.homeworkChecks(assignment.id));
    assert.ok(before.length >= 8);
    const oldPhotoFiles = before.flatMap((check) => mock.ctx.q.checkPhotos(check.id).map((entry) => entry.fileId));

    mock.store.patchSettings({ completedChecksKept: 1 });
    const checkId = await startCheck(mock, "hw_ilya_today", 0);
    mock.clock.advance(8000);
    await mock.api.studentWork.getLatestHomeworkCheck("hw_ilya_today");

    const after = mock.ctx.q.homeworksOfStudent("usr_ilya").flatMap((assignment) => mock.ctx.q.homeworkChecks(assignment.id));
    assert.deepEqual(after.map((check) => check.id), [checkId]);
    assert.equal(mock.store.homeworkCheckResults.count((row) => before.some((check) => check.id === row.checkId)), 0);
    // Snapshot files nothing references any more are gone; the two still attached to `hw_ilya_failed` survive.
    const stillAttached = new Set(mock.ctx.q.homeworkPhotos("hw_ilya_failed").map((entry) => entry.fileId));
    for (const fileId of oldPhotoFiles) assert.equal(mock.store.files.has(fileId), stillAttached.has(fileId));
    assert.deepEqual([...removed].sort(), oldPhotoFiles.filter((fileId) => !stillAttached.has(fileId)).sort());
    // Other students are not touched.
    assert.ok(mock.ctx.q.homeworkChecks("hw_maria_done1").length > 0);
    assert.equal((await mock.api.studentWork.getHomework("hw_ilya_done")).assignment.latestCheck, null);
  });

  it("finishes the seeded running check 8 s after its first read (coverage: check.running)", async () => {
    const mock = createTestMock();
    await mock.signIn("artem@example.com");
    // The timer does not run while nobody looks at the check.
    mock.clock.advance(10 * MINUTE_MS);
    await mock.api.studentWork.listHomeworks();
    const first = await mock.api.studentWork.getHomework("hw_artem_running");
    assert.deepEqual([first.assignment.latestCheck?.id, first.assignment.latestCheck?.status, first.assignment.photos.length], ["chk_artem_running_1", "CHECKING", 2]);
    await rejects(mock.api.studentWork.startHomeworkCheck("hw_artem_running"), "alreadyRunning", 409);

    mock.clock.advance(7999);
    assert.equal((await mock.api.studentWork.getLatestHomeworkCheck("hw_artem_running")).check?.status, "CHECKING");
    mock.clock.advance(1);
    const done = await mock.api.studentWork.getLatestHomeworkCheck("hw_artem_running");
    assert.deepEqual(done.check?.results.map((result) => [result.number, result.verdict, result.recognizedAnswer]), [
      ["010208", "CORRECT", "совпадает с эталоном"],
      ["010209", "INCORRECT", "x = -2; x = 6"],
    ]);
    assert.deepEqual(done.photos, []);
    assert.deepEqual(done.numbers.map((entry) => entry.status), ["GREEN", "RED", null, null]);
    assert.deepEqual((await mock.api.shell.listNotifications()).notifications[0]?.params, { correct: 1, incorrect: 1, uncertain: 0, applied: 2 });
    assert.equal(mock.store.rowScripts.has("chk_artem_running_1"), false);
    assertNoPrivateFields(done);
    assert.equal(JSON.stringify(done).includes("посторонний корень"), false);
  });

  it("sweeps a dead check: FAILED interrupted after 15 min (PENDING) / 45 min (CHECKING), then a new start works", async () => {
    const mock = await ilya();
    const pendingId = await startCheck(mock, "hw_ilya_open", 0);
    // The worker "died": nothing will ever move this row.
    mock.ctx.jobs.cancel(pendingId);
    mock.clock.advance(15 * MINUTE_MS);
    assert.equal((await mock.api.studentWork.getLatestHomeworkCheck("hw_ilya_open")).check?.status, "PENDING");
    await rejects(mock.api.studentWork.startHomeworkCheck("hw_ilya_open"), "alreadyRunning", 409);
    mock.clock.advance(1);
    const swept = await mock.api.studentWork.getLatestHomeworkCheck("hw_ilya_open");
    assert.deepEqual([swept.check?.id, swept.check?.status, swept.check?.errorCode, swept.photos.length], [pendingId, "FAILED", "interrupted", 3]);
    assert.equal(mock.store.homeworkChecks.get(pendingId)?.error, "Проверка прервалась (перезапуск сервера). Запустите её заново.");
    // A stale PENDING never reached the model: its daily slot is returned.
    assert.equal(budgetHits(mock, "api:homework-checks:global"), 0);

    // A stale CHECKING keeps its slot; the sweep also runs inside a new start, which then succeeds.
    const checkingId = await startCheck(mock, "hw_ilya_open", 0);
    mock.clock.advance(1000);
    await mock.api.studentWork.getLatestHomeworkCheck("hw_ilya_open");
    mock.ctx.jobs.cancel(checkingId);
    mock.clock.advance(44 * MINUTE_MS);
    assert.equal((await mock.api.studentWork.getLatestHomeworkCheck("hw_ilya_open")).check?.status, "CHECKING");
    mock.clock.advance(MINUTE_MS + 1);
    const restarted = await mock.api.studentWork.startHomeworkCheck("hw_ilya_open");
    assert.equal(restarted.check.status, "PENDING");
    assert.deepEqual([mock.store.homeworkChecks.get(checkingId)?.status, mock.store.homeworkChecks.get(checkingId)?.activeSlot], ["FAILED", null]);
    assert.equal(budgetHits(mock, "api:homework-checks:global"), 2);
  });
});

describe("studentWork.getLatestHomeworkCheck", () => {
  it("returns null for a homework that was never checked, with the batch and the statuses", async () => {
    const mock = await ilya();
    const response = await mock.api.studentWork.getLatestHomeworkCheck("hw_ilya_open");
    assert.equal(response.check, null);
    assert.deepEqual(response.photos.map((entry) => entry.id), ["hwp_ilya_open_1", "hwp_ilya_open_2", "hwp_ilya_open_3"]);
    assert.deepEqual(response.numbers, [
      { homeworkNumberId: "num_301", status: "YELLOW" },
      { homeworkNumberId: "num_302", status: null },
      { homeworkNumberId: "num_305", status: null },
    ]);
    assert.equal(response.solvedCount, 1);
  });

  it("returns the newest check by createdAt through the student projection", async () => {
    const mock = await ilya();
    const failed = await mock.api.studentWork.getLatestHomeworkCheck("hw_ilya_failed");
    assert.deepEqual([failed.check?.id, failed.check?.status, failed.check?.errorCode], ["chk_ilya_failed_2", "FAILED", "unavailable"]);
    const uncertain = await mock.api.studentWork.getLatestHomeworkCheck("hw_ilya_uncertain");
    assert.deepEqual(uncertain.check?.results.map((result) => result.number), ["204", "207", "211", "215"]);
    assert.equal(uncertain.check?.results[2]?.recognizedAnswer, null);
    assert.equal(uncertain.solvedCount, 3);
    assertNoPrivateFields(uncertain);
    assertNoPrivateFields(failed);
  });

  it("answers 404 homeworkNotFound for an unknown or foreign homework (never `check: null`)", async () => {
    const mock = await ilya();
    for (const id of ["hw_missing", "hw_artem_running"]) {
      assert.equal((await rejects(mock.api.studentWork.getLatestHomeworkCheck(id), "homeworkNotFound", 404)).message, "ДЗ не найдено.");
    }
    // A foreign poll does not start the timer of somebody else's check.
    assert.deepEqual(mock.ctx.jobs.pending("chk_artem_running_1").map((job) => job.state), ["waiting"]);
  });

  it("is limited to 120 polls per minute, before the homework is looked up", async () => {
    const mock = await ilya();
    for (let call = 0; call < 120; call += 1) await mock.api.studentWork.getLatestHomeworkCheck("hw_ilya_open");
    mock.clock.advance(45_000);
    const error = await rejects(mock.api.studentWork.getLatestHomeworkCheck("hw_missing"), "rateLimited", 429);
    assert.equal(error.retryAfterSeconds, 15);
    mock.clock.advance(15_000);
    assert.equal((await mock.api.studentWork.getLatestHomeworkCheck("hw_ilya_open")).check, null);
  });
});
