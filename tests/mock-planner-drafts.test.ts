// `planner` member of the mock backend — homework drafts: list, new-draft form, creation, board, status,
// issue, delete (docs/spec/05-teacher-lessons-plans.md §1.5 – §1.7, §3.13 – §3.16, §4.10; 90-addendum-6 §6.2, §6.4).
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError } from "../src/api/errors";
import type { AnyApiErrorCode } from "../src/api/errors";
import type { CreateHomeworkPlanInput, HomeworkPlanParams } from "../src/api/types";
import { PLAN_ERROR_CODES } from "../src/api/types";
import { formatDate } from "../src/domain/dates";
import { DAY_MS, HOUR_MS, MINUTE_MS } from "../src/domain/moscow-time";
import { planErrorText } from "../src/domain/plan-error";
import { getDictionary } from "../src/i18n/get-dictionary";
import { format } from "../src/lib/i18n/format";
import type { RealtimeEventInput } from "../src/mock/rules/realtime";
import { TEST_T0, createTestMock, type TestMock } from "../src/mock/testing";

const T0 = Date.parse(TEST_T0);
const iso = (offsetMs: number) => new Date(T0 + offsetMs).toISOString();
const ru = getDictionary("ru");
const en = getDictionary("en");

const ANNA = "teacher@example.com";
const IGOR = "teacher2@example.com";
const DEV = "dev@example.com";

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

const pid = (planId: string, student: string) => `lp_${planId}_${student}`;
const num = (label: string) => `num_${label}`;
const statusOf = (mock: TestMock, studentId: string, label: string) => mock.ctx.q.status(studentId, num(label));
const planJobs = (mock: TestMock, refId?: string) => mock.store.jobs.filter((job) => job.kind === "planGeneration" && (refId === undefined || job.refId === refId));
const budgetHits = (mock: TestMock) => mock.store.limiterBuckets.get("api:ai-plans:global|global")?.hits;
const labelsOf = (mock: TestMock, participantId: string) => mock.ctx.q.items(participantId).map((item) => mock.store.numbers.get(item.homeworkNumberId)!.number);
const lastAudit = (mock: TestMock) => mock.store.auditLogs.all().at(-1)!;
const draftInput = (input: Partial<CreateHomeworkPlanInput> = {}): CreateHomeworkPlanInput => ({ topicId: "top_linear", deadlineAt: iso(3 * DAY_MS), studentIds: ["usr_timur"], ...input });

describe("planner.listHomeworkPlans", () => {
  it("lists own drafts, newest first, with raw counters", async () => {
    const mock = await signedIn(ANNA);
    const plans = await mock.api.planner.listHomeworkPlans();
    assert.deepEqual(plans.map((plan) => plan.id), ["hp_generating", "hp_stale", "hp_queue", "hp_ready", "hp_errors", "hp_conflict", "hp_issued", "hp_past", "hp_full"]);
    const by = (id: string) => plans.find((plan) => plan.id === id)!;

    assert.deepEqual(by("hp_ready"), {
      id: "hp_ready",
      title: "Логарифмы к пятнице",
      deadlineAt: iso(4 * DAY_MS + 8 * HOUR_MS),
      createdAt: mock.store.lessons.get("hp_ready")!.createdAt,
      topicTitle: "Логарифмические уравнения",
      groupName: null,
      participantsCount: 2,
      readyCount: 2,
      failedCount: 0,
      issuedCount: 0,
    });
    assert.deepEqual([by("hp_generating").readyCount, by("hp_generating").failedCount, by("hp_generating").groupName], [0, 0, "8А — алгебра"]);
    assert.deepEqual([by("hp_errors").readyCount, by("hp_errors").failedCount, by("hp_errors").participantsCount], [0, 3, 3]);
    // The stored stamp counts even when the homework was cancelled (Полина).
    assert.deepEqual([by("hp_issued").issuedCount, by("hp_issued").participantsCount], [2, 2]);
    assert.deepEqual([by("hp_full").issuedCount, by("hp_full").participantsCount], [1, 1]);
    assert.ok(Date.parse(by("hp_past").deadlineAt!) < T0);
    assert.equal(by("hp_full").title, "ДЗ по теме «Квадратные функции» до 18 ноября 2026 г.");

    // A list read does not start the seeded generations.
    mock.clock.advance(MINUTE_MS);
    assert.equal((await mock.api.planner.listHomeworkPlans())[0]!.readyCount, 0);

    const igor = await signedIn(IGOR);
    assert.deepEqual(await igor.api.planner.listHomeworkPlans(), []);
    const dev = await signedIn(DEV);
    assert.equal((await dev.api.planner.listHomeworkPlans()).length, 9);
  });
});

