// `planner` member of the mock backend — sets of a participant (save, regenerate), lesson results and the
// deferred AI plan generation on the mock clock (docs/spec/05-teacher-lessons-plans.md §3.6 – §3.8, §4.2 – §4.7;
// 90-addendum-3 §9 item 4; 90-addendum-6 §5, §6.4, §9).
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError } from "../src/api/errors";
import type { AnyApiErrorCode } from "../src/api/errors";
import type { LessonItemResult } from "../src/api/types";
import { AI_BUDGET_WINDOW_MS } from "../src/api/types";
import { DAY_MS, HOUR_MS, MINUTE_MS } from "../src/domain/moscow-time";
import { planErrorText } from "../src/domain/plan-error";
import { getDictionary } from "../src/i18n/get-dictionary";
import type { RealtimeEventInput } from "../src/mock/rules/realtime";
import { TEST_T0, createTestMock, type TestMock } from "../src/mock/testing";

const T0 = Date.parse(TEST_T0);
const iso = (offsetMs: number) => new Date(T0 + offsetMs).toISOString();
const ru = getDictionary("ru");
const en = getDictionary("en");

const ANNA = "teacher@example.com";
const DEV = "dev@example.com";

const SUMMARY_NEW_RU = "Новые номера по порядку задачника: от коротких к более длинным.";
const SUMMARY_MIXED_RU = "Сначала возвращаемся к номерам, которые раньше не получились, затем идём по новым в порядке задачника.";
const SUMMARY_NEW_EN = "New problems in book order: from short ones to longer ones.";
const GAP_COMMENT_RU = "Пробел: номер уже разбирали, но он не получился.";
const GAP_COMMENT_EN = "Gap: the problem was already covered but did not work out.";

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

async function signedIn(login: string, options?: Parameters<typeof createTestMock>[0]): Promise<TestMock> {
  const mock = createTestMock(options);
  await mock.api.ready();
  await mock.signIn(login);
  return mock;
}

function captureEvents(mock: TestMock): RealtimeEventInput[] {
  const events: RealtimeEventInput[] = [];
  const publish = mock.ctx.realtime.publish;
  mock.ctx.realtime.publish = (event) => {
    events.push(event);
    publish(event);
  };
  return events;
}

const pid = (lessonId: string, student: string) => `lp_${lessonId}_${student}`;
const iid = (lessonId: string, student: string, label: string) => `li_${lessonId}_${student}_${label}`;
const num = (label: string) => `num_${label}`;
const statusOf = (mock: TestMock, studentId: string, label: string) => mock.ctx.q.status(studentId, num(label));
const planJobs = (mock: TestMock, refId?: string) => mock.store.jobs.filter((job) => job.kind === "planGeneration" && (refId === undefined || job.refId === refId));
const budgetHits = (mock: TestMock) => mock.store.limiterBuckets.get("api:ai-plans:global|global")?.hits;
const labelsOf = (mock: TestMock, participantId: string) => mock.ctx.q.items(participantId).map((item) => mock.store.numbers.get(item.homeworkNumberId)!.number);
const lastAudit = (mock: TestMock) => mock.store.auditLogs.all().at(-1)!;

/** Creates an AI lesson for one student and returns the ids. */
async function newLesson(mock: TestMock, studentId: string, input: { topicIds?: string[]; durationMinutes?: number; speed?: number | null } = {}) {
  const { lessonId, plan } = await mock.api.planner.createLesson({
    studentIds: [studentId],
    topicIds: input.topicIds ?? ["top_linear"],
    durationMinutes: input.durationMinutes,
    ...(input.speed !== undefined ? { speeds: { [studentId]: input.speed } } : {}),
  });
  assert.equal(plan, "queued");
  return { lessonId, participantId: mock.store.participants.by("lessonId", lessonId)[0]!.id };
}

