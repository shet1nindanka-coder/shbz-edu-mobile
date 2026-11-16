// `studentWork` on the mock store, part 2: the live lesson — the Lesson tab, joining, handing an item in
// and the state poll (docs/spec/90-addendum-5.md Part A; 03 §3.6 – §3.8, §4.6 – §4.9; 90-addendum-6 §4 – §6).
// Everything runs on the manual clock: time moves only through `mock.clock.advance()`.
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError } from "../src/api/errors";
import type { AnyApiErrorCode } from "../src/api/errors";
import type { CheckErrorCode, LessonItemStateDto, PhotoUpload } from "../src/api/types";
import { DAY_MS, HOUR_MS, MINUTE_MS } from "../src/domain/moscow-time";
import type { RealtimeEventInput } from "../src/mock/rules/realtime";
import { TEST_T0, createTestMock, type TestMock } from "../src/mock/testing";

const T0 = Date.parse(TEST_T0);
const MIB = 1024 * 1024;
const iso = (offsetMs: number) => new Date(T0 + offsetMs).toISOString();

const SOON = "les_dasha_soon";
const LIVE = "les_live";
const dashaItem = (label: string) => `li_les_dasha_soon_dasha_${label}`;
const polinaItem = (label: string) => `li_les_live_polina_${label}`;
const artemItem = (label: string) => `li_les_live_artem_${label}`;
const kirillItem = (label: string) => `li_les_live_kirill_${label}`;

/** Fields a student must never receive: diagnostics, planning fields, attendance, reference answers. */
const PRIVATE_FIELDS = [
  "errorKind", "errorNote", "injectionSuspected", "injectionNote", "confidence", "modelUsed", "recognizedAnswer", "answerLatex",
  "attendance", "speed", "planSummary", "reason", "minutes", "forReview", "queueOrder", "helpedAt", "error",
];

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

const kindsOf = (events: readonly RealtimeEventInput[]) => events.map((event) => event.kind);

function assertNoPrivateFields(payload: unknown): void {
  const json = JSON.stringify(payload);
  for (const field of PRIVATE_FIELDS) assert.equal(json.includes(`"${field}"`), false, `the payload leaks "${field}"`);
}

const statusOf = (mock: TestMock, studentId: string, label: string) => mock.ctx.q.status(studentId, `num_${label}`)?.status ?? null;
const budgetHits = (mock: TestMock, scope: string) => mock.store.limiterBuckets.get(`${scope}|global`)?.hits ?? 0;

async function signedIn(login: string, options: Parameters<typeof createTestMock>[0] = {}): Promise<TestMock> {
  const mock = createTestMock(options);
  await mock.signIn(login);
  return mock;
}

/** Dasha, with her individual lesson running (it starts 3 minutes after the seed). */
async function dashaInLesson(options: Parameters<typeof createTestMock>[0] = {}): Promise<TestMock> {
  const mock = await signedIn("dasha@example.com", options);
  mock.clock.advance(3 * MINUTE_MS);
  return mock;
}

/** One line per item of a state poll: `result / submission status / verdict / closed / canSubmit`. */
const describeItems = (items: readonly LessonItemStateDto[]) =>
  items.map((item) => [item.result, item.submission?.status ?? null, item.submission?.verdict ?? null, item.closed, item.canSubmit].map(String).join(" "));

/** Hands an item in, lets the check finish (8 s) and returns the polled state of that item. */
async function submitAndFinish(mock: TestMock, lessonId: string, itemId: string): Promise<LessonItemStateDto> {
  await mock.api.studentWork.submitLessonItem(lessonId, itemId, [photo()]);
  mock.clock.advance(8000);
  const state = await mock.api.studentWork.getLiveLessonState(lessonId);
  const item = state.items.find((entry) => entry.id === itemId);
  assert.ok(item);
  return item;
}