describe("planner.getHomeworkPlanNewForm", () => {
  it("from a lesson: its participants, the dominant topic, a derived title", async () => {
    const mock = await signedIn(ANNA);
    const p = mock.api.planner;
    const title = "Занятие группы · Квадратные функции";
    const form = await p.getHomeworkPlanNewForm({ lessonId: "les_g4" });
    assert.deepEqual(form, {
      kicker: `По итогам занятия «${title}»`,
      topics: mock.ctx.q.topicsOrdered().map((topic) => ({ id: topic.id, title: topic.title })),
      members: [
        { id: "usr_artem", name: "Артём Кузнецов" },
        { id: "usr_kirill", name: "Кирилл Зайцев" },
        { id: "usr_polina", name: "Полина Морозова" },
      ],
      defaultTopicId: "top_quadratic",
      defaultTitle: `ДЗ по итогам «${title}»`,
      groupId: "grp_8a",
      sourceLessonId: "les_g4",
    });
    assert.equal(form.topics.length, 7);

    // Entry from a student card: homework for that participant only.
    const single = await p.getHomeworkPlanNewForm({ lessonId: "les_g4", studentId: "usr_polina" });
    assert.deepEqual(single.members, [{ id: "usr_polina", name: "Полина Морозова" }]);
    await rejects(p.getHomeworkPlanNewForm({ lessonId: "les_g4", studentId: "usr_ilya" }), "studentNotFound", 404);

    // Most items win (15 systems against 6 linear); a tie goes to the topic met first; no items → no default.
    assert.equal((await p.getHomeworkPlanNewForm({ lessonId: "les_tomorrow_group" })).defaultTopicId, "top_systems");
    const tie = await p.createLesson({ studentIds: ["usr_timur"], skipPlan: true, numberIds: [num("204"), num("112")] });
    assert.equal((await p.getHomeworkPlanNewForm({ lessonId: tie.lessonId })).defaultTopicId, "top_quadratic");
    const individual = await p.getHomeworkPlanNewForm({ lessonId: "les_unscheduled" });
    assert.deepEqual([individual.defaultTopicId, individual.members.length], [null, 3]);
    assert.equal((await p.getHomeworkPlanNewForm({ lessonId: "les_d1" })).groupId, null);

    const english = await signedIn(ANNA, { locale: "en" });
    const translated = await english.api.planner.getHomeworkPlanNewForm({ lessonId: "les_g4" });
    assert.equal(translated.kicker, format(en.planner.homeworkPlans.new.afterLesson, { title }));
    assert.equal(translated.defaultTitle, format(en.planner.homeworkPlans.new.defaultTitle, { title }));
  });

  it("from a group or a student: no default topic, no title", async () => {
    const mock = await signedIn(ANNA);
    const p = mock.api.planner;
    const group = await p.getHomeworkPlanNewForm({ groupId: "grp_8a" });
    assert.deepEqual([group.kicker, group.defaultTopicId, group.defaultTitle, group.groupId, group.sourceLessonId], ["8А — алгебра", null, "", "grp_8a", null]);
    assert.deepEqual(group.members.map((member) => member.id), ["usr_artem", "usr_kirill", "usr_maria", "usr_polina"]);
    assert.deepEqual(Object.keys(group.members[0]!).sort(), ["id", "name"]);
    // Nobody to assign to.
    assert.deepEqual((await p.getHomeworkPlanNewForm({ groupId: "grp_empty" })).members, []);

    const student = await p.getHomeworkPlanNewForm({ studentId: "usr_dasha" });
    assert.deepEqual([student.kicker, student.members, student.groupId, student.sourceLessonId, student.defaultTopicId], ["Даша Белова", [{ id: "usr_dasha", name: "Даша Белова" }], null, null, null]);
  });

  it("answers 404 for a draft as the lesson, foreign resources and a missing source", async () => {
    const mock = await signedIn(ANNA);
    const p = mock.api.planner;
    await rejects(p.getHomeworkPlanNewForm({ lessonId: "hp_ready" }), "lessonNotFound", 404);
    await rejects(p.getHomeworkPlanNewForm({ lessonId: "les_igor_1" }), "lessonNotFound", 404);
    await rejects(p.getHomeworkPlanNewForm({ groupId: "grp_10b" }), "groupNotFound", 404);
    await rejects(p.getHomeworkPlanNewForm({ studentId: "usr_egor" }), "studentNotFound", 404);
    await rejects(p.getHomeworkPlanNewForm({} as { studentId: string }), "lessonNotFound", 404);

    const dev = await signedIn(DEV);
    assert.equal((await dev.api.planner.getHomeworkPlanNewForm({ lessonId: "les_igor_1" })).members.length, 2);
  });
});