describe("planner.saveLessonItems", () => {
  it("replaces a set differentially: kept rows keep their ids, new numbers are NEW, parts and order follow the lists", async () => {
    const mock = await signedIn(ANNA);
    const participantId = pid("les_manual", "ilya");
    const events = captureEvents(mock);

    const items = await mock.api.planner.saveLessonItems("les_manual", participantId, [num("508"), num("505"), num("509")], [num("510"), num("506")]);
    assert.deepEqual(items.map((item) => [item.id.startsWith("li_les_manual_") ? item.id : "new", item.number, item.isExtra, item.reason]), [
      [iid("les_manual", "ilya", "508"), "508", false, "NEW"],
      [iid("les_manual", "ilya", "505"), "505", false, "NEW"],
      ["new", "509", false, "NEW"],
      ["new", "510", true, "NEW"],
      [iid("les_manual", "ilya", "506"), "506", true, "NEW"],
    ]);
    assert.deepEqual(mock.ctx.q.items(participantId).map((item) => item.order), [0, 1, 2, 3, 4]);
    assert.equal(mock.store.lessonItems.has(iid("les_manual", "ilya", "507")), false);
    const added = items[2]!;
    assert.deepEqual([added.minutes, added.comment, added.result, added.submission, added.topicTitle, added.studentStatus], [null, null, null, null, "Текстовые задачи", null]);
    assert.equal(added.conditionLatex, mock.store.numbers.get(num("509"))!.conditionLatex);
    // The plan state stays as it was; nobody is notified.
    const participant = mock.store.participants.get(participantId)!;
    assert.deepEqual([participant.planGeneratedAt !== null, participant.planError, participant.planSummary], [true, null, null]);
    assert.deepEqual(events, []);

    // The board reads the same set.
    const board = await mock.api.planner.getLessonBoard("les_manual");
    assert.deepEqual(board.participants[0]!.items, items);

    // An empty list clears the set.
    assert.deepEqual(await mock.api.planner.saveLessonItems("les_manual", participantId, []), []);
    assert.equal(mock.ctx.q.items(participantId).length, 0);
  });

  it("normalises the lists: trim, blanks, duplicates, main wins over extra, unknown ids dropped, 40 per part", async () => {
    const mock = await signedIn(ANNA);
    const participantId = pid("les_manual", "ilya");
    const p = mock.api.planner;

    const cleaned = await p.saveLessonItems("les_manual", participantId, [` ${num("505")} `, num("505"), "", "num_unknown"], [num("505"), num("506"), num("506"), "  "]);
    assert.deepEqual(cleaned.map((item) => [item.number, item.isExtra]), [["505", false], ["506", true]]);

    const word = mock.ctx.q.numbersOfTopic("top_word").map((number) => number.id);
    assert.equal(word.length, 40);
    // 41 ids in the main part: the 41st is cut.
    const main41 = await p.saveLessonItems("les_manual", participantId, [...word, num("112")]);
    assert.equal(main41.length, 40);
    assert.equal(main41.some((item) => item.number === "112"), false);
    // The cut happens before unknown ids are dropped: an unknown id takes one of the 40 places.
    const withUnknown = await p.saveLessonItems("les_manual", participantId, ["num_unknown", ...word]);
    assert.equal(withUnknown.length, 39);
    // 41 ids in the extra part: 40 stay.
    const extra41 = await p.saveLessonItems("les_manual", participantId, [num("112")], [...word, num("113")]);
    assert.deepEqual([extra41.filter((item) => !item.isExtra).length, extra41.filter((item) => item.isExtra).length], [1, 40]);
    assert.equal(extra41.some((item) => item.number === "113"), false);
    assert.deepEqual(mock.ctx.q.items(participantId).map((item) => item.order), Array.from({ length: 41 }, (_, index) => index));

    const invalid = await rejects(p.saveLessonItems("les_manual", participantId, "num_505" as unknown as string[]), "numbersRequired", 400);
    assert.equal(invalid.message, ru.apiPlanner.lessonItems.numbersRequired);
    await rejects(p.saveLessonItems("les_manual", participantId, undefined as unknown as string[]), "numbersRequired", 400);
    assert.equal(mock.ctx.q.items(participantId).length, 41);
  });

  it("refuses to remove a number the student has handed in; moving it between parts is fine", async () => {
    const mock = await signedIn(ANNA);
    const participantId = pid("les_live", "polina");
    const p = mock.api.planner;
    const before = labelsOf(mock, participantId);
    assert.deepEqual(before, ["010203", "010204", "010205", "010206", "010207", "010208", "010209", "010210", "010211"]);

    const blocked = await rejects(p.saveLessonItems("les_live", participantId, before.slice(2).map(num)), "blockedNumbers", 409);
    assert.equal(blocked.message, "Нельзя убрать номер, по которому ученик уже сдавал решение: 010203, 010204.");
    assert.deepEqual(blocked.params, { numbers: "010203, 010204" });
    assert.deepEqual(blocked.details, { numbers: ["010203", "010204"] });
    // Nothing was written, not even the removal of the unrelated numbers in the same request.
    assert.deepEqual(labelsOf(mock, participantId), before);
    await rejects(p.saveLessonItems("les_live", participantId, []), "blockedNumbers", 409);

    // Reorder, move a handed-in number to the extra part, drop one without submissions: allowed.
    const main = ["010204", "010205", "010206", "010207", "010208", "010209"].map(num);
    const saved = await p.saveLessonItems("les_live", participantId, main, [num("010203"), num("010210")]);
    assert.deepEqual(saved.map((item) => [item.number, item.isExtra]), [
      ["010204", false], ["010205", false], ["010206", false], ["010207", false], ["010208", false], ["010209", false], ["010203", true], ["010210", true],
    ]);
    const moved = saved.find((item) => item.number === "010203")!;
    // The row is the same one: result and submissions survive.
    assert.deepEqual([moved.id, moved.result, moved.submission?.verdict], [iid("les_live", "polina", "010203"), "SOLVED", "CORRECT"]);
    assert.equal(mock.store.lessonItems.has(iid("les_live", "polina", "010211")), false);

    const english = await signedIn(ANNA, { locale: "en" });
    const text = (await rejects(english.api.planner.saveLessonItems("les_live", participantId, []), "blockedNumbers", 409)).message;
    assert.ok(text.startsWith("A problem the student has already submitted a solution for can't be removed: 010203, 010204"));
  });

  it("leaves the mirrored status and a plan error untouched", async () => {
    const mock = await signedIn(ANNA);
    const p = mock.api.planner;
    // A removed item with a result does not roll the student's progress back.
    const artem = pid("les_tomorrow_group", "artem");
    await p.setItemResult("les_tomorrow_group", artem, iid("les_tomorrow_group", "artem", "401"), "SOLVED");
    await p.saveLessonItems("les_tomorrow_group", artem, ["402", "403"].map(num));
    assert.equal(statusOf(mock, "usr_artem", "401")?.status, "GREEN");

    // A failed participant can always be edited by hand; the error goes away only after a successful regenerate.
    const failed = pid("les_unscheduled", "artem");
    assert.equal((await p.saveLessonItems("les_unscheduled", failed, [num("204")])).length, 1);
    const row = mock.store.participants.get(failed)!;
    assert.deepEqual([row.planError, row.planGeneratedAt], ["plan-error:failed", null]);
  });

  it("serves homework drafts too, and freezes an issued participant by the stored stamp", async () => {
    const mock = await signedIn(ANNA);
    const p = mock.api.planner;
    const ilya = pid("hp_ready", "ilya");
    const saved = await p.saveLessonItems("hp_ready", ilya, ["010211", "010212", "010213", "010203"].map(num), []);
    assert.deepEqual(saved.map((item) => item.number), ["010211", "010212", "010213", "010203"]);
    assert.deepEqual((await p.getHomeworkPlanBoard("hp_ready")).participants[0]!.items.map((item) => item.number), ["010211", "010212", "010213", "010203"]);

    const issued = await rejects(p.saveLessonItems("hp_issued", pid("hp_issued", "artem"), []), "homeworkAlreadyIssued", 409);
    assert.equal(issued.message, ru.apiPlanner.lessonItems.homeworkAlreadyIssued);
    // The stale stamp (the homework was cancelled) freezes the participant as well.
    await rejects(p.saveLessonItems("hp_issued", pid("hp_issued", "polina"), [num("223")]), "homeworkAlreadyIssued", 409);
    // The issued check comes before the shape check.
    await rejects(p.saveLessonItems("hp_issued", pid("hp_issued", "artem"), null as unknown as string[]), "homeworkAlreadyIssued", 409);
  });

  it("answers 404 for a foreign, mismatched or transferred participant; is limited to 60 per minute", async () => {
    const mock = await signedIn(ANNA);
    const p = mock.api.planner;
    const missing = await rejects(p.saveLessonItems("les_manual", pid("les_live", "polina"), []), "participantNotFound", 404);
    assert.equal(missing.message, ru.apiPlanner.lessonItems.participantNotFound);
    await rejects(p.saveLessonItems("les_igor_1", pid("les_igor_1", "sofia"), []), "participantNotFound", 404);
    await rejects(p.saveLessonItems("les_manual", "lp_nope", []), "participantNotFound", 404);
    await rejects(p.saveLessonItems("nope", pid("les_manual", "ilya"), []), "participantNotFound", 404);

    mock.store.users.update("usr_ilya", { teacherId: "usr_igor" });
    await rejects(p.saveLessonItems("les_manual", pid("les_manual", "ilya"), []), "participantNotFound", 404);
    assert.equal(mock.ctx.q.items(pid("les_manual", "ilya")).length, 4);
    mock.store.users.update("usr_ilya", { teacherId: "usr_anna" });

    mock.ctx.limits.exhaust("api:lesson-items", "usr_anna");
    await rejects(p.saveLessonItems("les_manual", pid("les_manual", "ilya"), []), "rateLimited", 429);
    assert.equal(mock.ctx.q.items(pid("les_manual", "ilya")).length, 4);

    const dev = await signedIn(DEV);
    assert.equal((await dev.api.planner.saveLessonItems("les_igor_1", pid("les_igor_1", "sofia"), [num("301")])).length, 1);
  });
});