describe("studentWork.getLiveLesson", () => {
  it("shows the running lesson with every item state and the next planned one (coverage: lesson.live.everyItemState)", async () => {
    const mock = await signedIn("polina@example.com");
    const response = await mock.api.studentWork.getLiveLesson();

    assert.equal(response.serverNow, TEST_T0);
    assert.deepEqual(response.limits, { maxPhotosPerSubmission: 3 });
    assert.equal(response.lessonCheckAvailable, true);
    assert.deepEqual(response.upcoming, {
      lessonId: "les_tomorrow_group",
      title: "Занятие группы · Системы уравнений",
      startsAt: mock.store.lessons.get("les_tomorrow_group")?.startsAt,
      durationMinutes: 60,
      groupName: mock.store.groups.get("grp_8a")?.name,
    });

    const active = response.active;
    assert.ok(active);
    assert.deepEqual(Object.keys(active).sort(), ["durationMinutes", "endsAt", "groupName", "items", "joinedAt", "lessonId", "startsAt", "title"]);
    assert.deepEqual(
      [active.lessonId, active.title, active.groupName, active.startsAt, active.durationMinutes, active.endsAt, active.joinedAt],
      [LIVE, "Занятие группы · Логарифмические уравнения", mock.store.groups.get("grp_8a")?.name, iso(-25 * MINUTE_MS), 90, iso(65 * MINUTE_MS), iso(-22 * MINUTE_MS)],
    );

    assert.deepEqual(
      active.items.map((item) => [item.number, item.isExtra, item.result, item.submission?.status ?? null, item.submission?.verdict ?? null, item.submission?.errorCode ?? null, item.closed, item.canSubmit]),
      [
        ["010203", false, "SOLVED", "DONE", "CORRECT", null, true, false],
        ["010204", false, "PARTIAL", "DONE", "CORRECT", null, true, false],
        // "Not solved" does not close an item: it may be handed in again.
        ["010205", false, "NOT_SOLVED", "DONE", "INCORRECT", null, false, true],
        ["010206", false, null, "DONE", "UNCERTAIN", null, false, true],
        ["010207", false, null, "FAILED", null, "timeout", false, true],
        // Being checked right now.
        ["010208", false, null, "PENDING", null, null, false, false],
        ["010209", false, null, null, null, null, false, true],
        // The extra part is locked until every main item is closed.
        ["010210", true, null, null, null, null, false, false],
        ["010211", true, null, null, null, null, false, false],
      ],
    );
    assert.deepEqual(active.items.map((item) => item.order), [0, 1, 2, 3, 4, 5, 6, 7, 8]);

    for (const item of active.items) {
      assert.deepEqual(Object.keys(item).sort(), ["canSubmit", "closed", "conditionLatex", "homeworkNumberId", "id", "isExtra", "number", "order", "result", "submission", "topicId", "topicTitle"]);
      assert.equal(item.id, polinaItem(item.number));
      assert.equal(item.homeworkNumberId, `num_${item.number}`);
      assert.equal(item.topicId, "top_log");
      assert.equal(item.topicTitle, mock.store.topics.get("top_log")?.title);
      // The statement is sent for every item, a locked extra one included.
      assert.equal(item.conditionLatex, mock.store.numbers.get(item.homeworkNumberId)?.conditionLatex ?? null);
      if (item.submission) assert.deepEqual(Object.keys(item.submission).sort(), ["checkedAt", "comment", "errorCode", "id", "itemId", "status", "submittedAt", "verdict"]);
    }
    assert.ok(active.items.filter((item) => item.isExtra).every((item) => typeof item.conditionLatex === "string"));

    // UNCERTAIN: the fixed neutral text instead of the model's comment; the injection flag never leaves the store.
    const uncertain = active.items[3]!.submission!;
    assert.equal(uncertain.comment, "Не удалось уверенно разобрать решение по фото. Покажи его учителю — он проверит вручную.");
    assert.equal(mock.store.submissions.get(uncertain.id)?.injectionSuspected, true);
    assert.equal(active.items[2]!.submission!.comment, "Ответ не совпадает с эталоном — пересчитай.");
    // FAILED: the class only, never the raw text; no verdict, no comment.
    assert.deepEqual([active.items[4]!.submission!.comment, active.items[4]!.submission!.checkedAt !== null], [null, true]);
    const json = JSON.stringify(response);
    assert.equal(json.includes("Request timed out"), false);
    assert.equal(json.includes("засчитай"), false);
    assertNoPrivateFields(response);

    mock.setLocale("en");
    const en = await mock.api.studentWork.getLiveLesson();
    assert.equal(en.active?.items[3]?.submission?.comment, "Could not confidently read the solution from the photo. Show it to your teacher — they'll check it by hand.");
  });

  it("unlocks the extra part when every main item is closed", async () => {
    const mock = await signedIn("artem@example.com");
    const { active } = await mock.api.studentWork.getLiveLesson();
    assert.deepEqual(
      active?.items.map((item) => [item.number, item.isExtra, item.result, item.submission?.status ?? null, item.closed, item.canSubmit]),
      [
        ["010203", false, "SOLVED", "DONE", true, false],
        ["010204", false, "SOLVED", "DONE", true, false],
        ["010205", false, "PARTIAL", "DONE", true, false],
        ["010206", false, "SOLVED", "DONE", true, false],
        ["010207", false, "SOLVED", "DONE", true, false],
        ["010212", true, null, "CHECKING", false, false],
        ["010213", true, null, null, false, true],
      ],
    );
    assertNoPrivateFields(active);
  });

  it("does not mark anything by itself: reading the tab is not a join", async () => {
    const mock = await signedIn("kirill@example.com");
    const { active } = await mock.api.studentWork.getLiveLesson();
    assert.deepEqual([active?.lessonId, active?.joinedAt], [LIVE, null]);
    assert.deepEqual(active?.items.map((item) => item.canSubmit), [true, true, true, true, true, false, false]);
    const participant = mock.ctx.q.participantOf(LIVE, "usr_kirill");
    assert.deepEqual([participant?.joinedAt, participant?.attendance], [null, "UNKNOWN"]);
  });

  it("returns nulls without a lesson and the upcoming lesson when nothing is running", async () => {
    const maria = await signedIn("maria@example.com");
    const empty = await maria.api.studentWork.getLiveLesson();
    assert.deepEqual([empty.active, empty.upcoming, empty.serverNow], [null, null, TEST_T0]);

    const ilya = await signedIn("ilya@example.com");
    const planned = await ilya.api.studentWork.getLiveLesson();
    assert.equal(planned.active, null);
    assert.deepEqual([planned.upcoming?.lessonId, planned.upcoming?.groupName, planned.upcoming?.startsAt], ["les_ilya_tomorrow", null, ilya.store.lessons.get("les_ilya_tomorrow")?.startsAt]);
    // An upcoming lesson always starts after `serverNow`.
    assert.ok(Date.parse(planned.upcoming!.startsAt) > Date.parse(planned.serverNow));
  });

  it("follows the schedule: upcoming → active at startsAt → gone at the end (coverage: lesson.startsWhileWatching)", async () => {
    const mock = await signedIn("dasha@example.com");
    const before = await mock.api.studentWork.getLiveLesson();
    assert.equal(before.active, null);
    assert.deepEqual(before.upcoming, { lessonId: SOON, title: "Индивидуальное · Системы уравнений", startsAt: iso(3 * MINUTE_MS), durationMinutes: 30, groupName: null });

    mock.clock.advance(3 * MINUTE_MS - 1);
    assert.equal((await mock.api.studentWork.getLiveLesson()).active, null);
    mock.clock.advance(1);
    const running = await mock.api.studentWork.getLiveLesson();
    assert.deepEqual(
      [running.serverNow, running.active?.lessonId, running.active?.groupName, running.active?.startsAt, running.active?.endsAt, running.active?.joinedAt],
      [iso(3 * MINUTE_MS), SOON, null, iso(3 * MINUTE_MS), iso(33 * MINUTE_MS), null],
    );
    assert.deepEqual(running.active?.items.map((item) => [item.number, item.isExtra, item.result, item.submission, item.closed, item.canSubmit]), [
      ["401", false, null, null, false, true],
      ["402", false, null, null, false, true],
      ["403", false, null, null, false, true],
      ["404", true, null, null, false, false],
    ]);
    // The next planned lesson is computed even while one is running.
    assert.equal(running.upcoming?.lessonId, "les_stale");

    // The last millisecond of the lesson, then its end: the tab goes back to "waiting" and the results are closed lazily.
    mock.clock.advance(30 * MINUTE_MS - 1);
    assert.equal((await mock.api.studentWork.getLiveLesson()).active?.lessonId, SOON);
    assert.equal(mock.store.lessons.get(SOON)?.status, "PLANNED");
    mock.clock.advance(1);
    const after = await mock.api.studentWork.getLiveLesson();
    assert.deepEqual([after.active, after.upcoming?.lessonId], [null, "les_stale"]);
    assert.equal(mock.store.lessons.get(SOON)?.status, "FINISHED");
    const participant = mock.ctx.q.participantOf(SOON, "usr_dasha")!;
    assert.equal(participant.attendance, "ABSENT");
    assert.deepEqual(mock.ctx.q.items(participant.id).map((item) => item.result), ["SKIPPED", "SKIPPED", "SKIPPED", "SKIPPED"]);
  });

  it("closes the results of a lesson that ended recently on this read (lazy finalisation)", async () => {
    const mock = await signedIn("polina@example.com");
    assert.equal(mock.store.lessons.get("les_g_unfinalized")?.status, "PLANNED");
    await mock.api.studentWork.getLiveLesson();

    assert.equal(mock.store.lessons.get("les_g_unfinalized")?.status, "FINISHED");
    const participant = mock.ctx.q.participantOf("les_g_unfinalized", "usr_polina")!;
    const results = Object.fromEntries(mock.ctx.q.items(participant.id).map((item) => [mock.store.numbers.get(item.homeworkNumberId)?.number, item.result]));
    // Handed in but never accepted → "not solved" (RED); never handed in → "did not get to it".
    assert.deepEqual([results["302"], results["305"]], ["NOT_SOLVED", "SKIPPED"]);
    assert.equal(statusOf(mock, "usr_polina", "302"), "RED");
  });

  it("reports whether lesson checks are available right now", async () => {
    const mock = await signedIn("polina@example.com");
    mock.store.patchSettings({ lessonCheckEnabled: false });
    assert.equal((await mock.api.studentWork.getLiveLesson()).lessonCheckAvailable, false);
    mock.store.patchSettings({ lessonCheckEnabled: true, aiEnabled: false });
    assert.equal((await mock.api.studentWork.getLiveLesson()).lessonCheckAvailable, false);
    mock.store.patchSettings({ aiEnabled: true });
    assert.equal((await mock.api.studentWork.getLiveLesson()).lessonCheckAvailable, true);
  });

  it("ignores lessons that started more than 24 hours ago, drafts and lessons without a time", async () => {
    const mock = await signedIn("polina@example.com");
    // A lesson without an end in sight that began 25 hours ago is not a candidate any more.
    mock.store.lessons.update(LIVE, { startsAt: iso(-25 * HOUR_MS), durationMinutes: 240, finishedAt: null });
    mock.store.lessons.update("les_tomorrow_group", { startsAt: null });
    const response = await mock.api.studentWork.getLiveLesson();
    assert.deepEqual([response.active, response.upcoming], [null, null]);
    assert.ok(mock.store.participants.by("studentId", "usr_polina").some((participant) => mock.store.lessons.get(participant.lessonId)?.kind === "HOMEWORK"));
  });

  it("starts the timers of the seeded in-flight submissions at the first read", async () => {
    const mock = await signedIn("polina@example.com");
    mock.clock.advance(5 * MINUTE_MS);
    const first = await mock.api.studentWork.getLiveLesson();
    assert.equal(first.active?.items[5]?.submission?.status, "PENDING");

    mock.clock.advance(1000);
    assert.equal((await mock.api.studentWork.getLiveLessonState(LIVE)).items[5]?.submission?.status, "CHECKING");
    mock.clock.advance(7000);
    const done = await mock.api.studentWork.getLiveLesson();
    const item = done.active!.items[5]!;
    // The row script: INCORRECT → "not solved", mirrored as RED; the item stays open for another attempt.
    assert.deepEqual([item.result, item.submission?.status, item.submission?.verdict, item.closed, item.canSubmit], ["NOT_SOLVED", "DONE", "INCORRECT", false, true]);
    assert.equal(item.submission?.comment, "Ошибка вычислительного характера — пересчитай выкладки внимательнее.");
    assert.equal(statusOf(mock, "usr_polina", "010208"), "RED");
    assert.equal(mock.store.submissions.get(item.submission!.id)?.errorKind, "ARITHMETIC");
    assertNoPrivateFields(done);

    // Артём's extra #1 was not read by anybody yet: it is still waiting.
    assert.equal(mock.store.submissions.get("sub_les_live_artem_010212_1")?.status, "CHECKING");
    mock.signOut();
    await mock.signIn("artem@example.com");
    await mock.api.studentWork.getLiveLessonState(LIVE);
    mock.clock.advance(8000);
    const artem = await mock.api.studentWork.getLiveLessonState(LIVE);
    assert.deepEqual(describeItems(artem.items).slice(5), ["SOLVED DONE CORRECT true false", "null null null false true"]);
    assert.equal(statusOf(mock, "usr_artem", "010212"), "GREEN");
  });
});