describe("planner.createHomeworkPlan", () => {
  it("creates a draft with one topic and a deadline, queues the generation and fills the time budget", async () => {
    const mock = await signedIn(ANNA);
    const p = mock.api.planner;
    const events = captureEvents(mock);
    const deadlineAt = iso(3 * DAY_MS);
    const { planId, plan } = await p.createHomeworkPlan(draftInput({ deadlineAt: "2026-11-19T12:00:00+03:00", teacherNote: " без параметра " }));
    assert.equal(plan, "queued");

    const title = format(ru.apiPlanner.homeworkPlans.defaultTitle, { topic: "Линейные уравнения", date: formatDate(deadlineAt, "ru") });
    assert.equal(title, "ДЗ по теме «Линейные уравнения» до 19 ноября 2026 г.");
    const row = mock.store.lessons.get(planId)!;
    assert.deepEqual(
      [row.kind, row.title, row.teacherId, row.groupId, row.topicId, row.deadlineAt, row.status, row.startsAt, row.subject],
      ["HOMEWORK", title, "usr_anna", null, "top_linear", deadlineAt, "PLANNED", null, "MATH"],
    );
    assert.deepEqual(row.planParams, { title, topicId: "top_linear", deadlineAt, teacherNote: "без параметра", sourceLessonId: null, dailyMinutes: 60, outputLocale: "ru" });
    const participant = mock.store.participants.by("lessonId", planId)[0]!;
    assert.deepEqual([participant.studentId, participant.speed, participant.planGeneratedAt, participant.planError, participant.issuedAssignmentId], ["usr_timur", null, null, null, null]);
    assert.deepEqual(planJobs(mock, participant.id).map((job) => job.delayMs), [5000]);
    assert.equal(budgetHits(mock), 1);
    // A draft has no schedule: nobody is notified.
    assert.deepEqual(events, []);

    const pending = await p.getHomeworkPlanStatus(planId);
    assert.deepEqual([pending.total, pending.ready, pending.failed, pending.issued, pending.pending], [1, 0, 0, 0, 1]);
    mock.clock.advance(5000);
    const board = await p.getHomeworkPlanBoard(planId);
    assert.deepEqual([board.title, board.topicId, board.deadlineAt, board.daysUntilDeadline, board.group, board.sourceLesson], [title, "top_linear", deadlineAt, 3, null, null]);
    // 60 minutes a day × 3 days: the whole topic fits. Main part only, never a comment.
    assert.deepEqual(board.participants[0]!.items.map((item) => [item.number, item.reason, item.minutes, item.comment]), [
      ["112", "NEW", 8, null], ["113", "NEW", 8, null], ["118", "NEW", 8, null], ["120", "NEW", 8, null],
      ["121", "NEW", 8, null], ["124", "NEW", 8, null], ["127", "NEW", 8, null], ["130", "NEW", 8, null],
    ]);
    assert.ok(mock.ctx.q.items(participant.id).every((item) => !item.isExtra));
    assert.equal(board.participants[0]!.planSummary, "Новые номера темы по порядку — объём рассчитан на время до следующего занятия.");
    assert.deepEqual([lastAudit(mock).category, lastAudit(mock).action, lastAudit(mock).actorId, lastAudit(mock).summary], ["AI", "homework_plan.generate", "usr_anna", "Подбор домашнего задания для ученика Тимур Новиков"]);

    assert.equal((await p.listHomeworkPlans())[0]!.id, planId);
  });

  it("normalises the daily minutes and sizes the set by minutes × days until the deadline", async () => {
    const mock = await signedIn(ANNA);
    const p = mock.api.planner;
    const params = (planId: string) => mock.store.lessons.get(planId)!.planParams as HomeworkPlanParams;

    // 15 minutes × 1 day (a deadline in two hours is "one day"): one number.
    const small = await p.createHomeworkPlan(draftInput({ deadlineAt: iso(2 * HOUR_MS), dailyMinutes: 5, title: "  Коротко  " }));
    assert.deepEqual([params(small.planId).dailyMinutes, params(small.planId).title, mock.store.lessons.get(small.planId)?.title], [15, "Коротко", "Коротко"]);
    mock.clock.advance(5000);
    const board = await p.getHomeworkPlanBoard(small.planId);
    assert.deepEqual([board.daysUntilDeadline, board.participants[0]!.items.map((item) => item.number)], [1, ["112"]]);
    await p.deleteHomeworkPlan(small.planId);

    assert.equal(params((await p.createHomeworkPlan(draftInput({ dailyMinutes: 15 }))).planId).dailyMinutes, 15);
    assert.equal(params((await p.createHomeworkPlan(draftInput({ dailyMinutes: 240 }))).planId).dailyMinutes, 240);
    assert.equal(params((await p.createHomeworkPlan(draftInput({ dailyMinutes: 999 }))).planId).dailyMinutes, 240);
    const long = await p.createHomeworkPlan(draftInput({ title: "д".repeat(250), teacherNote: "н".repeat(600) }));
    assert.deepEqual([params(long.planId).title.length, params(long.planId).teacherNote.length], [200, 500]);
  });

  it("puts gaps first for homework too, without comments; stores generation errors of the draft kind", async () => {
    const mock = await signedIn(ANNA);
    const p = mock.api.planner;
    const dasha = await p.createHomeworkPlan(draftInput({ studentIds: ["usr_dasha"] }));
    // Кирилл has closed every number of the topic.
    const kirill = await p.createHomeworkPlan(draftInput({ topicId: "top_systems", studentIds: ["usr_kirill"] }));
    // The deadline passes while the generation is waiting.
    const late = await p.createHomeworkPlan(draftInput({ deadlineAt: iso(3000) }));
    const audits = mock.store.auditLogs.size;
    mock.clock.advance(5000);

    const set = (await p.getHomeworkPlanBoard(dasha.planId)).participants[0]!;
    assert.deepEqual(set.items.map((item) => [item.number, item.reason, item.comment, item.studentStatus]), [
      ["127", "GAP", null, "RED"], ["121", "NEW", null, null], ["124", "NEW", null, null], ["130", "NEW", null, null],
    ]);
    assert.equal(set.planSummary, "Дома добиваем номера, которые не получились, и закрепляем новые по теме.");
    assert.equal((await p.getHomeworkPlanBoard(kirill.planId)).participants[0]!.planError, "plan-error:homeworkNoCandidates");
    assert.equal((await p.getHomeworkPlanBoard(late.planId)).participants[0]!.planError, "plan-error:homeworkParams");
    // Only the successful generation called the model.
    assert.equal(mock.store.auditLogs.size, audits + 1);

    // The one-shot control: `homeworkParams` applies to a draft, `noCandidates` is translated.
    mock.api.controls.set("nextPlanOutcome", "homeworkParams");
    const forced = await p.createHomeworkPlan(draftInput({ topicId: "top_word" }));
    mock.clock.advance(5000);
    assert.equal((await p.getHomeworkPlanStatus(forced.planId)).participants[0]!.planError, "plan-error:homeworkParams");
    assert.equal(mock.api.controls.get().nextPlanOutcome, null);
    mock.api.controls.set("nextPlanOutcome", "noCandidates");
    await p.regenerateParticipant(forced.planId, mock.store.participants.by("lessonId", forced.planId)[0]!.id);
    mock.clock.advance(5000);
    assert.equal((await p.getHomeworkPlanStatus(forced.planId)).participants[0]!.planError, "plan-error:homeworkNoCandidates");
  });

  it("keeps the source lesson only when it is the caller's own lesson", async () => {
    const mock = await signedIn(ANNA);
    const p = mock.api.planner;
    const source = async (sourceLessonId: string) => {
      const { planId } = await p.createHomeworkPlan(draftInput({ sourceLessonId, groupId: "grp_8a", studentIds: ["usr_artem"], title: "По итогам" }));
      return [(mock.store.lessons.get(planId)!.planParams as HomeworkPlanParams).sourceLessonId, (await p.getHomeworkPlanBoard(planId)).sourceLesson];
    };
    assert.deepEqual(await source("les_g4"), ["les_g4", { id: "les_g4", title: "Занятие группы · Квадратные функции" }]);
    assert.deepEqual(await source("les_igor_1"), [null, null]);
    assert.deepEqual(await source("hp_ready"), [null, null]);
    assert.deepEqual(await source("nope"), [null, null]);

    const dev = await signedIn(DEV);
    const any = await dev.api.planner.createHomeworkPlan(draftInput({ topicId: "top_derivative", studentIds: ["usr_sofia"], sourceLessonId: "les_igor_1" }));
    assert.equal(dev.store.lessons.get(any.planId)?.teacherId, "usr_dev");
    assert.equal((await dev.api.planner.getHomeworkPlanBoard(any.planId)).sourceLesson?.id, "les_igor_1");
  });

  it("validates topic, deadline and students", async () => {
    const mock = await signedIn(ANNA);
    const p = mock.api.planner;
    const before = mock.store.lessons.size;
    const required = ru.apiPlanner.homeworkPlans.topicAndDeadlineRequired;

    assert.equal((await rejects(p.createHomeworkPlan(draftInput({ topicId: "" })), "topicAndDeadlineRequired", 400)).message, required);
    await rejects(p.createHomeworkPlan(draftInput({ topicId: "   " })), "topicAndDeadlineRequired", 400);
    await rejects(p.createHomeworkPlan(draftInput({ deadlineAt: "" })), "topicAndDeadlineRequired", 400);
    await rejects(p.createHomeworkPlan(draftInput({ deadlineAt: "в пятницу" })), "topicAndDeadlineRequired", 400);
    await rejects(p.createHomeworkPlan(draftInput({ deadlineAt: iso(-DAY_MS) })), "topicAndDeadlineRequired", 400);
    // "In the future" is strict: now itself is refused, one millisecond later is fine.
    await rejects(p.createHomeworkPlan(draftInput({ deadlineAt: iso(0) })), "topicAndDeadlineRequired", 400);
    assert.equal((await p.createHomeworkPlan(draftInput({ deadlineAt: iso(1) }))).plan, "queued");

    assert.equal((await rejects(p.createHomeworkPlan(draftInput({ topicId: "top_missing" })), "topicNotFound", 404)).message, ru.apiCommon.topicNotFound);
    await rejects(p.createHomeworkPlan(draftInput({ groupId: "grp_10b" })), "groupNotFound", 404);
    await rejects(p.createHomeworkPlan(draftInput({ groupId: "grp_missing", topicId: "" })), "groupNotFound", 404);

    // A new minute: the create limit is 10 per minute.
    mock.clock.advance(MINUTE_MS);
    const nobody = await rejects(p.createHomeworkPlan(draftInput({ studentIds: [] })), "selectAtLeastOneStudent", 400);
    assert.equal(nobody.message, ru.apiPlanner.lessons.selectAtLeastOneStudent);
    await rejects(p.createHomeworkPlan(draftInput({ studentIds: ["usr_sofia", "usr_anna"] })), "selectAtLeastOneStudent", 400);
    await rejects(p.createHomeworkPlan(draftInput({ groupId: "grp_empty", studentIds: [] })), "selectAtLeastOneStudent", 400);

    const extra: string[] = [];
    for (let index = 0; index < 24; index += 1) {
      const id = `usr_extra_${index}`;
      mock.store.users.insert({ id, name: `Ученик ${index}`, email: `extra${index}@example.com`, role: "STUDENT", teacherId: "usr_anna", createdAt: iso(0), updatedAt: iso(0), password: "student123" });
      extra.push(id);
    }
    const own = ["usr_ilya", "usr_maria", "usr_artem", "usr_polina", "usr_kirill", "usr_dasha", "usr_timur"];
    const tooMany = await rejects(p.createHomeworkPlan(draftInput({ studentIds: [...own, ...extra] })), "tooManyStudents", 400);
    assert.deepEqual([tooMany.message, tooMany.params], ["Не больше 30 учеников за раз.", { max: 30 }]);
    assert.equal(mock.store.lessons.size, before + 1);

    // Exactly 30 students: one draft, 30 generations from the daily budget.
    const thirty = await p.createHomeworkPlan(draftInput({ studentIds: [...own, ...extra.slice(0, 23)] }));
    assert.equal(mock.store.participants.by("lessonId", thirty.planId).length, 30);
    assert.equal(budgetHits(mock), 31);
  });

  it("creates the draft even when the planner is off, the budget is used up or the queue is full", async () => {
    const mock = await signedIn(ANNA);
    const p = mock.api.planner;
    const errorOf = (planId: string) => mock.store.participants.by("lessonId", planId).map((participant) => participant.planError);

    mock.store.patchSettings({ homeworkPlanEnabled: false });
    const off = await p.createHomeworkPlan(draftInput({ groupId: "grp_8a", studentIds: ["usr_artem", "usr_kirill"] }));
    assert.equal(off.plan, "unavailable");
    assert.deepEqual(errorOf(off.planId), ["plan-error:unavailable", "plan-error:unavailable"]);
    assert.equal((await p.getHomeworkPlanBoard(off.planId)).aiAvailable, false);
    // The lesson switch is a different one.
    assert.equal((await p.createLesson({ studentIds: ["usr_timur"] })).plan, "queued");
    mock.store.patchSettings({ homeworkPlanEnabled: true, lessonPlanEnabled: false });
    assert.equal((await p.createHomeworkPlan(draftInput())).plan, "queued");
    assert.equal(budgetHits(mock), 2);

    // One budget for lessons and drafts.
    mock.api.controls.exhaust("api:ai-plans:global", "global");
    const budget = await p.createHomeworkPlan(draftInput());
    assert.equal(budget.plan, "budgetExhausted");
    assert.deepEqual(errorOf(budget.planId), ["plan-error:budgetExhausted"]);
    assert.equal(budgetHits(mock), 300);
    mock.api.controls.clearLimiters();

    mock.api.controls.set("planQueueFull", true);
    const queue = await p.createHomeworkPlan(draftInput());
    assert.equal(queue.plan, "queueFull");
    assert.deepEqual(errorOf(queue.planId), ["plan-error:queueFull"]);
    assert.equal(planJobs(mock, mock.store.participants.by("lessonId", queue.planId)[0]!.id).length, 0);
  });

  it("is limited to 10 creates per minute; issue and delete share the bucket with a limit of 30", async () => {
    const mock = await signedIn(ANNA);
    const p = mock.api.planner;
    for (let index = 0; index < 10; index += 1) await p.createHomeworkPlan(draftInput());
    const refused = await rejects(p.createHomeworkPlan(draftInput()), "rateLimited", 429);
    assert.deepEqual([refused.message, refused.retryAfterSeconds], [ru.apiCommon.rateLimited, 60]);
    // The same bucket, the higher limit: issue and delete still pass.
    assert.equal((await p.issueHomeworkPlan("hp_full")).issued.length, 0);
    await p.deleteHomeworkPlan("hp_queue");

    mock.api.controls.exhaust("api:homework-plan#issue-delete", "usr_anna");
    await rejects(p.issueHomeworkPlan("hp_ready"), "rateLimited", 429);
    await rejects(p.deleteHomeworkPlan("hp_ready"), "rateLimited", 429);
    assert.ok(mock.store.lessons.has("hp_ready"));
    mock.clock.advance(MINUTE_MS);
    assert.equal((await p.createHomeworkPlan(draftInput())).plan, "queued");
  });
});