describe("planner.setItemResult", () => {
  it("marks a result, mirrors it onto the number status and records history, journal and events", async () => {
    const mock = await signedIn(ANNA);
    const p = mock.api.planner;
    const participantId = pid("les_tomorrow_group", "artem");
    const item = iid("les_tomorrow_group", "artem", "401");
    const set = (result: LessonItemResult | null) => p.setItemResult("les_tomorrow_group", participantId, item, result);
    assert.equal(statusOf(mock, "usr_artem", "401"), undefined);
    const events = captureEvents(mock);

    assert.deepEqual(await set("SOLVED"), { result: "SOLVED", studentStatus: "GREEN" });
    assert.equal(mock.store.lessonItems.get(item)?.result, "SOLVED");
    assert.deepEqual([statusOf(mock, "usr_artem", "401")?.status, statusOf(mock, "usr_artem", "401")?.statusChangedAt], ["GREEN", TEST_T0]);
    assert.deepEqual(events, [
      { kind: "student-progress-changed", studentId: "usr_artem", topicId: "top_systems" },
      { kind: "lesson-activity", lessonId: "les_tomorrow_group", teacherId: "usr_anna", studentId: "usr_artem" },
    ]);
    const history = () => mock.store.progressEvents.by("studentNumber", `usr_artem|${num("401")}`);
    const entry = history().at(-1)!;
    assert.deepEqual(
      [entry.source, entry.previousStatus, entry.requestedStatus, entry.status, entry.actorId, entry.actorName, entry.actorRole],
      ["lesson_teacher", null, "GREEN", "GREEN", "usr_anna", "Анна Петрова", "TEACHER"],
    );
    assert.deepEqual(entry.context, { lessonId: "les_tomorrow_group", itemId: item, lessonResult: "SOLVED" });
    assert.deepEqual([lastAudit(mock).action, lastAudit(mock).category, lastAudit(mock).actorId], ["progress.status", "DATA", "usr_anna"]);

    // The same value again is still written ("reaffirmed") and refreshes the mark time.
    mock.clock.advance(MINUTE_MS);
    assert.deepEqual(await set("SOLVED"), { result: "SOLVED", studentStatus: "GREEN" });
    assert.equal(statusOf(mock, "usr_artem", "401")?.statusChangedAt, iso(MINUTE_MS));
    assert.equal(history().at(-1)?.decision, "reaffirmed");

    // A lesson result overrides the status unconditionally — also downwards.
    assert.deepEqual(await set("PARTIAL"), { result: "PARTIAL", studentStatus: "YELLOW" });
    assert.deepEqual(await set("NOT_SOLVED"), { result: "NOT_SOLVED", studentStatus: "RED" });
    // "Not reached" after a real result clears the status…
    assert.deepEqual(await set("SKIPPED"), { result: "SKIPPED", studentStatus: null });
    assert.equal(statusOf(mock, "usr_artem", "401")?.status, null);
    // …and clearing "not reached" changes nothing.
    assert.deepEqual(await set(null), { result: null, studentStatus: null });
    assert.equal(mock.store.lessonItems.get(item)?.result, null);
    assert.equal(history().length, 6);
    assert.equal(events.length, 12);

    // Tapping the active button clears the result and the status it had set.
    await set("SOLVED");
    assert.deepEqual(await set(null), { result: null, studentStatus: null });
  });

  it("keeps the current status when the result carries none (null / SKIPPED without a previous result)", async () => {
    const mock = await signedIn(ANNA);
    const p = mock.api.planner;
    const participantId = pid("les_tomorrow_group", "artem");
    assert.equal(statusOf(mock, "usr_artem", "124")?.status, "RED");
    const changedAt = statusOf(mock, "usr_artem", "124")?.statusChangedAt;
    assert.deepEqual(await p.setItemResult("les_tomorrow_group", participantId, iid("les_tomorrow_group", "artem", "124"), "SKIPPED"), { result: "SKIPPED", studentStatus: "RED" });
    assert.deepEqual(await p.setItemResult("les_tomorrow_group", participantId, iid("les_tomorrow_group", "artem", "124"), null), { result: null, studentStatus: "RED" });
    assert.equal(statusOf(mock, "usr_artem", "124")?.statusChangedAt, changedAt);
    // Still recorded in the history, as "no change".
    assert.equal(mock.store.progressEvents.by("studentNumber", `usr_artem|${num("124")}`).filter((event) => event.source === "lesson_teacher").length, 2);
  });

  it("is allowed in any lesson status and re-marks an automatic result", async () => {
    const mock = await signedIn(ANNA);
    const p = mock.api.planner;
    // Finished weeks ago.
    assert.deepEqual(await p.setItemResult("les_g1", pid("les_g1", "polina"), iid("les_g1", "polina", "204"), "SOLVED"), { result: "SOLVED", studentStatus: "GREEN" });
    // Running: the teacher decides the "not recognised" submission.
    assert.deepEqual(await p.setItemResult("les_live", pid("les_live", "polina"), iid("les_live", "polina", "010206"), "PARTIAL"), { result: "PARTIAL", studentStatus: "YELLOW" });
    const board = await p.getLessonBoard("les_live");
    const item = board.participants.find((participant) => participant.studentId === "usr_polina")!.items.find((entry) => entry.number === "010206")!;
    assert.deepEqual([item.result, item.studentStatus, item.submission?.verdict], ["PARTIAL", "YELLOW", "UNCERTAIN"]);
    // Unscheduled.
    const manual = await p.createLesson({ studentIds: ["usr_timur"], skipPlan: true, numberIds: [num("112")] });
    const participant = mock.store.participants.by("lessonId", manual.lessonId)[0]!;
    assert.equal((await p.setItemResult(manual.lessonId, participant.id, mock.ctx.q.items(participant.id)[0]!.id, "NOT_SOLVED")).studentStatus, "RED");
  });

  it("validates the result and the address of the item", async () => {
    const mock = await signedIn(ANNA);
    const p = mock.api.planner;
    const participantId = pid("les_tomorrow_group", "artem");
    const item = iid("les_tomorrow_group", "artem", "401");

    const invalid = await rejects(p.setItemResult("les_tomorrow_group", participantId, item, "DONE" as LessonItemResult), "invalidResult", 400);
    assert.equal(invalid.message, ru.apiPlanner.lessonResult.invalidResult);
    // A body without the key.
    await rejects(p.setItemResult("les_tomorrow_group", participantId, item, undefined as unknown as null), "invalidResult", 400);
    assert.equal(mock.store.lessonItems.get(item)?.result, null);

    const missing = await rejects(p.setItemResult("les_tomorrow_group", pid("les_tomorrow_group", "polina"), item, "SOLVED"), "itemNotFound", 404);
    assert.equal(missing.message, ru.apiPlanner.lessonResult.itemNotFound);
    await rejects(p.setItemResult("les_live", participantId, item, "SOLVED"), "itemNotFound", 404);
    await rejects(p.setItemResult("les_tomorrow_group", participantId, "li_nope", "SOLVED"), "itemNotFound", 404);
    // The body is read before the item is looked up (the site's handler order, 05 §3.8).
    await rejects(p.setItemResult("les_tomorrow_group", participantId, "li_nope", "DONE" as LessonItemResult), "invalidResult", 400);
    // Homework has no lesson results.
    await rejects(p.setItemResult("hp_ready", pid("hp_ready", "ilya"), iid("hp_ready", "ilya", "010211"), "SOLVED"), "itemNotFound", 404);
    await rejects(p.setItemResult("les_igor_1", pid("les_igor_1", "sofia"), iid("les_igor_1", "sofia", "308"), "SOLVED"), "itemNotFound", 404);

    mock.store.users.update("usr_artem", { teacherId: "usr_igor" });
    await rejects(p.setItemResult("les_tomorrow_group", participantId, item, "SOLVED"), "itemNotFound", 404);
    assert.equal(statusOf(mock, "usr_artem", "401"), undefined);
    mock.store.users.update("usr_artem", { teacherId: "usr_anna" });

    mock.ctx.limits.exhaust("api:lesson-item-result", "usr_anna");
    await rejects(p.setItemResult("les_tomorrow_group", participantId, item, "SOLVED"), "rateLimited", 429);

    const dev = await signedIn(DEV);
    assert.deepEqual(await dev.api.planner.setItemResult("les_igor_1", pid("les_igor_1", "sofia"), iid("les_igor_1", "sofia", "308"), "SOLVED"), { result: "SOLVED", studentStatus: "GREEN" });
    assert.equal(dev.store.progressEvents.all().at(-1)?.actorRole, "DEVELOPER");
  });
});