describe("studentWork.joinLesson", () => {
  it("stamps the first join, marks the student present and tells the teacher's board — once", async () => {
    const mock = await signedIn("kirill@example.com");
    const events = recordEvents(mock);
    mock.clock.advance(90_000);

    assert.deepEqual(await mock.api.studentWork.joinLesson(LIVE), { joinedAt: iso(90_000) });
    const participant = mock.ctx.q.participantOf(LIVE, "usr_kirill");
    assert.deepEqual([participant?.joinedAt, participant?.attendance], [iso(90_000), "PRESENT"]);
    assert.deepEqual(events, [{ kind: "lesson-activity", lessonId: LIVE, teacherId: "usr_anna", studentId: "usr_kirill" }]);

    // Later calls return the stored value and publish nothing.
    mock.clock.advance(5 * MINUTE_MS);
    assert.deepEqual(await mock.api.studentWork.joinLesson(LIVE), { joinedAt: iso(90_000) });
    assert.equal(events.length, 1);
    assert.equal((await mock.api.studentWork.getLiveLesson()).active?.joinedAt, iso(90_000));
  });

  it("returns the stored joinedAt of a student who is already in class", async () => {
    const mock = await signedIn("polina@example.com");
    const events = recordEvents(mock);
    assert.deepEqual(await mock.api.studentWork.joinLesson(LIVE), { joinedAt: iso(-22 * MINUTE_MS) });
    assert.deepEqual(events, []);
  });

  it("never overwrites an attendance mark set by the teacher", async () => {
    const mock = await signedIn("kirill@example.com");
    const participant = mock.ctx.q.participantOf(LIVE, "usr_kirill")!;
    mock.store.participants.update(participant.id, { attendance: "LATE" });
    assert.deepEqual(await mock.api.studentWork.joinLesson(LIVE), { joinedAt: TEST_T0 });
    assert.deepEqual([mock.store.participants.get(participant.id)?.joinedAt, mock.store.participants.get(participant.id)?.attendance], [TEST_T0, "LATE"]);
  });

  it("answers 404 lessonNotFound for an unknown lesson, a foreign lesson and a homework draft", async () => {
    const mock = await signedIn("polina@example.com");
    // `hp_issued` is a draft (kind HOMEWORK) Полина is a participant of; `les_igor_1` is another teacher's lesson.
    for (const id of ["les_missing", "les_igor_1", "les_dasha_soon", "hp_issued", ""]) {
      const error = await rejects(mock.api.studentWork.joinLesson(id), "lessonNotFound", 404);
      assert.equal(error.message, "Урок не найден.", id);
    }
  });

  it("answers 409 lessonNotActive before the start and after the end", async () => {
    const mock = await signedIn("dasha@example.com");
    const planned = await rejects(mock.api.studentWork.joinLesson(SOON), "lessonNotActive", 409);
    assert.equal(planned.message, "Урок сейчас не идёт.");
    await rejects(mock.api.studentWork.joinLesson("les_dasha_past"), "lessonNotActive", 409);
    assert.equal(mock.ctx.q.participantOf(SOON, "usr_dasha")?.joinedAt, null);

    mock.clock.advance(3 * MINUTE_MS);
    assert.deepEqual(await mock.api.studentWork.joinLesson(SOON), { joinedAt: iso(3 * MINUTE_MS) });
    mock.clock.advance(30 * MINUTE_MS);
    mock.setLocale("en");
    assert.equal((await rejects(mock.api.studentWork.joinLesson(SOON), "lessonNotActive", 409)).message, "The lesson isn't in progress right now.");

    // An early finish by the teacher ends the lesson for the join call at once.
    const polina = await signedIn("polina@example.com");
    polina.store.lessons.update(LIVE, { finishedAt: TEST_T0 });
    await rejects(polina.api.studentWork.joinLesson(LIVE), "lessonNotActive", 409);
  });

  it("is limited to 30 calls per minute, before the lesson is looked up", async () => {
    const mock = await signedIn("kirill@example.com");
    for (let call = 0; call < 30; call += 1) await mock.api.studentWork.joinLesson(LIVE);
    mock.clock.advance(10_000);
    const error = await rejects(mock.api.studentWork.joinLesson("les_missing"), "rateLimited", 429);
    assert.equal(error.retryAfterSeconds, 50);
    mock.clock.advance(50_000);
    assert.equal((await mock.api.studentWork.joinLesson(LIVE)).joinedAt, TEST_T0);
  });
});