describe("planner.getHomeworkPlanBoard", () => {
  it("returns the draft with its topic, deadline, sets and the numbers of the topic", async () => {
    const mock = await signedIn(ANNA);
    const board = await mock.api.planner.getHomeworkPlanBoard("hp_ready");
    assert.deepEqual(Object.keys(board).sort(), [
      "aiAvailable", "daysUntilDeadline", "deadlineAt", "group", "id", "participants", "serverNow", "sourceLesson", "title", "topicId", "topicNumbers", "topicTitle",
    ]);
    assert.deepEqual(
      [board.serverNow, board.id, board.title, board.topicId, board.topicTitle, board.deadlineAt, board.daysUntilDeadline, board.group, board.sourceLesson, board.aiAvailable],
      [TEST_T0, "hp_ready", "Логарифмы к пятнице", "top_log", "Логарифмические уравнения", iso(4 * DAY_MS + 8 * HOUR_MS), 5, null, null, true],
    );
    assert.equal(board.topicNumbers.length, 12);
    assert.deepEqual(board.topicNumbers[0], { id: num("010203"), number: "010203" });

    assert.deepEqual(board.participants.map((participant) => participant.studentName), ["Илья Смирнов", "Мария Волкова"]);
    const ilya = board.participants[0]!;
    assert.deepEqual(Object.keys(ilya).sort(), ["createdAt", "id", "issuedAssignmentId", "issuedAt", "items", "planError", "planGeneratedAt", "planSummary", "studentId", "studentName"]);
    assert.deepEqual([ilya.id, ilya.issuedAssignmentId, ilya.issuedAt, ilya.planError], [pid("hp_ready", "ilya"), null, null, null]);
    assert.deepEqual(Object.keys(ilya.items[0]!).sort(), ["comment", "conditionLatex", "homeworkNumberId", "id", "minutes", "number", "reason", "studentStatus"]);
    assert.deepEqual(ilya.items.map((item) => [item.number, item.studentStatus]), [["010211", "RED"], ["010212", null], ["010213", null], ["010214", null]]);
    assert.equal(ilya.items[0]!.conditionLatex, mock.store.numbers.get(num("010211"))!.conditionLatex);
    assert.equal(JSON.stringify(board).includes("answerLatex"), false);

    // The extra part does not exist for homework: such items are filtered out of the board.
    await mock.api.planner.saveLessonItems("hp_ready", ilya.id, ["010211", "010212"].map(num), [num("010203")]);
    assert.deepEqual((await mock.api.planner.getHomeworkPlanBoard("hp_ready")).participants[0]!.items.map((item) => item.number), ["010211", "010212"]);
    assert.equal((await mock.api.planner.getHomeworkPlanStatus("hp_ready")).participants[0]!.itemsCount, 3);
  });

  it("shows the issue stamp only while the homework exists, and the source lesson", async () => {
    const mock = await signedIn(ANNA);
    const p = mock.api.planner;
    // Coverage "draft.issued.staleStamp.deadlinePassed".
    const issued = await p.getHomeworkPlanBoard("hp_issued");
    assert.deepEqual(issued.sourceLesson, { id: "les_g4", title: "Занятие группы · Квадратные функции" });
    assert.deepEqual(issued.group, { id: "grp_8a", name: "8А — алгебра" });
    const [artem, polina] = issued.participants;
    assert.deepEqual([artem!.issuedAssignmentId, artem!.issuedAt], ["hw_artem_issued", mock.store.participants.get(pid("hp_issued", "artem"))!.issuedAt]);
    // The homework was cancelled: the card looks "not issued", the stored stamp is still there.
    assert.deepEqual([polina!.issuedAssignmentId, polina!.issuedAt, polina!.items.length], [null, null, 2]);
    assert.equal(mock.store.participants.get(pid("hp_issued", "polina"))?.issuedAssignmentId, "hw_polina_cancelled");

    // Coverage "draft.issue.fullyIssued".
    const full = await p.getHomeworkPlanBoard("hp_full");
    assert.deepEqual(full.participants.map((participant) => participant.issuedAssignmentId), ["hw_maria_done3"]);
    assert.deepEqual([full.daysUntilDeadline, full.group], [3, null]);

    // A past deadline is shown clamped to one day.
    const past = await p.getHomeworkPlanBoard("hp_past");
    assert.deepEqual([past.daysUntilDeadline, past.participants[0]!.planError], [1, "plan-error:homeworkParams"]);

    // The source lesson disappears with the lesson.
    await p.deleteLesson("les_g4");
    assert.equal((await p.getHomeworkPlanBoard("hp_issued")).sourceLesson, null);
  });

  it("shows every stored plan error raw; the dictionary renders each code", async () => {
    const mock = await signedIn(ANNA);
    const p = mock.api.planner;
    const stored = new Set<string>();
    for (const id of ["hp_errors", "hp_queue", "hp_past"]) for (const participant of (await p.getHomeworkPlanBoard(id)).participants) stored.add(participant.planError ?? "");
    for (const id of ["les_unscheduled", "les_ai_off", "les_budget"]) for (const participant of (await p.getLessonBoard(id)).participants) stored.add(participant.planError ?? "");
    // Coverage "plan.error.everyCodeStored": all nine codes reach the client (emptyPlan also as the legacy sentence).
    for (const code of PLAN_ERROR_CODES) {
      assert.ok(stored.has(`plan-error:${code}`), code);
      assert.equal(planErrorText(`plan-error:${code}`, ru.planner.planErrors), ru.planner.planErrors[code]);
    }
    assert.deepEqual(
      (await p.getHomeworkPlanBoard("hp_errors")).participants.map((participant) => [participant.studentName, participant.planError, participant.items.length]),
      [
        ["Артём Кузнецов", "plan-error:emptyPlan", 0],
        ["Кирилл Зайцев", "plan-error:homeworkNoCandidates", 0],
        ["Полина Морозова", "plan-error:studentMissing", 0],
      ],
    );
  });

  it("resolves the seeded generation one participant after another, counted from the first read", async () => {
    const mock = await signedIn(ANNA);
    const p = mock.api.planner;
    mock.clock.advance(HOUR_MS);
    const states = async () => (await p.getHomeworkPlanBoard("hp_generating")).participants.map((participant) => (participant.planGeneratedAt ? "ready" : participant.planError ? "failed" : "pending"));
    assert.deepEqual(await states(), ["pending", "pending", "pending"]);
    mock.clock.advance(4999);
    assert.deepEqual(await states(), ["pending", "pending", "pending"]);
    mock.clock.advance(1);
    assert.deepEqual(await states(), ["ready", "pending", "pending"]);
    mock.clock.advance(1000);
    assert.deepEqual(await states(), ["ready", "failed", "pending"]);
    const status = await p.getHomeworkPlanStatus("hp_generating");
    assert.deepEqual([status.total, status.ready, status.failed, status.issued, status.pending], [3, 1, 1, 0, 1]);
    mock.clock.advance(1000);
    assert.deepEqual(await states(), ["ready", "failed", "ready"]);

    const board = await p.getHomeworkPlanBoard("hp_generating");
    assert.deepEqual(board.participants.map((participant) => [participant.studentName, participant.planError, participant.items.map((item) => item.number).join()]), [
      ["Артём Кузнецов", null, "401,402,403,404,405"],
      ["Кирилл Зайцев", "plan-error:homeworkNoCandidates", ""],
      ["Полина Морозова", null, "401,402,403,404"],
    ]);
    assert.equal(board.participants[0]!.planSummary, "Системы по нарастающей: подстановка, затем сложение.");
    assert.equal(planJobs(mock).some((job) => job.refId.startsWith("lp_hp_generating_")), false);
  });

  it("leaves a stale draft pending until somebody retries", async () => {
    const mock = await signedIn(ANNA);
    const p = mock.api.planner;
    mock.clock.advance(HOUR_MS);
    const stale = (await p.getHomeworkPlanBoard("hp_stale")).participants[0]!;
    assert.deepEqual([stale.planGeneratedAt, stale.planError, stale.createdAt], [null, null, iso(-20 * MINUTE_MS)]);
    assert.equal((await p.getHomeworkPlanStatus("hp_stale")).pending, 1);

    assert.deepEqual(await p.regenerateParticipant("hp_stale", stale.id), { planRequestedAt: iso(HOUR_MS) });
    mock.clock.advance(5000);
    const ready = (await p.getHomeworkPlanBoard("hp_stale")).participants[0]!;
    assert.ok(ready.planGeneratedAt !== null && ready.items.length > 0);
    assert.ok(ready.items.every((item) => mock.store.numbers.get(item.homeworkNumberId)?.topicId === "top_word"));
  });

  it("answers 404 for a lesson id, a foreign or missing draft and a draft whose topic is gone; hides a transferred student", async () => {
    const mock = await signedIn(ANNA);
    const p = mock.api.planner;
    assert.equal((await rejects(p.getHomeworkPlanBoard("les_live"), "draftNotFound", 404)).message, ru.apiCommon.draftNotFound);
    await rejects(p.getHomeworkPlanBoard("nope"), "draftNotFound", 404);
    await rejects(p.getHomeworkPlanStatus("les_live"), "draftNotFound", 404);
    await rejects(p.getHomeworkPlanStatus("nope"), "draftNotFound", 404);

    mock.store.users.update("usr_maria", { teacherId: "usr_igor" });
    assert.deepEqual((await p.getHomeworkPlanBoard("hp_ready")).participants.map((participant) => participant.studentId), ["usr_ilya"]);
    assert.equal((await p.getHomeworkPlanStatus("hp_ready")).total, 2);

    mock.store.lessons.update("hp_ready", { topicId: null });
    await rejects(p.getHomeworkPlanBoard("hp_ready"), "draftNotFound", 404);

    const igor = await signedIn(IGOR);
    await rejects(igor.api.planner.getHomeworkPlanBoard("hp_ready"), "draftNotFound", 404);
    await rejects(igor.api.planner.getHomeworkPlanStatus("hp_ready"), "draftNotFound", 404);
    const dev = await signedIn(DEV);
    assert.equal((await dev.api.planner.getHomeworkPlanBoard("hp_ready")).participants.length, 2);
  });
});