describe("planner.regenerateParticipant", () => {
  it("re-queues a failed participant: pending at once, resolved by the generator after its delay", async () => {
    const mock = await signedIn(ANNA);
    const p = mock.api.planner;
    // Кирилл is second in name order → 6 s.
    const participantId = pid("les_unscheduled", "kirill");
    mock.clock.advance(HOUR_MS);

    assert.deepEqual(await p.regenerateParticipant("les_unscheduled", participantId), { planRequestedAt: iso(HOUR_MS) });
    const row = mock.store.participants.get(participantId)!;
    assert.deepEqual([row.planGeneratedAt, row.planError], [null, null]);
    // The server keeps `createdAt`; the client anchors the stale timer on `planRequestedAt`.
    assert.equal(row.createdAt, mock.store.lessons.get("les_unscheduled")!.createdAt);
    assert.deepEqual(planJobs(mock, participantId).map((job) => [job.state, job.delayMs]), [["armed", 6000]]);
    assert.equal(budgetHits(mock), 1);

    const pending = await p.getLessonStatus("les_unscheduled");
    assert.deepEqual([pending.ready, pending.failed, pending.pending], [0, 2, 1]);
    mock.clock.advance(5999);
    assert.equal((await p.getLessonStatus("les_unscheduled")).pending, 1);
    mock.clock.advance(1);
    const done = await p.getLessonStatus("les_unscheduled");
    assert.deepEqual([done.ready, done.failed, done.pending], [1, 2, 0]);
    assert.equal(planJobs(mock, participantId).length, 0);
    // The quadratic numbers Кирилл has not solved and that are in no set or active homework.
    const board = await p.getLessonBoard("les_unscheduled");
    const kirill = board.participants.find((participant) => participant.studentId === "usr_kirill")!;
    assert.equal(kirill.planError, null);
    assert.equal(kirill.planGeneratedAt, iso(HOUR_MS + 6000));
    assert.ok(kirill.items.length > 0 && kirill.items.every((item) => item.topicTitle === "Квадратные функции"));
    assert.ok(kirill.items.every((item) => item.studentStatus !== "GREEN" && item.studentStatus !== "YELLOW"));
  });

  it("keeps the previous set and summary until the new plan arrives", async () => {
    const mock = await signedIn(ANNA);
    const p = mock.api.planner;
    const participantId = pid("les_tomorrow_group", "kirill");
    const before = (await p.getLessonBoard("les_tomorrow_group")).participants.find((participant) => participant.id === participantId)!;
    assert.equal(before.items.length, 7);

    await p.regenerateParticipant("les_tomorrow_group", participantId);
    const during = (await p.getLessonBoard("les_tomorrow_group")).participants.find((participant) => participant.id === participantId)!;
    assert.deepEqual([during.planGeneratedAt, during.planError, during.planSummary], [null, null, before.planSummary]);
    assert.deepEqual(during.items.map((item) => item.id), before.items.map((item) => item.id));
    assert.deepEqual((await p.getLessonStatus("les_tomorrow_group")).participants.map((participant) => participant.itemsCount), [7, 7, 7]);

    mock.clock.advance(6000);
    const after = (await p.getLessonBoard("les_tomorrow_group")).participants.find((participant) => participant.id === participantId)!;
    // The set being regenerated counts as "already in a set": systems, 127 and 130 are excluded; left are the
    // gap 120 (not solved at an earlier lesson, RED) and 124 (not reached earlier).
    assert.deepEqual(after.items.map((item) => [item.number, item.reason, item.minutes, item.isExtra, item.comment]), [
      ["120", "GAP", 10, false, GAP_COMMENT_RU],
      ["124", "NEW", 10, false, null],
    ]);
    assert.equal(after.planSummary, SUMMARY_MIXED_RU);
    assert.equal(before.items.every((item) => !mock.store.lessonItems.has(item.id)), true);
  });

  it("does not delete numbers the student has handed in when the new plan is written", async () => {
    const mock = await signedIn(ANNA);
    const p = mock.api.planner;
    const participantId = pid("les_live", "polina");
    await p.regenerateParticipant("les_live", participantId);
    mock.clock.advance(7000);
    await p.getLessonStatus("les_live");

    const rows = mock.ctx.q.items(participantId);
    const labels = rows.map((item) => mock.store.numbers.get(item.homeworkNumberId)!.number).sort();
    // Handed in: 010203 … 010208 stay with their rows; 010209 … 010211 are replaced by the new plan.
    assert.deepEqual(labels, ["010203", "010204", "010205", "010206", "010207", "010208", "010212", "010213", "010214"]);
    for (const label of ["010203", "010204", "010205", "010206", "010207", "010208"]) assert.ok(mock.store.lessonItems.has(iid("les_live", "polina", label)), label);
    assert.equal(mock.store.lessonItems.get(iid("les_live", "polina", "010205"))?.result, "NOT_SOLVED");
    assert.equal(mock.store.submissions.by("itemId", iid("les_live", "polina", "010203")).length, 1);
    assert.notEqual(mock.store.participants.get(participantId)?.planGeneratedAt, null);
  });

  it("re-queues a stale participant (\"Retry\")", async () => {
    const mock = await signedIn(ANNA);
    const p = mock.api.planner;
    const participantId = pid("les_stale", "dasha");
    assert.equal(planJobs(mock, participantId).length, 0);
    assert.ok(T0 - Date.parse(mock.store.participants.get(participantId)!.createdAt) > 15 * MINUTE_MS);

    await p.regenerateParticipant("les_stale", participantId);
    mock.clock.advance(5000);
    const board = await p.getLessonBoard("les_stale");
    assert.deepEqual(board.participants[0]!.items.map((item) => [item.number, item.isExtra]), [
      ["301", false], ["302", false], ["305", false], ["308", false], ["310", false], ["312", true],
    ]);
    assert.equal(board.participants[0]!.planSummary, SUMMARY_NEW_RU);
  });

  it("refuses without changing anything: issued, planner off, budget used up, queue full", async () => {
    const mock = await signedIn(ANNA);
    const p = mock.api.planner;
    const participantId = pid("les_unscheduled", "artem");
    const untouched = () => {
      const row = mock.store.participants.get(participantId)!;
      assert.deepEqual([row.planError, row.planGeneratedAt, planJobs(mock, participantId).length], ["plan-error:failed", null, 0]);
    };

    await rejects(p.regenerateParticipant("hp_issued", pid("hp_issued", "artem")), "homeworkAlreadyIssued", 409);
    await rejects(p.regenerateParticipant("hp_issued", pid("hp_issued", "polina")), "homeworkAlreadyIssued", 409);

    // Coverage "plan.retryRefused": settings, the daily budget, the queue switch.
    mock.store.patchSettings({ lessonPlanEnabled: false });
    const off = await rejects(p.regenerateParticipant("les_unscheduled", participantId), "plannerUnavailable", 503);
    assert.deepEqual([off.message, off.retryAfterSeconds], [ru.apiPlanner.lessons.plannerUnavailable, undefined]);
    untouched();
    // The lesson switch does not block drafts, and the other way round.
    assert.ok((await p.regenerateParticipant("hp_errors", pid("hp_errors", "artem"))).planRequestedAt);
    mock.store.patchSettings({ lessonPlanEnabled: true, homeworkPlanEnabled: false });
    await rejects(p.regenerateParticipant("hp_errors", pid("hp_errors", "kirill")), "plannerUnavailable", 503);
    assert.equal(mock.store.participants.get(pid("hp_errors", "kirill"))?.planError, "plan-error:homeworkNoCandidates");
    mock.store.patchSettings({ homeworkPlanEnabled: true, aiEnabled: false });
    await rejects(p.regenerateParticipant("les_unscheduled", participantId), "plannerUnavailable", 503);
    mock.store.patchSettings({ aiEnabled: true });

    mock.api.controls.exhaust("api:ai-plans:global", "global");
    const budget = await rejects(p.regenerateParticipant("les_unscheduled", participantId), "budgetExhausted", 429);
    assert.equal(budget.message, ru.planner.planErrors.budgetExhausted);
    // No Retry-After for the planner budget; the reset moment is 00:00 UTC (03:00 Moscow).
    assert.equal(budget.retryAfterSeconds, undefined);
    assert.deepEqual(budget.details, { resetAt: new Date(Math.floor(T0 / AI_BUDGET_WINDOW_MS) * AI_BUDGET_WINDOW_MS + AI_BUDGET_WINDOW_MS).toISOString() });
    // A refused attempt is not counted.
    assert.equal(budgetHits(mock), 300);
    untouched();
    mock.api.controls.clearLimiters();

    mock.api.controls.set("planQueueFull", true);
    const queue = await rejects(p.regenerateParticipant("les_unscheduled", participantId), "queueFull", 503);
    assert.deepEqual([queue.message, queue.retryAfterSeconds], [ru.planner.planErrors.queueFull, undefined]);
    assert.equal(budgetHits(mock), undefined);
    untouched();
    mock.api.controls.set("planQueueFull", false);

    await rejects(p.regenerateParticipant("les_unscheduled", pid("les_live", "artem")), "participantNotFound", 404);
    await rejects(p.regenerateParticipant("les_igor_1", pid("les_igor_1", "sofia")), "participantNotFound", 404);
    mock.store.users.update("usr_artem", { teacherId: "usr_igor" });
    await rejects(p.regenerateParticipant("les_unscheduled", participantId), "participantNotFound", 404);
    mock.store.users.update("usr_artem", { teacherId: "usr_anna" });
    untouched();

    // After all refusals a plain retry is accepted.
    assert.ok((await p.regenerateParticipant("les_unscheduled", participantId)).planRequestedAt);

    const english = await signedIn(ANNA, { locale: "en" });
    english.api.controls.set("planQueueFull", true);
    assert.equal((await rejects(english.api.planner.regenerateParticipant("les_unscheduled", participantId), "queueFull", 503)).message, en.planner.planErrors.queueFull);
  });
});