describe("studentWork.submitLessonItem", () => {
  it("creates a PENDING submission with its photos, stamps the presence and tells the teacher's board", async () => {
    const uploaded: string[] = [];
    const mock = await dashaInLesson({ onFileUploaded: (file) => uploaded.push(file.originalName) });
    const events = recordEvents(mock);
    const progress: number[] = [];
    const now = iso(3 * MINUTE_MS);

    const { submission } = await mock.api.studentWork.submitLessonItem(SOON, dashaItem("401"), [photo(" стр-1.jpg ", 100), photo("стр-2.PNG", 100), photo("стр-3.jpeg", 200, "")], {
      onProgress: (percent) => progress.push(percent),
    });
    assert.deepEqual({ ...submission, id: "" }, { id: "", itemId: dashaItem("401"), status: "PENDING", verdict: null, comment: null, errorCode: null, submittedAt: now, checkedAt: null });
    assert.deepEqual(progress, [25, 50, 100]);

    const row = mock.store.submissions.get(submission.id);
    assert.deepEqual([row?.status, row?.activeSlot, row?.verdict, row?.modelUsed], ["PENDING", 1, null, null]);
    const stored = mock.ctx.q.submissionPhotos(submission.id);
    assert.deepEqual(stored.map((entry) => entry.order), [0, 1, 2]);
    assert.deepEqual(stored.map((entry) => [mock.store.files.get(entry.fileId)?.originalName, mock.store.files.get(entry.fileId)?.mimeType, mock.store.files.get(entry.fileId)?.uploadedById]), [
      ["стр-1.jpg", "image/jpeg", "usr_dasha"],
      ["стр-2.PNG", "image/png", "usr_dasha"],
      ["стр-3.jpeg", "image/jpeg", "usr_dasha"],
    ]);
    assert.deepEqual(uploaded, ["стр-1.jpg", "стр-2.PNG", "стр-3.jpeg"]);
    // The student reads the own photo; the teacher of the lesson may read it too.
    assert.ok(mock.ctx.files.lookup(stored[0]!.fileId));
    assert.equal(mock.ctx.files.canRead(mock.ctx.q.user("usr_anna")!, stored[0]!.fileId), true);
    assert.equal(mock.ctx.files.canRead(mock.ctx.q.user("usr_igor")!, stored[0]!.fileId), false);

    // The submission doubles as "I am in class".
    const participant = mock.ctx.q.participantOf(SOON, "usr_dasha");
    assert.deepEqual([participant?.joinedAt, participant?.attendance], [now, "PRESENT"]);
    assert.deepEqual(events, [{ kind: "lesson-activity", lessonId: SOON, teacherId: "usr_anna", studentId: "usr_dasha" }]);

    assert.deepEqual(mock.ctx.jobs.pending(submission.id).map((job) => [job.kind, job.dueAt, job.payload.locale]).sort(), [
      ["lessonSubmission.begin", T0 + 3 * MINUTE_MS + 1000, "ru"],
      ["lessonSubmission.finish", T0 + 3 * MINUTE_MS + 8000, "ru"],
    ]);
    assert.equal(mock.store.limiterBuckets.get("api:lesson-checks|usr_dasha")?.hits, 1);
    assert.equal(budgetHits(mock, "api:lesson-checks:global"), 1);

    // While it is checked the item cannot be handed in again; the other items can.
    const state = await mock.api.studentWork.getLiveLessonState(SOON);
    assert.deepEqual(describeItems(state.items), ["null PENDING null false false", "null null null false true", "null null null false true", "null null null false false"]);
    assert.deepEqual(state.items[0]?.submission, submission);
    assert.equal((await rejects(mock.api.studentWork.submitLessonItem(SOON, dashaItem("401"), [photo()]), "alreadyRunning", 409)).message, "Проверка этого номера уже идёт — дождитесь результата.");
    const parallel = await mock.api.studentWork.submitLessonItem(SOON, dashaItem("402"), [photo()]);
    assert.equal(parallel.submission.status, "PENDING");
    // A later submission does not move the first join stamp.
    assert.equal(mock.ctx.q.participantOf(SOON, "usr_dasha")?.joinedAt, now);
  });

  it("walks through every auto result and unlocks the extra part (example 4, coverage: lesson.autoResults.walkthrough)", async () => {
    const mock = await dashaInLesson();
    const events = recordEvents(mock);
    const start = T0 + 3 * MINUTE_MS;

    // Step 1 — 401 (position 0): CORRECT on the first try → SOLVED → GREEN.
    const { submission } = await mock.api.studentWork.submitLessonItem(SOON, dashaItem("401"), [photo()]);
    events.length = 0;
    mock.clock.advance(1000);
    assert.equal((await mock.api.studentWork.getLiveLessonState(SOON)).items[0]?.submission?.status, "CHECKING");
    mock.clock.advance(6999);
    assert.equal((await mock.api.studentWork.getLiveLessonState(SOON)).items[0]?.submission?.status, "CHECKING");
    assert.deepEqual(events, []);
    mock.clock.advance(1);
    let state = await mock.api.studentWork.getLiveLessonState(SOON);
    assert.deepEqual(state.items[0], {
      id: dashaItem("401"),
      result: "SOLVED",
      submission: { id: submission.id, itemId: dashaItem("401"), status: "DONE", verdict: "CORRECT", comment: "Верно.", errorCode: null, submittedAt: new Date(start).toISOString(), checkedAt: new Date(start + 8000).toISOString() },
      closed: true,
      canSubmit: false,
    });
    assert.equal(statusOf(mock, "usr_dasha", "401"), "GREEN");
    assert.deepEqual(events, [
      { kind: "lesson-activity", lessonId: SOON, teacherId: "usr_anna", studentId: "usr_dasha" },
      { kind: "student-progress-changed", studentId: "usr_dasha", topicId: "top_systems" },
    ]);
    const history = mock.store.progressEvents.filter((event) => event.context.submissionId === submission.id);
    assert.deepEqual(history.map((event) => [event.source, event.previousStatus, event.status, event.decision, event.context.lessonId, event.context.itemId, event.actorId]), [
      ["lesson_check", null, "GREEN", "changed", SOON, dashaItem("401"), null],
    ]);
    const journal = mock.store.auditLogs.filter((row) => row.action === "lesson_item.check" && row.targetId === dashaItem("401"));
    assert.deepEqual(
      journal.map((row) => [row.category, row.outcome, row.actorId, row.actorRole, row.targetType, row.targetLabel, row.model, row.summary, row.durationMs]),
      [["AI", "ok", "usr_dasha", "STUDENT", "LessonAssignmentItem", `№ 401 · ${mock.store.topics.get("top_systems")?.title}`, "mock", "Классная работа: № 401 — верно", 8000]],
    );
    const stored = mock.store.submissions.get(submission.id);
    assert.deepEqual([stored?.activeSlot, stored?.modelUsed, stored?.confidence, stored?.injectionSuspected], [null, "mock", 0.93, false]);
    // A lesson check creates no notification.
    assert.equal(mock.store.notifications.count((row) => row.userId === "usr_dasha" && row.createdAt >= new Date(start).toISOString()), 0);
    // An accepted item is closed for good.
    const accepted = await rejects(mock.api.studentWork.submitLessonItem(SOON, dashaItem("401"), [photo()]), "alreadyAccepted", 409);
    assert.deepEqual([accepted.message, accepted.params], ["№ 401 уже принят.", { number: "401" }]);

    // The extra part is locked while a main item is open.
    assert.equal((await rejects(mock.api.studentWork.submitLessonItem(SOON, dashaItem("404"), [photo()]), "extraPartLocked", 409)).message, "Дополнительная часть откроется, когда будет закрыта основная.");

    // Steps 2 – 4 — 402 (position 1): INCORRECT → NOT_SOLVED / RED; UNCERTAIN → unchanged; CORRECT → PARTIAL / YELLOW.
    let item = await submitAndFinish(mock, SOON, dashaItem("402"));
    assert.deepEqual([item.result, item.submission?.verdict, item.closed, item.canSubmit, statusOf(mock, "usr_dasha", "402")], ["NOT_SOLVED", "INCORRECT", false, true, "RED"]);
    item = await submitAndFinish(mock, SOON, dashaItem("402"));
    assert.deepEqual([item.result, item.submission?.verdict, item.closed, item.canSubmit, statusOf(mock, "usr_dasha", "402")], ["NOT_SOLVED", "UNCERTAIN", false, true, "RED"]);
    assert.equal(item.submission?.comment, "Не удалось уверенно разобрать решение по фото. Покажи его учителю — он проверит вручную.");
    item = await submitAndFinish(mock, SOON, dashaItem("402"));
    assert.deepEqual([item.result, item.submission?.verdict, item.closed, item.canSubmit, statusOf(mock, "usr_dasha", "402")], ["PARTIAL", "CORRECT", true, false, "YELLOW"]);

    // Steps 5 – 6 — 403 (position 2): UNCERTAIN → no result (the teacher decides), then CORRECT → SOLVED / GREEN.
    events.length = 0;
    item = await submitAndFinish(mock, SOON, dashaItem("403"));
    assert.deepEqual([item.result, item.submission?.verdict, item.closed, item.canSubmit, statusOf(mock, "usr_dasha", "403")], [null, "UNCERTAIN", false, true, null]);
    // The board is told about the finished check, but no colour changed.
    // (`kindsOf`: an earlier `deepEqual(events, [])` narrowed the array's type.)
    assert.deepEqual(kindsOf(events), ["lesson-activity", "lesson-activity"]);
    item = await submitAndFinish(mock, SOON, dashaItem("403"));
    assert.deepEqual([item.result, item.submission?.verdict, item.closed, statusOf(mock, "usr_dasha", "403")], ["SOLVED", "CORRECT", true, "GREEN"]);

    // Step 7 — the main part is closed: the extra item unlocks and is solved on the first try.
    state = await mock.api.studentWork.getLiveLessonState(SOON);
    assert.deepEqual(describeItems(state.items), ["SOLVED DONE CORRECT true false", "PARTIAL DONE CORRECT true false", "SOLVED DONE CORRECT true false", "null null null false true"]);
    item = await submitAndFinish(mock, SOON, dashaItem("404"));
    assert.deepEqual([item.result, item.submission?.verdict, item.closed, item.canSubmit, statusOf(mock, "usr_dasha", "404")], ["SOLVED", "CORRECT", true, false, "GREEN"]);

    const tab = await mock.api.studentWork.getLiveLesson();
    assert.deepEqual(tab.active?.items.map((entry) => [entry.number, entry.result, entry.closed, entry.canSubmit]), [
      ["401", "SOLVED", true, false],
      ["402", "PARTIAL", true, false],
      ["403", "SOLVED", true, false],
      ["404", "SOLVED", true, false],
    ]);
    assertNoPrivateFields(tab);
    assert.equal(mock.ctx.jobs.lastError(), null);
    // Seven submissions took seven hourly and seven daily slots.
    assert.equal(mock.store.limiterBuckets.get("api:lesson-checks|usr_dasha")?.hits, 9);
    assert.equal(budgetHits(mock, "api:lesson-checks:global"), 7);
  });

  it("continues the seeded attempts of a participant by the rule (example 5)", async () => {
    const mock = await signedIn("polina@example.com");
    // #3 (position 2) already has one DONE submission (INCORRECT): the next one is CORRECT → "with mistakes".
    let item = await submitAndFinish(mock, LIVE, polinaItem("010205"));
    assert.deepEqual([item.result, item.submission?.verdict, item.closed, statusOf(mock, "usr_polina", "010205")], ["PARTIAL", "CORRECT", true, "YELLOW"]);
    // #5 (position 4): its only submission FAILED, so this is the first DONE attempt → INCORRECT.
    item = await submitAndFinish(mock, LIVE, polinaItem("010207"));
    assert.deepEqual([item.result, item.submission?.verdict, item.closed, statusOf(mock, "usr_polina", "010207")], ["NOT_SOLVED", "INCORRECT", false, "RED"]);
    // #7 (position 6): CORRECT on the first try.
    item = await submitAndFinish(mock, LIVE, polinaItem("010209"));
    assert.deepEqual([item.result, item.submission?.verdict, statusOf(mock, "usr_polina", "010209")], ["SOLVED", "CORRECT", "GREEN"]);
    // #4 (position 3, one DONE UNCERTAIN): the next verdict is INCORRECT.
    item = await submitAndFinish(mock, LIVE, polinaItem("010206"));
    assert.deepEqual([item.result, item.submission?.verdict], ["NOT_SOLVED", "INCORRECT"]);
  });

  it("validates the upload in the site's order: files, count (3), size, metadata — before the item is looked up", async () => {
    const mock = await dashaInLesson();
    const submit = (files: unknown, itemId = dashaItem("401")) => mock.api.studentWork.submitLessonItem(SOON, itemId, files as PhotoUpload[]);

    assert.equal((await rejects(submit([]), "uploadInvalid", 400)).message, "Некорректные данные для загрузки фото.");
    await rejects(submit([photo("a.jpg", 0)]), "uploadInvalid", 400);
    await rejects(submit(null), "uploadInvalid", 400);

    // More than three photos: `photoLimit` before the size and before the per-file rules.
    const four = [photo("1.jpg"), photo("2.jpg"), photo("3.jpg"), photo("4.gif", 16 * MIB)];
    const limit = await rejects(submit(four), "photoLimit", 400);
    assert.deepEqual([limit.message, limit.params], ["К одному номеру можно прикрепить не больше 3 фото.", { max: 3 }]);
    mock.setLocale("en");
    assert.equal((await rejects(submit(four), "photoLimit", 400)).message, "You can attach at most 3 photos to one problem.");
    mock.setLocale("ru");

    const large = await rejects(submit([photo("1.jpg", 8 * MIB), photo("2.gif", 7 * MIB + 1)]), "uploadTooLarge", 413);
    assert.equal(large.message, "Суммарный размер фотографий не должен превышать 15 МБ.");

    const badName = await rejects(submit([photo(`${"n".repeat(260)}.png`)]), "uploadBadName", 400);
    assert.deepEqual(badName.params, { max: 255 });
    await rejects(submit([photo("a\nb.jpg")]), "uploadBadName", 400);
    assert.equal((await rejects(submit([photo("scan.webp", 100, "image/webp")]), "uploadUnsupportedType", 400)).message, "Поддерживаются только PDF, DOCX, PNG и JPG.");
    assert.equal((await rejects(submit([photo("scan.jpg", 100, "image/png")]), "uploadUnsupportedType", 400)).message, "Тип файла не соответствует его расширению.");
    assert.equal((await rejects(submit([photo("scan.pdf", 100, "application/pdf")]), "uploadUnsupportedType", 400)).message, "Можно загружать только фото в формате PNG или JPG.");

    // All of that is decided before the item is looked up …
    await rejects(submit([], "li_missing"), "uploadInvalid", 400);
    await rejects(submit(four, "li_missing"), "photoLimit", 400);
    // … and every attempt consumed a slot of the hourly limit, but nothing of the daily budget.
    assert.equal(mock.store.limiterBuckets.get("api:lesson-checks|usr_dasha")?.hits, 13);
    assert.equal(budgetHits(mock, "api:lesson-checks:global"), 0);
    assert.equal(mock.store.submissions.by("itemId", dashaItem("401")).length, 0);
    assert.equal(mock.ctx.q.participantOf(SOON, "usr_dasha")?.joinedAt, null);

    // Boundary: three photos of exactly 15 MiB in total are accepted.
    const ok = await submit([photo("1.jpg", 5 * MIB), photo("2.jpg", 5 * MIB), photo("3.png", 5 * MIB)]);
    assert.equal(ok.submission.status, "PENDING");
  });

  it("answers 404 itemNotFound for a missing item, another student's item and an item of another lesson", async () => {
    const mock = await signedIn("polina@example.com");
    const cases: [string, string][] = [
      [LIVE, "li_missing"],
      // Артём's item of the same lesson.
      [LIVE, artemItem("010213")],
      [LIVE, kirillItem("010203")],
      // Her own item, but the path names another lesson.
      ["les_tomorrow_group", polinaItem("010209")],
      ["les_missing", polinaItem("010209")],
      [LIVE, ""],
    ];
    for (const [lessonId, itemId] of cases) {
      const error = await rejects(mock.api.studentWork.submitLessonItem(lessonId, itemId, [photo()]), "itemNotFound", 404);
      assert.equal(error.message, "Номер урока не найден.", `${lessonId} / ${itemId}`);
    }
    // An item of a homework draft is not a lesson item.
    const draftItem = mock.ctx.q.items(mock.ctx.q.participantOf("hp_conflict", "usr_kirill")!.id)[0]!;
    mock.signOut();
    await mock.signIn("kirill@example.com");
    await rejects(mock.api.studentWork.submitLessonItem("hp_conflict", draftItem.id, [photo()]), "itemNotFound", 404);
    assert.equal(mock.store.submissions.count((row) => row.submittedAt === TEST_T0), 0);
  });

  it("answers 409 lessonNotActive outside the lesson", async () => {
    const mock = await signedIn("dasha@example.com");
    const planned = await rejects(mock.api.studentWork.submitLessonItem(SOON, dashaItem("401"), [photo()]), "lessonNotActive", 409);
    assert.equal(planned.message, "Урок сейчас не идёт — сдать решение нельзя.");
    mock.clock.advance(33 * MINUTE_MS);
    await rejects(mock.api.studentWork.submitLessonItem(SOON, dashaItem("401"), [photo()]), "lessonNotActive", 409);
    assert.equal(mock.store.submissions.by("itemId", dashaItem("401")).length, 0);

    // The teacher finished the lesson early: the student's screen may still be open, the submit is refused.
    const polina = await signedIn("polina@example.com");
    polina.store.lessons.update(LIVE, { finishedAt: TEST_T0 });
    polina.setLocale("en");
    const early = await rejects(polina.api.studentWork.submitLessonItem(LIVE, polinaItem("010209"), [photo()]), "lessonNotActive", 409);
    assert.equal(early.message, "The lesson isn't in progress right now, so you can't submit a solution.");
  });

  it("refuses a closed item, a locked extra item and a second submission of an item being checked", async () => {
    const mock = await signedIn("polina@example.com");
    const submit = (label: string) => mock.api.studentWork.submitLessonItem(LIVE, polinaItem(label), [photo()]);

    // SOLVED and PARTIAL are closed; the message names the number with its leading zero.
    const solved = await rejects(submit("010203"), "alreadyAccepted", 409);
    assert.deepEqual([solved.message, solved.params], ["№ 010203 уже принят.", { number: "010203" }]);
    await rejects(submit("010204"), "alreadyAccepted", 409);
    mock.setLocale("en");
    assert.equal((await rejects(submit("010203"), "alreadyAccepted", 409)).message, "Problem 010203 has already been accepted.");
    mock.setLocale("ru");

    await rejects(submit("010210"), "extraPartLocked", 409);
    // The seeded PENDING submission of #6.
    await rejects(submit("010208"), "alreadyRunning", 409);

    // SKIPPED (set by the teacher) closes an item too; a CORRECT verdict closes it even without a result.
    mock.store.lessonItems.update(polinaItem("010209"), { result: "SKIPPED" });
    await rejects(submit("010209"), "alreadyAccepted", 409);
    mock.store.lessonItems.update(polinaItem("010209"), { result: null });
    const accepted = mock.store.submissions.get("sub_les_live_polina_010203_1")!;
    mock.store.submissions.insert({ ...accepted, id: "sub_extra_correct", itemId: polinaItem("010209") });
    await rejects(submit("010209"), "alreadyAccepted", 409);
    assert.equal(mock.store.submissions.count((row) => row.submittedAt === TEST_T0), 0);
  });

  it("refuses in the site's order: queue, hourly limit, switch — all before the upload is looked at", async () => {
    const mock = await dashaInLesson();
    const submit = () => mock.api.studentWork.submitLessonItem(SOON, "li_missing", []);
    const hourly = () => mock.store.limiterBuckets.get("api:lesson-checks|usr_dasha")?.hits ?? 0;

    mock.api.controls.set("checkQueueFull", true);
    const queue = await rejects(submit(), "queueFull", 503);
    assert.deepEqual([queue.retryAfterSeconds, queue.message], [120, "Очередь проверки переполнена. Попробуйте через несколько минут."]);
    assert.equal(hourly(), 0);
    mock.api.controls.set("checkQueueFull", false);

    mock.store.patchSettings({ lessonCheckEnabled: false });
    const disabled = await rejects(submit(), "checkDisabled", 503);
    assert.deepEqual([disabled.retryAfterSeconds, disabled.message], [undefined, "Проверка классной работы сейчас отключена. Покажите решение учителю."]);
    mock.store.patchSettings({ lessonCheckEnabled: true, aiEnabled: false });
    await rejects(submit(), "checkDisabled", 503);
    mock.store.patchSettings({ aiEnabled: true });
    assert.equal(hourly(), 2);

    // The per-student hourly limit of the settings.
    mock.store.patchSettings({ lessonCheckPerStudentHourlyLimit: 3 });
    await rejects(submit(), "uploadInvalid", 400);
    const limited = await rejects(submit(), "rateLimited", 429);
    assert.deepEqual([limited.retryAfterSeconds, limited.message], [57 * 60, "Слишком много запросов. Подождите немного и попробуйте снова."]);
    mock.store.patchSettings({ lessonCheckEnabled: false });
    await rejects(submit(), "rateLimited", 429);
    mock.api.controls.set("checkQueueFull", true);
    await rejects(submit(), "queueFull", 503);
  });

  it("takes the school-wide lesson budget last and removes the submission and its files when it is exhausted", async () => {
    const removed: string[] = [];
    const mock = await dashaInLesson({ onFileRemoved: (fileId) => removed.push(fileId) });
    const events = recordEvents(mock);
    mock.api.controls.exhaust("api:lesson-checks:global", "global");
    const files = mock.store.files.count();

    const error = await rejects(mock.api.studentWork.submitLessonItem(SOON, dashaItem("401"), [photo("1.jpg"), photo("2.jpg")]), "rateLimited", 429);
    // Fixed window aligned to 00:00 UTC: 14 h 57 min from 09:03 UTC.
    assert.equal(error.retryAfterSeconds, 15 * 3600 - 180);
    assert.equal(mock.store.submissions.by("itemId", dashaItem("401")).length, 0);
    assert.equal(mock.store.submissionPhotos.count((row) => row.submissionId.startsWith("sub_m")), 0);
    assert.equal(mock.store.files.count(), files);
    assert.equal(removed.length, 2);
    assert.equal(mock.store.jobs.count((job) => job.kind.startsWith("lessonSubmission") && job.state === "armed"), 0);
    assert.deepEqual(events, []);
    // The presence stamp belongs to the committed transaction and stays.
    assert.deepEqual([mock.ctx.q.participantOf(SOON, "usr_dasha")?.joinedAt, mock.ctx.q.participantOf(SOON, "usr_dasha")?.attendance], [iso(3 * MINUTE_MS), "PRESENT"]);
    // The item is free: once the homework-check budget is reset nothing changes here, but a reset of this bucket does.
    mock.ctx.limits.reset("api:homework-checks:global", "global");
    await rejects(mock.api.studentWork.submitLessonItem(SOON, dashaItem("401"), [photo()]), "rateLimited", 429);
    mock.ctx.limits.reset("api:lesson-checks:global", "global");
    assert.equal((await mock.api.studentWork.submitLessonItem(SOON, dashaItem("401"), [photo()])).submission.status, "PENDING");
  });

  it("fails with each error class on demand; the result and the status stay, the item can be handed in again (control)", async () => {
    const classes: CheckErrorCode[] = ["interrupted", "disabled", "timeout", "quota", "unavailable", "queue", "image", "unknown"];
    for (const errorClass of classes) {
      const mock = await dashaInLesson();
      const { submission } = await mock.api.studentWork.submitLessonItem(SOON, dashaItem("401"), [photo()]);
      const events = recordEvents(mock);
      mock.api.controls.set("nextCheckOutcome", { kind: "failed", errorClass });
      mock.clock.advance(8000);

      const state = await mock.api.studentWork.getLiveLessonState(SOON);
      assert.deepEqual(state.items[0], {
        id: dashaItem("401"),
        result: null,
        submission: { ...submission, status: "FAILED", errorCode: errorClass, checkedAt: iso(3 * MINUTE_MS + 8000) },
        closed: false,
        canSubmit: true,
      }, errorClass);
      assert.equal(statusOf(mock, "usr_dasha", "401"), null, errorClass);
      const raw = mock.store.submissions.get(submission.id)?.error ?? "";
      assert.ok(raw.length > 0, errorClass);
      assert.equal(JSON.stringify(state).includes(raw), false, errorClass);

      // Before the model stage: the daily slot is returned, nothing is journalled or announced.
      const preModel = errorClass === "disabled" || errorClass === "image";
      assert.equal(budgetHits(mock, "api:lesson-checks:global"), preModel ? 0 : 1, errorClass);
      const journal = mock.store.auditLogs.filter((row) => row.action === "lesson_item.check" && row.outcome === "failed" && row.targetId === dashaItem("401"));
      assert.equal(journal.length, preModel ? 0 : 1, errorClass);
      assert.deepEqual(events, preModel ? [] : [{ kind: "lesson-activity", lessonId: SOON, teacherId: "usr_anna", studentId: "usr_dasha" }], errorClass);

      // One-shot: the next attempt follows the rule. The failed attempt is not a DONE one, so position 0 is CORRECT again.
      assert.equal(mock.api.controls.get().nextCheckOutcome, null, errorClass);
      const retry = await submitAndFinish(mock, SOON, dashaItem("401"));
      assert.deepEqual([retry.result, retry.submission?.verdict], ["SOLVED", "CORRECT"], errorClass);
    }
  });

  it("turns an empty model answer into a failure and applies a forced verdict (control)", async () => {
    const mock = await dashaInLesson();
    mock.api.controls.set("nextCheckOutcome", { kind: "doneEmpty" });
    let item = await submitAndFinish(mock, SOON, dashaItem("401"));
    // A lesson submission always needs a verdict: "DONE without results" does not exist here.
    assert.deepEqual([item.result, item.submission?.status, item.submission?.errorCode, item.canSubmit], [null, "FAILED", "unknown", true]);
    assert.equal(mock.store.submissions.get(item.submission!.id)?.error, "Модель не вернула вердикт по номеру.");
    assert.equal(budgetHits(mock, "api:lesson-checks:global"), 1);

    mock.api.controls.set("nextCheckOutcome", { kind: "verdicts", verdicts: ["INCORRECT"] });
    item = await submitAndFinish(mock, SOON, dashaItem("401"));
    assert.deepEqual([item.result, item.submission?.verdict, statusOf(mock, "usr_dasha", "401")], ["NOT_SOLVED", "INCORRECT", "RED"]);
    assert.equal(mock.api.controls.get().nextCheckOutcome, null);
  });

  it("mirrors a lesson result without downgrade protection: a green number can turn red", async () => {
    const mock = await dashaInLesson();
    mock.ctx.progress.write({ source: "teacher", status: "GREEN", studentId: "usr_dasha", homeworkNumberId: "num_401", actor: mock.ctx.q.user("usr_anna")! });
    mock.api.controls.set("nextCheckOutcome", { kind: "verdicts", verdicts: ["INCORRECT"] });
    const item = await submitAndFinish(mock, SOON, dashaItem("401"));
    assert.deepEqual([item.result, statusOf(mock, "usr_dasha", "401")], ["NOT_SOLVED", "RED"]);
  });

  it("keeps a result set by the teacher and writes the model's comments in the request language", async () => {
    const mock = await dashaInLesson();
    mock.setLocale("en");
    await mock.api.studentWork.submitLessonItem(SOON, dashaItem("402"), [photo()]);
    // While the check runs the teacher marks the item "did not get to it".
    mock.store.lessonItems.update(dashaItem("402"), { result: "SKIPPED" });
    mock.setLocale("ru");
    mock.clock.advance(8000);
    const state = await mock.api.studentWork.getLiveLessonState(SOON);
    const item = state.items[1]!;
    assert.deepEqual([item.result, item.submission?.verdict, item.submission?.comment, item.closed], ["SKIPPED", "INCORRECT", "A calculation error — recheck your working carefully.", true]);
    assert.equal(statusOf(mock, "usr_dasha", "402"), null);
    assert.deepEqual(mock.store.progressEvents.filter((event) => event.context.itemId === dashaItem("402")).map((event) => event.decision), ["lesson_result_preserved"]);
  });

  it("applies the verdict even when the lesson ended while the check was running", async () => {
    const mock = await dashaInLesson();
    mock.clock.advance(30 * MINUTE_MS - 2000);
    await mock.api.studentWork.submitLessonItem(SOON, dashaItem("401"), [photo()]);
    mock.clock.advance(2000);
    // The lesson is over; the pending item is left alone by the finalisation, the others are closed.
    const tab = await mock.api.studentWork.getLiveLesson();
    assert.equal(tab.active, null);
    const participant = mock.ctx.q.participantOf(SOON, "usr_dasha")!;
    assert.deepEqual(mock.ctx.q.items(participant.id).map((item) => item.result), [null, "SKIPPED", "SKIPPED", "SKIPPED"]);
    assert.equal(participant.attendance, "PRESENT");

    mock.clock.advance(6000);
    const state = await mock.api.studentWork.getLiveLessonState(SOON);
    assert.equal(state.status, "FINISHED");
    assert.deepEqual(describeItems(state.items), ["SOLVED DONE CORRECT true false", "SKIPPED null null true false", "SKIPPED null null true false", "SKIPPED null null true false"]);
    assert.equal(statusOf(mock, "usr_dasha", "401"), "GREEN");
  });

  it("fails before the model when lesson checks were switched off after the submission", async () => {
    const mock = await dashaInLesson();
    const { submission } = await mock.api.studentWork.submitLessonItem(SOON, dashaItem("401"), [photo()]);
    mock.store.patchSettings({ lessonCheckEnabled: false });
    mock.clock.advance(1000);
    const state = await mock.api.studentWork.getLiveLessonState(SOON);
    assert.deepEqual([state.items[0]?.submission?.status, state.items[0]?.submission?.errorCode, state.items[0]?.canSubmit], ["FAILED", "disabled", true]);
    assert.equal(mock.store.submissions.get(submission.id)?.error, "Проверка классной работы отключена разработчиком.");
    assert.equal(budgetHits(mock, "api:lesson-checks:global"), 0);
    mock.clock.advance(7000);
    assert.equal((await mock.api.studentWork.getLiveLessonState(SOON)).items[0]?.submission?.status, "FAILED");
    assert.equal(mock.ctx.jobs.lastError(), null);
  });

  it("sweeps a dead submission after 15 minutes so the item can be handed in again", async () => {
    const mock = await dashaInLesson();
    const { submission } = await mock.api.studentWork.submitLessonItem(SOON, dashaItem("401"), [photo()]);
    mock.ctx.jobs.cancel(submission.id);
    mock.clock.advance(15 * MINUTE_MS);
    assert.equal((await mock.api.studentWork.getLiveLessonState(SOON)).items[0]?.submission?.status, "PENDING");
    await rejects(mock.api.studentWork.submitLessonItem(SOON, dashaItem("401"), [photo()]), "alreadyRunning", 409);

    mock.clock.advance(1);
    // The sweep also runs inside the submit call itself.
    const retry = await mock.api.studentWork.submitLessonItem(SOON, dashaItem("401"), [photo()]);
    assert.equal(retry.submission.status, "PENDING");
    const dead = mock.store.submissions.get(submission.id);
    assert.deepEqual([dead?.status, dead?.activeSlot, dead?.error], ["FAILED", null, "Проверка прервалась (перезапуск сервера). Сдайте номер заново."]);
    // The stale PENDING returned its daily slot; the retry took a new one.
    assert.equal(budgetHits(mock, "api:lesson-checks:global"), 1);
  });
});