describe("planner.getHomeworkPlanStatus", () => {
  it("counts by the stored values, the issue stamp included", async () => {
    const mock = await signedIn(ANNA);
    const p = mock.api.planner;
    const issued = await p.getHomeworkPlanStatus("hp_issued");
    assert.deepEqual([issued.total, issued.ready, issued.failed, issued.issued, issued.pending], [2, 2, 0, 2, 0]);
    assert.deepEqual(issued.participants[1], {
      participantId: pid("hp_issued", "polina"),
      studentId: "usr_polina",
      name: "Полина Морозова",
      planGeneratedAt: mock.store.participants.get(pid("hp_issued", "polina"))!.planGeneratedAt,
      planError: null,
      // Raw: the cancelled homework still counts here (only the board hides it).
      issuedAssignmentId: "hw_polina_cancelled",
      issuedAt: mock.store.participants.get(pid("hp_issued", "polina"))!.issuedAt,
      itemsCount: 2,
    });

    const errors = await p.getHomeworkPlanStatus("hp_errors");
    assert.deepEqual([errors.total, errors.ready, errors.failed, errors.issued, errors.pending], [3, 0, 3, 0, 0]);
    const conflict = await p.getHomeworkPlanStatus("hp_conflict");
    assert.deepEqual([conflict.ready, conflict.participants.map((participant) => participant.itemsCount)], [3, [4, 3, 0]]);
  });
});