describe("planner: plan generation on the mock clock", () => {
  it("fills the lesson time with numbers in book order and puts the next ones into the extra part", async () => {
    const mock = await signedIn(ANNA);
    const p = mock.api.planner;
    const { lessonId, participantId } = await newLesson(mock, "usr_timur");

    mock.clock.advance(4999);
    assert.deepEqual((await p.getLessonStatus(lessonId)).pending, 1);
    mock.clock.advance(1);
    const status = await p.getLessonStatus(lessonId);
    assert.deepEqual([status.ready, status.pending, status.participants[0]!.itemsCount, status.participants[0]!.planGeneratedAt], [1, 0, 8, iso(5000)]);

    // 60 minutes, 8 minutes a number (no speed set): seven fit, the eighth goes to the extra part.
    const participant = (await p.getLessonBoard(lessonId)).participants[0]!;
    assert.deepEqual(participant.items.map((item) => [item.number, item.isExtra, item.reason, item.minutes, item.comment, item.result]), [
      ["112", false, "NEW", 8, null, null],
      ["113", false, "NEW", 8, null, null],
      ["118", false, "NEW", 8, null, null],
      ["120", false, "NEW", 8, null, null],
      ["121", false, "NEW", 8, null, null],
      ["124", false, "NEW", 8, null, null],
      ["127", false, "NEW", 8, null, null],
      ["130", true, "NEW", 8, null, null],
    ]);
    assert.deepEqual(mock.ctx.q.items(participantId).map((item) => item.order), [0, 1, 2, 3, 4, 5, 6, 7]);
    assert.deepEqual([participant.planSummary, participant.planError], [SUMMARY_NEW_RU, null]);

    // One AI row in the journal per generation, attributed to the teacher who asked.
    const audit = lastAudit(mock);
    assert.deepEqual(
      [audit.category, audit.action, audit.outcome, audit.actorId, audit.targetType, audit.targetId, audit.targetLabel, audit.model, audit.durationMs, audit.error],
      ["AI", "lesson_plan.generate", "ok", "usr_anna", "User", "usr_timur", "Тимур Новиков", "gpt-6.1-sol", 5000, null],
    );
    assert.equal(audit.summary, "Подбор набора на урок для ученика Тимур Новиков");
    assert.ok((audit.inputTokens ?? 0) > 0 && (audit.outputTokens ?? 0) > 0 && Number(audit.costRub) > 0);
    // A generation keeps its budget slot.
    assert.equal(budgetHits(mock), 1);
  });

  it("scales the minutes by the speed (lesson override, else the profile) and honours the duration", async () => {
    const mock = await signedIn(ANNA);
    const p = mock.api.planner;
    // One lesson at a time: the numbers of an existing set are excluded from the next selection.
    const shape = async (input: { durationMinutes?: number; speed?: number | null }) => {
      const { lessonId } = await newLesson(mock, "usr_timur", input);
      mock.clock.advance(5000);
      const items = (await p.getLessonBoard(lessonId)).participants[0]!.items;
      await p.deleteLesson(lessonId);
      return [items.filter((item) => !item.isExtra).length, items.filter((item) => item.isExtra).length, items[0]!.minutes];
    };

    // Speed 10: 4 minutes each — all eight numbers fit into the hour.
    assert.deepEqual(await shape({ speed: 10 }), [8, 0, 4]);
    // Speed 1: 11 minutes each — five fit, two more go to the extra part.
    assert.deepEqual(await shape({ speed: 1 }), [5, 2, 11]);
    // 15 minutes: one number, two extra.
    assert.deepEqual(await shape({ durationMinutes: 15 }), [1, 2, 8]);
    // An out-of-range override is clamped to 1..10.
    assert.deepEqual(await shape({ speed: 99 }), [8, 0, 4]);

    // Without an override the profile speed is used (Илья: 6 → 7 minutes).
    const profile = await newLesson(mock, "usr_ilya", { topicIds: ["top_word"] });
    mock.clock.advance(5000);
    const items = (await p.getLessonBoard(profile.lessonId)).participants[0]!.items;
    assert.equal(items[0]!.minutes, 7);
    // 501 … 504 are solved, 505 … 512 sit in an active homework and 505 … 508 in the manual lesson.
    assert.deepEqual(items.map((item) => item.number).slice(0, 3), ["513", "514", "515"]);
    assert.deepEqual([items.filter((item) => !item.isExtra).length, items.filter((item) => item.isExtra).length], [8, 2]);
  });

  it("puts gaps first and writes the model's texts in the teacher's language", async () => {
    const mock = await signedIn(ANNA);
    const p = mock.api.planner;
    // Даша, linear: 118 GREEN and 120 YELLOW are solved, 112 and 113 sit in an active homework,
    // 121 and 124 were "not reached" at a lesson (normal candidates), 127 is RED (a gap), 130 is untouched.
    const { lessonId, participantId } = await newLesson(mock, "usr_dasha");
    mock.clock.advance(5000);
    const russian = (await p.getLessonBoard(lessonId)).participants[0]!;
    assert.deepEqual(russian.items.map((item) => [item.number, item.reason, item.comment, item.studentStatus]), [
      ["127", "GAP", GAP_COMMENT_RU, "RED"],
      ["121", "NEW", null, null],
      ["124", "NEW", null, null],
      ["130", "NEW", null, null],
    ]);
    assert.equal(russian.planSummary, SUMMARY_MIXED_RU);

    // A generation started by a user action uses the language of THAT request, not the stored one.
    mock.setLocale("en");
    await p.regenerateParticipant(lessonId, participantId);
    mock.clock.advance(5000);
    const english = (await p.getLessonBoard(lessonId)).participants[0]!;
    // The previous set counts as "already in a set": nothing is left but the gap rule keeps nothing either.
    assert.equal(english.planError, "plan-error:noCandidates");
    assert.equal(mock.store.lessons.get(lessonId)?.planParams?.outputLocale, "ru");

    const fresh = await newLesson(mock, "usr_timur");
    mock.clock.advance(5000);
    assert.equal((await p.getLessonBoard(fresh.lessonId)).participants[0]!.planSummary, SUMMARY_NEW_EN);
    const gaps = await p.createLesson({ studentIds: ["usr_kirill"], topicIds: ["top_word"] });
    mock.clock.advance(5000);
    const kirill = (await p.getLessonBoard(gaps.lessonId)).participants[0]!;
    assert.deepEqual(kirill.items.slice(0, 2).map((item) => [item.number, item.reason, item.comment]), [
      ["502", "GAP", GAP_COMMENT_EN],
      ["503", "GAP", GAP_COMMENT_EN],
    ]);
  });

  it("picks from the whole bank without a topic filter and respects the item caps", async () => {
    const mock = await signedIn(ANNA);
    const p = mock.api.planner;
    const all = await newLesson(mock, "usr_timur", { topicIds: [] });
    mock.store.patchSettings({ lessonPlanMaxItems: 5 });
    const capped = await newLesson(mock, "usr_timur", { topicIds: [], durationMinutes: 240 });
    mock.clock.advance(5000);

    // The first read runs both generations; the cap in force at generation time applies to both.
    const first = (await p.getLessonBoard(all.lessonId)).participants[0]!.items;
    assert.deepEqual(first.map((item) => item.number), ["112", "113", "118", "120", "121", "124", "127"]);
    const second = (await p.getLessonBoard(capped.lessonId)).participants[0]!.items;
    // Main: at most `lessonPlanMaxItems`; the numbers of the first lesson's set are excluded now.
    assert.deepEqual([second.filter((item) => !item.isExtra).length, second.filter((item) => item.isExtra).length], [5, 2]);
    assert.deepEqual(second.map((item) => item.number), ["130", "204", "207", "211", "215", "218", "220"]);
  });

  it("stores a plan error when nothing can be picked — no model call, no journal row", async () => {
    const mock = await signedIn(ANNA);
    const p = mock.api.planner;
    // Артём, quadratic: six numbers are solved, 220 and 226 sit in an active homework.
    const participantId = pid("les_unscheduled", "artem");
    const audits = mock.store.auditLogs.size;
    await p.regenerateParticipant("les_unscheduled", participantId);
    mock.clock.advance(5000);
    const status = await p.getLessonStatus("les_unscheduled");
    assert.equal(status.participants[0]!.planError, "plan-error:noCandidates");
    assert.equal(mock.store.auditLogs.size, audits);
    assert.equal(planErrorText(status.participants[0]!.planError!, ru.planner.planErrors), ru.planner.planErrors.noCandidates);
    // The failed generation keeps its slot.
    assert.equal(budgetHits(mock), 1);
  });

  it("resolves a seeded pending generation with its script, counted from the first read", async () => {
    const mock = await signedIn(ANNA);
    const p = mock.api.planner;
    // Time passes before anybody looks at the lesson.
    mock.clock.advance(10 * MINUTE_MS);
    assert.deepEqual((await p.getLessonStatus("les_ilya_tomorrow")).pending, 1);
    mock.clock.advance(4999);
    assert.deepEqual((await p.getLessonStatus("les_ilya_tomorrow")).pending, 1);
    mock.clock.advance(1);
    assert.deepEqual((await p.getLessonStatus("les_ilya_tomorrow")).ready, 1);

    const participant = (await p.getLessonBoard("les_ilya_tomorrow")).participants[0]!;
    assert.deepEqual(participant.items.map((item) => [item.number, item.isExtra, item.reason]), [
      ["211", false, "NEW"], ["218", false, "NEW"], ["220", false, "NEW"], ["226", false, "GAP"], ["215", true, "NEW"], ["223", true, "NEW"],
    ]);
    assert.equal(participant.planSummary, "Разминка по прошлой теме, затем новые номера с нарастающей сложностью.");
    assert.equal(mock.store.planScripts.has(pid("les_ilya_tomorrow", "ilya")), false);
    // A seeded job carries no requester: the journal row goes to the lesson's teacher.
    assert.deepEqual([lastAudit(mock).action, lastAudit(mock).actorId], ["lesson_plan.generate", "usr_anna"]);
  });

  it("honours the one-shot nextPlanOutcome control", async () => {
    const mock = await signedIn(ANNA);
    const p = mock.api.planner;
    const run = async () => {
      const { lessonId } = await newLesson(mock, "usr_timur", { topicIds: ["top_systems"] });
      mock.clock.advance(5000);
      const participant = (await p.getLessonBoard(lessonId)).participants[0]!;
      await p.deleteLesson(lessonId);
      return participant;
    };

    mock.api.controls.set("nextPlanOutcome", "failed");
    const failed = await run();
    assert.deepEqual([failed.planError, failed.planGeneratedAt, failed.items.length], ["plan-error:failed", null, 0]);
    assert.equal(mock.api.controls.get().nextPlanOutcome, null);
    // The model was called and did not answer: a failed AI row.
    assert.deepEqual([lastAudit(mock).action, lastAudit(mock).outcome, lastAudit(mock).error, lastAudit(mock).outputTokens], ["lesson_plan.generate", "failed", "Request timed out", null]);

    // One-shot: the next generation is a normal one.
    assert.equal((await run()).planError, null);

    mock.api.controls.set("nextPlanOutcome", "emptyPlan");
    assert.equal((await run()).planError, "plan-error:emptyPlan");
    assert.deepEqual([lastAudit(mock).action, lastAudit(mock).outcome], ["lesson_plan.generate", "ok"]);

    const audits = mock.store.auditLogs.size;
    mock.api.controls.set("nextPlanOutcome", "studentMissing");
    assert.equal((await run()).planError, "plan-error:studentMissing");
    // A code only the homework generator writes is translated for a lesson…
    mock.api.controls.set("nextPlanOutcome", "homeworkNoCandidates");
    assert.equal((await run()).planError, "plan-error:noCandidates");
    mock.api.controls.set("nextPlanOutcome", "unavailable");
    assert.equal((await run()).planError, "plan-error:unavailable");
    assert.equal(mock.store.auditLogs.size, audits);
    // …and `homeworkParams` stays armed for the next draft generation.
    mock.api.controls.set("nextPlanOutcome", "homeworkParams");
    assert.equal((await run()).planError, null);
    assert.equal(mock.api.controls.get().nextPlanOutcome, "homeworkParams");
  });

  it("fails with `unavailable` when AI selection is switched off before the generation runs", async () => {
    const mock = await signedIn(ANNA);
    const { lessonId } = await newLesson(mock, "usr_timur");
    mock.api.controls.set("nextPlanOutcome", "failed");
    mock.store.patchSettings({ aiEnabled: false });
    mock.clock.advance(5000);
    const board = await mock.api.planner.getLessonBoard(lessonId);
    assert.deepEqual([board.aiAvailable, board.participants[0]!.planError], [false, "plan-error:unavailable"]);
    // The armed control was not spent on a generation that never reached the model.
    assert.equal(mock.api.controls.get().nextPlanOutcome, "failed");
  });

  it("resolves a group one participant after another and survives an app restart", async () => {
    const mock = await signedIn(ANNA);
    const p = mock.api.planner;
    const { lessonId } = await p.createLesson({ groupId: "grp_8a", studentIds: ["usr_artem", "usr_kirill", "usr_polina"], topicIds: ["top_word"] });
    const ready = async (api = p) => (await api.getLessonStatus(lessonId)).ready;
    mock.clock.advance(5000);
    assert.equal(await ready(), 1);
    mock.clock.advance(1000);
    assert.equal(await ready(), 2);

    // Jobs are rows of the persisted store: a second client on the same storage finishes the work.
    await mock.api.flush();
    const restarted = createTestMock({ storage: mock.storage, clock: mock.clock });
    await restarted.api.ready();
    await restarted.signIn(ANNA);
    assert.equal(await ready(restarted.api.planner), 2);
    mock.clock.advance(1000);
    assert.equal(await ready(restarted.api.planner), 3);
    assert.equal(restarted.ctx.jobs.lastError(), null);
  });

  it("attributes a developer's regenerate to the developer and stays quiet when the lesson is gone", async () => {
    const mock = await signedIn(DEV);
    await mock.api.planner.regenerateParticipant("les_dev_demo", pid("les_dev_demo", "orphan"));
    mock.clock.advance(5000);
    await mock.api.planner.getLessonStatus("les_dev_demo");
    assert.deepEqual([lastAudit(mock).action, lastAudit(mock).actorId, lastAudit(mock).actorRole], ["lesson_plan.generate", "usr_dev", "DEVELOPER"]);

    await mock.api.planner.regenerateParticipant("les_igor_1", pid("les_igor_1", "egor"));
    await mock.api.planner.deleteLesson("les_igor_1");
    mock.clock.advance(DAY_MS);
    await mock.api.planner.listLessons();
    assert.equal(mock.ctx.jobs.lastError(), null);
  });
});