describe("studentWork.getLiveLessonState", () => {
  it("returns every item of the participant in order, with the derived status", async () => {
    const mock = await signedIn("polina@example.com");
    const state = await mock.api.studentWork.getLiveLessonState(LIVE);
    assert.deepEqual(Object.keys(state).sort(), ["items", "serverNow", "status"]);
    assert.deepEqual([state.serverNow, state.status], [TEST_T0, "ACTIVE"]);
    assert.deepEqual(state.items.map((item) => item.id), ["010203", "010204", "010205", "010206", "010207", "010208", "010209", "010210", "010211"].map(polinaItem));
    for (const item of state.items) assert.deepEqual(Object.keys(item).sort(), ["canSubmit", "closed", "id", "result", "submission"]);
    assert.deepEqual(describeItems(state.items), [
      "SOLVED DONE CORRECT true false",
      "PARTIAL DONE CORRECT true false",
      "NOT_SOLVED DONE INCORRECT false true",
      "null DONE UNCERTAIN false true",
      "null FAILED null false true",
      "null PENDING null false false",
      "null null null false true",
      "null null null false false",
      "null null null false false",
    ]);
    assert.equal(state.items[4]?.submission?.errorCode, "timeout");
    assertNoPrivateFields(state);

    // The same projection as the Lesson tab.
    const tab = await mock.api.studentWork.getLiveLesson();
    assert.deepEqual(tab.active?.items.map((item) => ({ id: item.id, result: item.result, submission: item.submission, closed: item.closed, canSubmit: item.canSubmit })), state.items);
  });

  it("is valid in any status: PLANNED before the start, FINISHED after the end or an early finish", async () => {
    const mock = await signedIn("dasha@example.com");
    const planned = await mock.api.studentWork.getLiveLessonState(SOON);
    assert.equal(planned.status, "PLANNED");
    assert.deepEqual(planned.items.map((item) => item.canSubmit), [false, false, false, false]);

    const past = await mock.api.studentWork.getLiveLessonState("les_dasha_past");
    assert.equal(past.status, "FINISHED");
    assert.deepEqual(past.items.map((item) => [item.result, item.canSubmit]), [["SOLVED", false], ["PARTIAL", false], ["SKIPPED", false], ["SKIPPED", false]]);

    // The teacher ends the running lesson early: the poll is how the app learns it.
    const polina = await signedIn("polina@example.com");
    assert.equal((await polina.api.studentWork.getLiveLessonState(LIVE)).status, "ACTIVE");
    polina.clock.advance(MINUTE_MS);
    polina.store.lessons.update(LIVE, { finishedAt: iso(MINUTE_MS) });
    const finished = await polina.api.studentWork.getLiveLessonState(LIVE);
    assert.deepEqual([finished.status, finished.serverNow], ["FINISHED", iso(MINUTE_MS)]);
    assert.ok(finished.items.every((item) => item.canSubmit === false));
    // `endsAt` of the tab stays the schedule; the tab itself no longer lists the lesson as running.
    assert.equal((await polina.api.studentWork.getLiveLesson()).active, null);
  });

  it("answers 404 lessonNotFound for an unknown lesson, a foreign lesson and a draft", async () => {
    const mock = await signedIn("dasha@example.com");
    for (const id of ["les_missing", LIVE, "les_igor_1", "hp_stale", ""]) {
      const error = await rejects(mock.api.studentWork.getLiveLessonState(id), "lessonNotFound", 404);
      assert.equal(error.message, "Урок не найден.", id);
    }
    // A foreign poll does not start somebody else's timers.
    assert.ok(mock.ctx.jobs.pending("sub_les_live_polina_010208_1").every((job) => job.state === "waiting"));
  });

  it("is limited to 120 polls per minute, before the lesson is looked up", async () => {
    const mock = await signedIn("dasha@example.com");
    mock.api.controls.exhaust("api:lesson-check-status", "usr_dasha");
    const error = await rejects(mock.api.studentWork.getLiveLessonState("les_missing"), "rateLimited", 429);
    assert.equal(error.retryAfterSeconds, 60);
    mock.clock.advance(60_000);
    assert.equal((await mock.api.studentWork.getLiveLessonState(SOON)).status, "PLANNED");
  });

  it("keeps working after a day: a lesson of yesterday is still addressable by its id", async () => {
    const mock = await signedIn("dasha@example.com");
    mock.clock.advance(DAY_MS + HOUR_MS);
    assert.equal((await mock.api.studentWork.getLiveLessonState(SOON)).status, "FINISHED");
    const tab = await mock.api.studentWork.getLiveLesson();
    assert.deepEqual([tab.active, tab.upcoming?.lessonId], [null, "les_stale"]);
  });
});