describe("planner.issueHomeworkPlan", () => {
  it("issues to everyone who can receive it and reports the rest (draft.issue.mixed … draft.issue.fix)", async () => {
    const mock = await signedIn(ANNA);
    const p = mock.api.planner;
    const plan = mock.store.lessons.get("hp_conflict")!;
    const events = captureEvents(mock);
    const homeworks = mock.store.homeworks.size;

    // draft.issue.mixed
    const mixed = await p.issueHomeworkPlan("hp_conflict");
    assert.equal(mixed.issued.length, 1);
    const kirill = mixed.issued[0]!;
    assert.deepEqual([kirill.participantId, kirill.studentId, kirill.name], [pid("hp_conflict", "kirill"), "usr_kirill", "Кирилл Зайцев"]);
    assert.deepEqual(mixed.failed, [
      {
        participantId: pid("hp_conflict", "artem"),
        studentId: "usr_artem",
        name: "Артём Кузнецов",
        code: "solvedConflict",
        message: format(ru.apiPlanner.homeworkIssue.solvedConflictMany, { numbers: "127, 130" }),
        conflictNumbers: ["127", "130"],
      },
      { participantId: pid("hp_conflict", "polina"), studentId: "usr_polina", name: "Полина Морозова", code: "emptySet", message: "Набор пуст — добавьте номера." },
    ]);

    // Кирилл got a normal homework: the draft's title and deadline, the numbers of his set.
    const assignment = mock.store.homeworks.get(kirill.assignmentId)!;
    assert.deepEqual([assignment.studentId, assignment.topicId, assignment.title, assignment.deadlineAt], ["usr_kirill", "top_linear", plan.title, plan.deadlineAt]);
    assert.deepEqual(mock.ctx.q.homeworkNumbers(assignment.id).map((number) => number.number), ["112", "113", "118"]);
    assert.equal(mock.store.homeworks.size, homeworks + 1);
    // Status rows exist for every number and carry the mirrored deadline; colours are untouched.
    assert.deepEqual(
      ["112", "113", "118"].map((label) => [statusOf(mock, "usr_kirill", label)?.status, statusOf(mock, "usr_kirill", label)?.deadlineAt]),
      [["RED", plan.deadlineAt], [null, plan.deadlineAt], [null, plan.deadlineAt]],
    );
    const stamp = mock.store.participants.get(pid("hp_conflict", "kirill"))!;
    assert.deepEqual([stamp.issuedAssignmentId, stamp.issuedAt], [assignment.id, TEST_T0]);
    const notification = mock.store.notifications.by("userId", "usr_kirill").at(-1)!;
    assert.deepEqual([notification.type, notification.href, notification.readAt], ["homework-assigned", "/student/homeworks", null]);
    assert.deepEqual(events, [{ kind: "student-deadlines-changed", studentId: "usr_kirill", topicId: "top_linear" }]);
    // Nothing was created for the refused participants.
    assert.equal(mock.store.participants.get(pid("hp_conflict", "artem"))?.issuedAssignmentId, null);
    assert.equal(mock.store.notifications.by("userId", "usr_artem").some((row) => row.createdAt === TEST_T0), false);

    const status = await p.getHomeworkPlanStatus("hp_conflict");
    assert.deepEqual([status.issued, status.total], [1, 3]);
    assert.equal((await p.listHomeworkPlans()).find((entry) => entry.id === "hp_conflict")?.issuedCount, 1);

    // draft.issue.repeat: Кирилл is skipped silently, only the failures come back, nothing is created.
    const repeat = await p.issueHomeworkPlan("hp_conflict", []);
    assert.deepEqual([repeat.issued, repeat.failed.map((entry) => entry.code)], [[], ["solvedConflict", "emptySet"]]);
    assert.equal(mock.store.homeworks.size, homeworks + 1);

    // draft.issue.single
    const single = await p.issueHomeworkPlan("hp_conflict", [pid("hp_conflict", "artem")]);
    assert.deepEqual([single.issued, single.failed.map((entry) => [entry.name, entry.code])], [[], [["Артём Кузнецов", "solvedConflict"]]]);

    // The issued participant is frozen.
    await rejects(p.saveLessonItems("hp_conflict", pid("hp_conflict", "kirill"), []), "homeworkAlreadyIssued", 409);
    await rejects(p.regenerateParticipant("hp_conflict", pid("hp_conflict", "kirill")), "homeworkAlreadyIssued", 409);
    const board = await p.getHomeworkPlanBoard("hp_conflict");
    assert.deepEqual(board.participants.map((participant) => participant.issuedAssignmentId), [null, assignment.id, null]);

    // draft.issue.fix: remove the solved numbers from Артём's set, then issue.
    await p.saveLessonItems("hp_conflict", pid("hp_conflict", "artem"), ["120", "124"].map(num));
    const fixed = await p.issueHomeworkPlan("hp_conflict", [pid("hp_conflict", "artem")]);
    assert.deepEqual([fixed.issued.map((entry) => entry.name), fixed.failed], [["Артём Кузнецов"], []]);
    assert.deepEqual(mock.ctx.q.homeworkNumbers(fixed.issued[0]!.assignmentId).map((number) => number.number), ["120", "124"]);
    assert.equal((await p.getHomeworkPlanStatus("hp_conflict")).issued, 2);
  });

  it("issues after the conflicting statuses were cleared (draft.issue.fixByStatus)", async () => {
    const mock = await signedIn(ANNA);
    const anna = mock.store.users.get("usr_anna")!;
    for (const label of ["127", "130"]) mock.ctx.progress.write({ source: "teacher", status: null, studentId: "usr_artem", homeworkNumberId: num(label), actor: anna });
    const result = await mock.api.planner.issueHomeworkPlan("hp_conflict", [pid("hp_conflict", "artem")]);
    assert.deepEqual(result.failed, []);
    assert.deepEqual(mock.ctx.q.homeworkNumbers(result.issued[0]!.assignmentId).map((number) => number.number), ["120", "124", "127", "130"]);
  });

  it("reports one solved number with the singular text, in the caller's language", async () => {
    const mock = await signedIn(ANNA, { locale: "en" });
    await mock.api.planner.saveLessonItems("hp_conflict", pid("hp_conflict", "artem"), ["120", "127"].map(num));
    const { failed } = await mock.api.planner.issueHomeworkPlan("hp_conflict", [pid("hp_conflict", "artem"), pid("hp_conflict", "polina")]);
    assert.deepEqual(failed.map((entry) => [entry.code, entry.message, entry.conflictNumbers]), [
      ["solvedConflict", format(en.apiPlanner.homeworkIssue.solvedConflictOne, { numbers: "127" }), ["127"]],
      ["emptySet", en.apiPlanner.homeworkPlanIssue.emptySet, undefined],
    ]);
  });

  it("issues a whole draft and is idempotent; a stale stamp is skipped silently", async () => {
    const mock = await signedIn(ANNA);
    const p = mock.api.planner;
    const first = await p.issueHomeworkPlan("hp_ready");
    assert.deepEqual([first.issued.map((entry) => entry.name), first.failed], [["Илья Смирнов", "Мария Волкова"], []]);
    // The title the teacher typed goes onto the homework.
    assert.ok(first.issued.every((entry) => mock.store.homeworks.get(entry.assignmentId)?.title === "Логарифмы к пятнице"));
    // A RED number can be assigned again.
    assert.deepEqual(mock.ctx.q.homeworkNumbers(first.issued[0]!.assignmentId).map((number) => number.number), ["010211", "010212", "010213", "010214"]);
    const homeworks = mock.store.homeworks.size;
    assert.deepEqual(await p.issueHomeworkPlan("hp_ready"), { issued: [], failed: [] });
    assert.equal(mock.store.homeworks.size, homeworks);

    // Fully issued draft.
    assert.deepEqual(await p.issueHomeworkPlan("hp_full"), { issued: [], failed: [] });
    // Полина's homework was cancelled, the stamp stayed: she looks "not issued" but nothing is created.
    assert.deepEqual(await p.issueHomeworkPlan("hp_issued", [pid("hp_issued", "polina")]), { issued: [], failed: [] });
    assert.deepEqual(await p.issueHomeworkPlan("hp_issued"), { issued: [], failed: [] });
    assert.equal(mock.store.homeworks.size, homeworks);
    // Ids that are not participants of the draft select nobody.
    assert.deepEqual(await p.issueHomeworkPlan("hp_conflict", ["lp_nope", pid("hp_ready", "ilya")]), { issued: [], failed: [] });
  });

  it("fails per participant for an empty set, a foreign student and a number outside the topic", async () => {
    const mock = await signedIn(ANNA);
    const p = mock.api.planner;
    const empty = await p.issueHomeworkPlan("hp_errors");
    assert.deepEqual([empty.issued, empty.failed.map((entry) => [entry.name, entry.code])], [[], [["Артём Кузнецов", "emptySet"], ["Кирилл Зайцев", "emptySet"], ["Полина Морозова", "emptySet"]]]);

    // The manual-add control only offers the topic's numbers, but the handler takes any id: the conflict surfaces here.
    await p.saveLessonItems("hp_ready", pid("hp_ready", "ilya"), [num("010212"), num("112")]);
    mock.store.users.update("usr_maria", { teacherId: "usr_igor" });
    const { issued, failed } = await p.issueHomeworkPlan("hp_ready");
    assert.deepEqual(issued, []);
    assert.deepEqual(failed.map((entry) => [entry.name, entry.code, entry.message]), [
      ["Илья Смирнов", "studentOrNumberNotFound", ru.apiCommon.studentOrNumberNotFound],
      ["Мария Волкова", "studentOrNumberNotFound", ru.apiCommon.studentOrNumberNotFound],
    ]);
    assert.ok(mock.store.participants.by("lessonId", "hp_ready").every((participant) => participant.issuedAssignmentId === null));
  });

  it("does not generate for a participant that was issued while the generation was waiting", async () => {
    const mock = await signedIn(ANNA);
    const p = mock.api.planner;
    const { planId } = await p.createHomeworkPlan(draftInput());
    const participant = mock.store.participants.by("lessonId", planId)[0]!;
    await p.saveLessonItems(planId, participant.id, [num("112")]);
    assert.equal((await p.issueHomeworkPlan(planId)).issued.length, 1);
    mock.clock.advance(5000);
    const status = await p.getHomeworkPlanStatus(planId);
    assert.deepEqual([status.issued, status.participants[0]!.planGeneratedAt, status.participants[0]!.planError, status.participants[0]!.itemsCount], [1, null, null, 1]);
    assert.deepEqual(labelsOf(mock, participant.id), ["112"]);
  });

  it("refuses a draft without topic or deadline and one whose deadline has passed", async () => {
    const mock = await signedIn(ANNA);
    const p = mock.api.planner;
    const passed = await rejects(p.issueHomeworkPlan("hp_past"), "deadlinePassed", 400);
    assert.equal(passed.message, ru.apiPlanner.homeworkPlanIssue.deadlinePassed);

    // The boundary: one millisecond before the deadline the issue works, at the deadline it does not.
    const deadline = Date.parse(mock.store.lessons.get("hp_ready")!.deadlineAt!);
    mock.clock.set(deadline - 1);
    assert.equal((await p.issueHomeworkPlan("hp_ready", [pid("hp_ready", "ilya")])).issued.length, 1);
    mock.clock.set(deadline);
    await rejects(p.issueHomeworkPlan("hp_ready"), "deadlinePassed", 400);
    assert.equal(mock.store.participants.get(pid("hp_ready", "maria"))?.issuedAssignmentId, null);

    mock.store.lessons.update("hp_conflict", { deadlineAt: null });
    const missing = await rejects(p.issueHomeworkPlan("hp_conflict"), "missingTopicOrDeadline", 400);
    assert.equal(missing.message, ru.apiPlanner.homeworkPlanIssue.missingTopicOrDeadline);
    mock.store.lessons.update("hp_errors", { topicId: null });
    await rejects(p.issueHomeworkPlan("hp_errors"), "missingTopicOrDeadline", 400);

    await rejects(p.issueHomeworkPlan("les_live"), "draftNotFound", 404);
    await rejects(p.issueHomeworkPlan("nope"), "draftNotFound", 404);
    const igor = await signedIn(IGOR);
    assert.equal((await rejects(igor.api.planner.issueHomeworkPlan("hp_ready"), "draftNotFound", 404)).message, ru.apiCommon.draftNotFound);
    const dev = await signedIn(DEV);
    assert.equal((await dev.api.planner.issueHomeworkPlan("hp_ready")).issued.length, 2);
  });
});

describe("planner.deleteHomeworkPlan", () => {
  it("removes the draft with its sets; homework already issued stays with the students", async () => {
    const mock = await signedIn(ANNA);
    const p = mock.api.planner;
    const events = captureEvents(mock);
    assert.equal(await p.deleteHomeworkPlan("hp_issued"), undefined);
    assert.equal(mock.store.lessons.has("hp_issued"), false);
    assert.equal(mock.store.participants.by("lessonId", "hp_issued").length, 0);
    assert.equal(mock.store.lessonItems.filter((item) => item.id.startsWith("li_hp_issued_")).length, 0);
    assert.ok(mock.store.homeworks.has("hw_artem_issued"));
    assert.equal(mock.ctx.q.homeworkNumbers("hw_artem_issued").length, 2);
    assert.deepEqual(events, []);
    assert.equal((await p.listHomeworkPlans()).some((plan) => plan.id === "hp_issued"), false);
    await rejects(p.getHomeworkPlanBoard("hp_issued"), "draftNotFound", 404);
    await rejects(p.deleteHomeworkPlan("hp_issued"), "draftNotFound", 404);

    // Pending generations go with the draft.
    await p.deleteHomeworkPlan("hp_generating");
    assert.equal(planJobs(mock).some((job) => job.refId.startsWith("lp_hp_generating_")), false);
    assert.equal(mock.store.planScripts.all().some((script) => script.id.startsWith("lp_hp_generating_")), false);
    mock.clock.advance(MINUTE_MS);
    await p.listHomeworkPlans();
    assert.equal(mock.ctx.jobs.lastError(), null);
  });

  it("answers 404 for a lesson id, a foreign draft and a missing one", async () => {
    const mock = await signedIn(ANNA);
    const p = mock.api.planner;
    assert.equal((await rejects(p.deleteHomeworkPlan("les_manual"), "draftNotFound", 404)).message, ru.apiCommon.draftNotFound);
    await rejects(p.deleteHomeworkPlan("nope"), "draftNotFound", 404);
    assert.ok(mock.store.lessons.has("les_manual"));
    const igor = await signedIn(IGOR);
    await rejects(igor.api.planner.deleteHomeworkPlan("hp_ready"), "draftNotFound", 404);
    assert.ok(igor.store.lessons.has("hp_ready"));
    const dev = await signedIn(DEV);
    await dev.api.planner.deleteHomeworkPlan("hp_ready");
    assert.equal(dev.store.lessons.has("hp_ready"), false);
  });
});
