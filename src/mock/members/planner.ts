/**
 * `TeacherPlannerApi` on the mock store — 05 — lessons, live board, homework drafts
 * (docs/spec/05-teacher-lessons-plans.md; 00 §2.10; 90-addendum-1 A.9; 90-addendum-2 A.2.2 – A.2.7;
 * 90-addendum-3 §9 item 4; 90-addendum-6 §5, §6.2, §6.4, §9).
 *
 * Order inside every method, like the site's route handlers: session and role → rate limit → ownership
 * (a missing or foreign lesson / draft / participant / item is a 404) → input validation → effect.
 * Three handlers of the site read the body BEFORE they look the row up, and so do these methods (the
 * errors of 05 §3.3, §3.8, §3.13 are listed in handler order): `scheduleLesson` (400 `invalidStartsAt`
 * before the 404), `setItemResult` (400 `invalidResult` before the 404) and `createHomeworkPlan`
 * (400 `topicAndDeadlineRequired` → 404 `topicNotFound` → 404 `groupNotFound` → the student checks).
 *
 * AI plan generation is deferred work: `createLesson`, `createHomeworkPlan` and `regenerateParticipant`
 * schedule one `planGeneration` job per participant (5 / 6 / 7 s by the participant's index in name order);
 * the handler registered below turns a pending participant into a ready or a failed one.
 */
import type { TeacherPlannerApi } from "@/api/client";
import type { ApiError } from "@/api/errors";
import type {
  CreatePlanOutcome,
  HomeworkPlanItem,
  HomeworkPlanParticipant,
  IssueResult,
  Lesson,
  LessonBoardItem,
  LessonBoardParticipant,
  LessonFormMember,
  LessonItemResult,
  LessonKind,
  LessonListItem,
  LessonParticipant,
  Locale,
  PlanErrorCode,
  StudentGroup,
  TopicOption,
} from "@/api/types";
import { AI_QUEUES, LESSON_ITEM_RESULTS, LIMITS } from "@/api/types";
import { estimateModelCostRub } from "@/domain/ai-pricing";
import { formatDate } from "@/domain/dates";
import { daysUntil, normalizeHomeworkParams, pickDominantTopicId } from "@/domain/homework-plan";
import {
  collectAvailableNumbers,
  isGapCandidate,
  LESSON_TOPIC_HEAD,
  normalizePlanParams,
  normalizeSpeed,
  planLessonItemsUpdate,
  trimToTopicHeads,
  type AvailableNumber,
  type LessonPlanContextTopics,
} from "@/domain/lesson-plan";
import { deriveLessonStatus } from "@/domain/lesson-status";
import { planErrorValue } from "@/domain/plan-error";
import { format } from "@/lib/i18n/format";

import type { MockContext } from "../context";
import type { ForcedError } from "../controls";
import type { MockJob, MockPlanScript, MockUser } from "../store/schema";

const PLAN_JOB = "planGeneration";
const PLAN_BUDGET = "api:ai-plans:global";
const HANDOUT_METHOD = "planner.getHandoutUrl";

/** Minutes the mocked model gives a number that has no estimate in the bank. */
const DEFAULT_ITEM_MINUTES = 8;
/** Size of the extra part the mocked model proposes (the cap `max(2, ceil(lessonPlanMaxItems / 2))` still applies). */
const MOCK_EXTRA_ITEMS = 2;

/**
 * Texts "written by the model" (`planSummary`, item `comment`). They are stored data in the language of the
 * teacher who started the generation, not interface copy — hence constants here, not dictionary strings.
 */
const MODEL_TEXTS: Record<Locale, { lesson: PlanTexts; homework: PlanTexts; gapComment: string }> = {
  ru: {
    lesson: {
      mixed: "Сначала возвращаемся к номерам, которые раньше не получились, затем идём по новым в порядке задачника.",
      gapsOnly: "Закрываем пробелы: только номера, которые раньше не получились.",
      newOnly: "Новые номера по порядку задачника: от коротких к более длинным.",
    },
    homework: {
      mixed: "Дома добиваем номера, которые не получились, и закрепляем новые по теме.",
      gapsOnly: "Дома возвращаемся к номерам темы, которые раньше не получились.",
      newOnly: "Новые номера темы по порядку — объём рассчитан на время до следующего занятия.",
    },
    gapComment: "Пробел: номер уже разбирали, но он не получился.",
  },
  en: {
    lesson: {
      mixed: "We first return to the problems that did not work out earlier, then move on to new ones in book order.",
      gapsOnly: "Closing gaps: only the problems that did not work out earlier.",
      newOnly: "New problems in book order: from short ones to longer ones.",
    },
    homework: {
      mixed: "At home we finish the problems that did not work out and reinforce new ones of the topic.",
      gapsOnly: "At home we return to the problems of the topic that did not work out earlier.",
      newOnly: "New problems of the topic in order — the volume fits the time until the next lesson.",
    },
    gapComment: "Gap: the problem was already covered but did not work out.",
  },
};

type PlanTexts = { mixed: string; gapsOnly: string; newOnly: string };

type PlannedItem = { homeworkNumberId: string; reason: "NEW" | "GAP"; minutes: number | null; comment: string | null };
type PlanDraft = { main: PlannedItem[]; extra: PlannedItem[]; summary: string | null };

/** What one generation ends with: a set, or a stored plan error (`modelCalled` — the "model" answered or timed out). */
/** Stage 1 of the site's generation (the cheap shortlist call): how many candidates went in and came out. */
type ShortlistStage = { pool: number; picked: number };

type GenerationOutcome =
  | { kind: "plan"; plan: PlanDraft; candidates: number; shortlist?: ShortlistStage }
  | { kind: "error"; code: PlanErrorCode; modelCalled: boolean; candidates: number };

type PlanJobPayload = { locale?: unknown; actorId?: unknown };

const byCreatedDesc = (left: { createdAt: string; id: string }, right: { createdAt: string; id: string }) =>
  right.createdAt.localeCompare(left.createdAt) || left.id.localeCompare(right.id);

const byName = (left: { name: string }, right: { name: string }) => left.name.localeCompare(right.name, "ru");

export function createPlanner(ctx: MockContext): TeacherPlannerApi {
  const { store, errors, auth, q, limits } = ctx;

  // ───────────────────────────── availability, ownership ─────────────────────────────

  // SPEC-GAP: the site's `aiAvailable` also requires a configured model (`getAiCheckConfig`); the mock has no
  // such setting — the model counts as configured, so the two switches decide alone.
  const plannerAvailable = (kind: LessonKind): boolean => {
    const settings = ctx.settings();
    return settings.aiEnabled && (kind === "HOMEWORK" ? settings.homeworkPlanEnabled : settings.lessonPlanEnabled);
  };

  /** A participant whose student moved to another teacher is invisible to the previous owner (05 §0.4). */
  const seesStudent = (viewer: MockUser, studentId: string): boolean => {
    if (viewer.role === "DEVELOPER") return true;
    return q.student(studentId)?.teacherId === viewer.id;
  };

  /** Members of a group the viewer may see — the site's `getGroupDetail` (`ownStudentsWhere`) feeds both forms. */
  const visibleGroupMembers = (viewer: MockUser, groupId: string): MockUser[] =>
    q.groupMembers(groupId).filter((student) => seesStudent(viewer, student.id));

  const ownedLessons = (viewer: MockUser, kind: LessonKind): Lesson[] =>
    viewer.role === "DEVELOPER" ? store.lessons.filter((lesson) => lesson.kind === kind).sort(byCreatedDesc) : q.lessonsOfTeacher(viewer.id, kind);

  /** The participant of an owned lesson / draft whose student is still the caller's, else `404 participantNotFound`. */
  const guardParticipant = (viewer: MockUser, lessonOrPlanId: string, participantId: string) => {
    const found = ctx.guard.participant(viewer, lessonOrPlanId, participantId);
    if (!seesStudent(viewer, found.participant.studentId)) throw errors.notFound("participantNotFound");
    return found;
  };

  const studentName = (studentId: string): string => q.user(studentId)?.name ?? "";

  const topicOptions = (): TopicOption[] => q.topicsOrdered().map((topic) => ({ id: topic.id, title: topic.title }));

  const formMember = (student: MockUser): LessonFormMember => ({ id: student.id, name: student.name, speed: q.profile(student.id)?.speed ?? null });

  // ───────────────────────────── projections ─────────────────────────────

  /** The set of a participant as the lesson board shows it. Touches in-flight submissions: their timers start at the first read. */
  const boardItems = (participant: LessonParticipant): LessonBoardItem[] => {
    const statuses = q.statusMap(participant.studentId);
    const items: LessonBoardItem[] = [];
    for (const item of q.items(participant.id)) {
      const number = q.number(item.homeworkNumberId);
      if (!number) continue;
      const latest = q.latestSubmission(item.id);
      if (latest && (latest.status === "PENDING" || latest.status === "CHECKING")) ctx.jobs.touch(latest.id);
      items.push({
        id: item.id,
        homeworkNumberId: number.id,
        number: number.number,
        conditionLatex: number.conditionLatex,
        reason: item.reason,
        minutes: item.minutes,
        comment: item.comment,
        isExtra: item.isExtra,
        result: item.result,
        topicTitle: q.topic(number.topicId)?.title ?? "",
        studentStatus: statuses.get(number.id) ?? null,
        submission: latest
          ? {
              status: latest.status,
              verdict: latest.verdict,
              submittedAt: latest.submittedAt,
              checkedAt: latest.checkedAt,
              // Teacher-only marks; `errorKind` / `errorNote` stay on the server.
              injectionSuspected: latest.injectionSuspected,
              injectionNote: latest.injectionNote,
              photoFileIds: q.submissionPhotos(latest.id).map((photo) => photo.fileId),
            }
          : null,
      });
    }
    return items;
  };

  /** Starts the timer of a seeded pending generation the first time the participant is returned to a client. */
  const touchPending = (participant: LessonParticipant): void => {
    if (q.isPlanPending(participant)) ctx.jobs.touch(participant.id);
  };

  const boardParticipant = (participant: LessonParticipant): LessonBoardParticipant => {
    touchPending(participant);
    return {
      id: participant.id,
      studentId: participant.studentId,
      studentName: studentName(participant.studentId),
      speed: participant.speed,
      planSummary: participant.planSummary,
      planGeneratedAt: participant.planGeneratedAt,
      planError: participant.planError,
      createdAt: participant.createdAt,
      joinedAt: participant.joinedAt,
      items: boardItems(participant),
    };
  };

  const toListItem = (lesson: Lesson): LessonListItem => {
    const participants = q.participants(lesson.id);
    const group = q.group(lesson.groupId);
    let resultsTotal = 0;
    let resultsMarked = 0;
    for (const participant of participants) {
      for (const item of store.lessonItems.by("participantId", participant.id)) {
        resultsTotal += 1;
        if (item.result !== null) resultsMarked += 1;
      }
    }
    return {
      id: lesson.id,
      title: lesson.title,
      status: q.lessonStatus(lesson),
      durationMinutes: lesson.durationMinutes,
      createdAt: lesson.createdAt,
      startsAt: lesson.startsAt,
      groupId: group?.id ?? null,
      groupName: group?.name ?? null,
      soloStudentName: !group && participants.length === 1 ? studentName(participants[0]!.studentId) : null,
      resultsTotal,
      resultsMarked,
      participantsCount: participants.length,
      readyCount: participants.filter((participant) => participant.planGeneratedAt !== null).length,
      failedCount: participants.filter((participant) => participant.planError !== null).length,
    };
  };

  // ───────────────────────────── create: students, budget, queue ─────────────────────────────

  /**
   * Students of a new lesson / draft (05 §3.1 steps 1–2): with a group — the requested ids that are members
   * (none requested → all members); without — the requested ids that are the caller's own students. Unknown
   * and foreign ids are dropped silently. `404 groupNotFound` for a missing / foreign group.
   *
   * SPEC-GAP: a developer may put another teacher's student into a group. The site's POST keeps every group
   * member and relies on its forms (built from the owner-filtered `getGroupDetail`) never sending a foreign
   * id; the mock drops such members for a TEACHER here as well, so neither a stale form nor a crafted call
   * can make a foreign student a participant (the board would hide that participant from the teacher).
   */
  const resolveStudents = (viewer: MockUser, groupIdRaw: unknown, studentIdsRaw: unknown): { group: StudentGroup | null; studentIds: string[] } => {
    const groupId = ctx.validate.id(groupIdRaw);
    const requested = ctx.validate.ids(studentIdsRaw);
    if (groupId) {
      const group = ctx.guard.group(viewer, groupId);
      const members = visibleGroupMembers(viewer, group.id).map((member) => member.id);
      return { group, studentIds: requested.length > 0 ? requested.filter((id) => members.includes(id)) : members };
    }
    return {
      group: null,
      studentIds: requested.filter((id) => {
        const student = q.student(id);
        return student !== undefined && (viewer.role !== "TEACHER" || student.teacherId === viewer.id);
      }),
    };
  };

  /**
   * `reservePlanGenerations` (90-addendum-3 §3): the queue first, then the school-wide daily budget, all or
   * nothing — a refused amount is given back, so a smaller request may still fit.
   */
  const reservePlanGenerations = (count: number): { code: "queueFull" | "budgetExhausted"; resetAt: number | null } | null => {
    if (count <= 0) return null;
    const queued = store.jobs.count((job) => job.kind === PLAN_JOB);
    if (ctx.switches.current().planQueueFull || queued + count > AI_QUEUES.planQueueMax) return { code: "queueFull", resetAt: null };
    const result = limits.consumeBudget(PLAN_BUDGET, count);
    if (result.allowed) return null;
    limits.releaseBudget(PLAN_BUDGET, count);
    return { code: "budgetExhausted", resetAt: result.resetAt };
  };

  /** Queues one generation per participant; the delay follows the participant's index in the lesson's name order. */
  const enqueuePlans = (lessonId: string, participantIds: readonly string[], requester: MockUser): void => {
    const nameOrder = q.participants(lessonId).map((participant) => participant.id);
    for (const participantId of participantIds) {
      // A re-queued participant gets a fresh generation: the seeded script described the first one only.
      ctx.jobs.cancel(participantId, PLAN_JOB);
      store.planScripts.delete(participantId);
      ctx.jobs.schedule(PLAN_JOB, participantId, ctx.timings.planGenerationMs(nameOrder.indexOf(participantId)), {
        locale: ctx.locale(),
        actorId: requester.id,
      });
    }
  };

  /** What happens to the participants right after a lesson / draft row was created (05 §3.1 step 10). */
  const startPlans = (lesson: Lesson, participantIds: readonly string[], requester: MockUser): Exclude<CreatePlanOutcome, "skipped"> => {
    const fail = (code: PlanErrorCode): void => {
      const now = ctx.nowIso();
      for (const participantId of participantIds) store.participants.update(participantId, { planError: planErrorValue(code), updatedAt: now });
    };
    if (!plannerAvailable(lesson.kind)) {
      fail("unavailable");
      return "unavailable";
    }
    const refused = reservePlanGenerations(participantIds.length);
    if (refused) {
      // The row exists all the same: the refusal lands on every participant, the board offers "Retry".
      fail(refused.code);
      return refused.code;
    }
    enqueuePlans(lesson.id, participantIds, requester);
    return "queued";
  };

  const insertParticipant = (lessonId: string, studentId: string, patch: Partial<LessonParticipant>): LessonParticipant => {
    const now = ctx.nowIso();
    return store.participants.insert({
      id: store.nextId("lp"),
      lessonId,
      studentId,
      attendance: "UNKNOWN",
      speed: null,
      issuedAssignmentId: null,
      issuedAt: null,
      planSummary: null,
      planGeneratedAt: null,
      planError: null,
      joinedAt: null,
      queueOrder: null,
      helpedAt: null,
      createdAt: now,
      updatedAt: now,
      ...patch,
    });
  };

  /** Deletes a lesson / draft; submission photo files go through `ctx.files` so the device layer forgets them too. */
  const removeLesson = (lessonId: string): void => {
    const fileIds = new Set<string>();
    store.transaction(() => {
      for (const participant of store.participants.by("lessonId", lessonId)) {
        for (const item of store.lessonItems.by("participantId", participant.id)) {
          for (const submission of store.submissions.by("itemId", item.id)) {
            for (const photo of store.submissionPhotos.by("submissionId", submission.id)) {
              fileIds.add(photo.fileId);
              store.submissionPhotos.delete(photo.id);
            }
          }
        }
      }
      ctx.cascade.deleteLesson(lessonId);
    });
    for (const fileId of fileIds) ctx.files.removeIfUnreferenced(fileId);
  };

  // ───────────────────────────── the mocked plan generator (05 §4.3) ─────────────────────────────

  /** Candidate facts of one student — the site's `getLessonPlanContext`, without ranking. */
  const planContext = (studentId: string): LessonPlanContextTopics => {
    const now = ctx.now();
    const excluded = new Set<string>();
    const attempted = new Set<string>();
    // Every set of the student counts — lessons and drafts, the one being regenerated included.
    for (const participant of store.participants.by("studentId", studentId)) {
      for (const item of store.lessonItems.by("participantId", participant.id)) {
        if (item.result === "NOT_SOLVED") attempted.add(item.homeworkNumberId);
        else if (item.result !== "SKIPPED") excluded.add(item.homeworkNumberId);
      }
    }
    // The same number in several sets: exclusion wins over the gap flag.
    for (const id of [...attempted]) if (excluded.has(id)) attempted.delete(id);

    const assigned = new Set<string>();
    for (const assignment of store.homeworks.by("studentId", studentId)) {
      const active = assignment.deadlineAt === null || new Date(assignment.deadlineAt).getTime() >= now;
      for (const link of store.homeworkNumbers.by("assignmentId", assignment.id)) {
        assigned.add(link.homeworkNumberId);
        if (active) excluded.add(link.homeworkNumberId);
      }
    }

    const statuses = new Map(q.statusesOfStudent(studentId).map((row) => [row.homeworkNumberId, row] as const));
    for (const row of statuses.values()) {
      if (row.status === "GREEN" || row.status === "YELLOW") excluded.add(row.homeworkNumberId);
    }

    return {
      topics: q.topicsOrdered().map((topic) => ({
        id: topic.id,
        title: topic.title,
        displayOrder: topic.displayOrder,
        numbers: q.numbersOfTopic(topic.id).map((number) => {
          const row = statuses.get(number.id);
          return {
            id: number.id,
            number: number.number,
            displayOrder: number.displayOrder,
            estimatedMinutes: number.estimatedMinutes,
            conditionLatex: number.conditionLatex,
            status: row?.status ?? null,
            note: row?.note ?? null,
            deadlineAt: row?.deadlineAt ? new Date(row.deadlineAt) : null,
            statusChangedAt: row?.statusChangedAt ? new Date(row.statusChangedAt) : null,
            assignedBefore: assigned.has(number.id),
            attemptedInLesson: attempted.has(number.id),
          };
        }),
      })),
      excludedNumberIds: [...excluded],
    };
  };

  /** Minutes of one number for a student: the bank estimate (or 8) scaled by the speed 1..10 (5 = as is). */
  const minutesFor = (estimatedMinutes: number | null, speed: number | null): number => {
    const base = estimatedMinutes ?? DEFAULT_ITEM_MINUTES;
    return Math.min(240, Math.max(1, Math.round(base * (1.5 - 0.1 * (speed ?? 5)))));
  };

  /**
   * The mocked model: gaps first, then new numbers in book order, until the time budget is filled.
   * Deterministic — the same store gives the same set.
   */
  const composePlan = (
    candidates: AvailableNumber[],
    options: { budgetMinutes: number; maxMain: number; maxExtra: number; speed: number | null; texts: PlanTexts; gapComment: string | null },
  ): PlanDraft => {
    const now = ctx.nowDate();
    const gaps = candidates.filter((candidate) => isGapCandidate(candidate, now));
    const fresh = candidates.filter((candidate) => !isGapCandidate(candidate, now));
    const ordered = [...gaps, ...fresh];
    const toItem = (candidate: AvailableNumber): PlannedItem => {
      const gap = isGapCandidate(candidate, now);
      return {
        homeworkNumberId: candidate.id,
        reason: gap ? "GAP" : "NEW",
        minutes: minutesFor(candidate.estimatedMinutes, options.speed),
        comment: gap && options.gapComment ? options.gapComment.slice(0, LIMITS.aiItemCommentMaxLength) : null,
      };
    };

    const main: PlannedItem[] = [];
    let total = 0;
    for (const candidate of ordered) {
      if (main.length >= options.maxMain) break;
      const item = toItem(candidate);
      // At least one number, then as many as fit into the budget.
      if (main.length > 0 && total + (item.minutes ?? 0) > options.budgetMinutes) break;
      main.push(item);
      total += item.minutes ?? 0;
    }
    const extra = ordered.slice(main.length, main.length + options.maxExtra).map(toItem);

    const picked = [...main, ...extra];
    const hasGaps = picked.some((item) => item.reason === "GAP");
    const hasNew = picked.some((item) => item.reason === "NEW");
    const summary = hasGaps && hasNew ? options.texts.mixed : hasGaps ? options.texts.gapsOnly : options.texts.newOnly;
    return { main, extra, summary: summary.slice(0, LIMITS.aiPlanSummaryMaxLength) };
  };

  /** A seeded scripted outcome (`store.planScripts`) as a plan: exactly the listed numbers, in order. */
  const scriptedPlan = (script: Extract<MockPlanScript["outcome"], { kind: "items" }>, studentId: string, speed: number | null, gapComment: string | null): PlanDraft => {
    const statuses = q.statusMap(studentId);
    const toItem = (homeworkNumberId: string): PlannedItem => {
      const gap = statuses.get(homeworkNumberId) === "RED";
      return {
        homeworkNumberId,
        reason: gap ? "GAP" : "NEW",
        minutes: minutesFor(q.number(homeworkNumberId)?.estimatedMinutes ?? null, speed),
        comment: gap ? gapComment : null,
      };
    };
    return { main: script.mainNumberIds.map(toItem), extra: script.extraNumberIds.map(toItem), summary: script.summary };
  };

  /**
   * The candidate stages of the site (lib/lesson-plan-generate.ts, lib/homework-plan-generate.ts): when there
   * are more numbers than `shortlistSize`, the far numbers of each topic are trimmed (`headPerTopic` per topic,
   * gaps always stay); a pool still larger than `shortlistSize` goes through the shortlist call first, which
   * keeps at most `shortlistSize` candidates for the plan call. The mocked shortlist keeps the gaps first.
   */
  const stageCandidates = (
    available: AvailableNumber[],
    shortlistSize: number,
    headPerTopic: number,
  ): { candidates: AvailableNumber[]; shortlist?: ShortlistStage } => {
    const now = ctx.nowDate();
    const pool = available.length > shortlistSize ? trimToTopicHeads(available, headPerTopic, now) : available;
    if (pool.length <= shortlistSize) return { candidates: pool };
    const ordered = [...pool.filter((candidate) => isGapCandidate(candidate, now)), ...pool.filter((candidate) => !isGapCandidate(candidate, now))];
    const candidates = ordered.slice(0, shortlistSize);
    return { candidates, shortlist: { pool: pool.length, picked: candidates.length } };
  };

  const generateLessonPlan = (lesson: Lesson, participant: LessonParticipant, locale: Locale): GenerationOutcome => {
    // `planParams` may be null or lack fields (old rows): the readers are defensive, like the site's.
    const raw = (lesson.planParams ?? {}) as { title?: unknown; durationMinutes?: unknown; topicIds?: unknown; teacherNote?: unknown };
    const params = normalizePlanParams({ ...raw, durationMinutes: raw.durationMinutes ?? lesson.durationMinutes });
    const available = collectAvailableNumbers(planContext(participant.studentId), { topicIds: params.topicIds });
    if (available.length === 0) return { kind: "error", code: "noCandidates", modelCalled: false, candidates: 0 };
    const { candidates, shortlist } = stageCandidates(available, ctx.settings().lessonPlanShortlistSize, LESSON_TOPIC_HEAD);

    const maxMain = ctx.settings().lessonPlanMaxItems;
    const plan = composePlan(candidates, {
      budgetMinutes: params.durationMinutes,
      maxMain,
      maxExtra: Math.min(MOCK_EXTRA_ITEMS, Math.max(2, Math.ceil(maxMain / 2))),
      speed: normalizeSpeed(participant.speed ?? q.profile(participant.studentId)?.speed),
      texts: MODEL_TEXTS[locale].lesson,
      gapComment: MODEL_TEXTS[locale].gapComment,
    });
    return { kind: "plan", plan, candidates: candidates.length, shortlist };
  };

  const generateHomeworkPlan = (plan: Lesson, participant: LessonParticipant, locale: Locale): GenerationOutcome => {
    const raw = (plan.planParams ?? {}) as { topicId?: unknown };
    // The deadline is always the column `Lesson.deadlineAt`; the copy inside `planParams` was made at creation.
    const params = normalizeHomeworkParams({ ...raw, topicId: raw.topicId ?? plan.topicId ?? "", deadlineAt: plan.deadlineAt ?? "" }, ctx.nowDate());
    if (!params || !q.topic(params.topicId)) return { kind: "error", code: "homeworkParams", modelCalled: false, candidates: 0 };

    const available = collectAvailableNumbers(planContext(participant.studentId), { topicIds: [params.topicId] });
    if (available.length === 0) return { kind: "error", code: "homeworkNoCandidates", modelCalled: false, candidates: 0 };
    // The site trims a homework pool with the shortlist size as the per-topic head.
    const shortlistSize = ctx.settings().homeworkPlanShortlistSize;
    const { candidates, shortlist } = stageCandidates(available, shortlistSize, shortlistSize);

    const draft = composePlan(candidates, {
      // The volume is the daily minutes times the days until the next lesson (clamped to 1..60).
      budgetMinutes: params.dailyMinutes * daysUntil(params.deadlineAt, ctx.nowDate()),
      maxMain: ctx.settings().homeworkPlanMaxItems,
      maxExtra: 0,
      speed: normalizeSpeed(participant.speed ?? q.profile(participant.studentId)?.speed),
      texts: MODEL_TEXTS[locale].homework,
      // A homework item never carries a comment.
      gapComment: null,
    });
    return { kind: "plan", plan: draft, candidates: candidates.length, shortlist };
  };

  /** Atomic write of a finished generation: items without submissions are replaced, the rest stays (skipDuplicates). */
  const writePlan = (participant: LessonParticipant, plan: PlanDraft): void => {
    const now = ctx.nowIso();
    const taken = new Set<string>();
    for (const item of store.lessonItems.by("participantId", participant.id)) {
      if (store.submissions.by("itemId", item.id).length > 0) taken.add(item.homeworkNumberId);
      else ctx.cascade.deleteLessonItem(item.id);
    }
    const rows = [
      ...plan.main.map((item, order) => ({ item, order, isExtra: false })),
      ...plan.extra.map((item, index) => ({ item, order: plan.main.length + index, isExtra: true })),
    ];
    for (const { item, order, isExtra } of rows) {
      if (taken.has(item.homeworkNumberId) || !store.numbers.has(item.homeworkNumberId)) continue;
      taken.add(item.homeworkNumberId);
      store.lessonItems.insert({
        id: store.nextId("li"),
        participantId: participant.id,
        homeworkNumberId: item.homeworkNumberId,
        order,
        reason: item.reason,
        forReview: false,
        minutes: item.minutes,
        comment: item.comment,
        isExtra,
        result: null,
        createdAt: now,
      });
    }
    store.participants.update(participant.id, { planSummary: plan.summary, planGeneratedAt: now, planError: null, updatedAt: now });
  };

  /**
   * The one-shot `nextPlanOutcome` control for this generation, or null. A code only the other generator
   * writes is translated (`noCandidates` ↔ `homeworkNoCandidates`) or — `homeworkParams` on a lesson — left
   * armed for the next draft generation.
   */
  const takeForcedOutcome = (kind: LessonKind): PlanErrorCode | null => {
    const armed = ctx.switches.current().nextPlanOutcome;
    if (!armed) return null;
    if (kind === "LESSON" && armed === "homeworkParams") return null;
    ctx.switches.takeNextPlanOutcome();
    if (kind === "LESSON" && armed === "homeworkNoCandidates") return "noCandidates";
    if (kind === "HOMEWORK" && armed === "noCandidates") return "homeworkNoCandidates";
    return armed;
  };

  /** Handler of a `planGeneration` job: PENDING → READY / FAILED of one participant (05 §4.2). */
  const runGeneration = (job: MockJob): void => {
    const participant = store.participants.get(job.refId);
    const lesson = store.lessons.get(participant?.lessonId);
    if (!participant || !lesson) return;
    const script = store.planScripts.get(participant.id);
    store.planScripts.delete(participant.id);
    // Only a pending participant is generated; a draft participant that was issued meanwhile is skipped entirely.
    if (!q.isPlanPending(participant) || (lesson.kind === "HOMEWORK" && participant.issuedAssignmentId !== null)) return;

    const payload = job.payload as PlanJobPayload;
    // The language of the request that queued the job; a seeded job falls back to the stored `outputLocale`.
    const locale: Locale = payload.locale === "en" || payload.locale === "ru" ? payload.locale : lesson.planParams?.outputLocale === "en" ? "en" : "ru";
    const requester = q.user(typeof payload.actorId === "string" ? payload.actorId : lesson.teacherId);
    const student = q.student(participant.studentId);
    const gapComment = lesson.kind === "HOMEWORK" ? null : MODEL_TEXTS[locale].gapComment;

    let outcome: GenerationOutcome;
    const forced = plannerAvailable(lesson.kind) ? takeForcedOutcome(lesson.kind) : null;
    if (!plannerAvailable(lesson.kind)) {
      outcome = { kind: "error", code: "unavailable", modelCalled: false, candidates: 0 };
    } else if (forced) {
      outcome = { kind: "error", code: forced, modelCalled: forced === "emptyPlan" || forced === "failed", candidates: 0 };
    } else if (!student) {
      outcome = { kind: "error", code: "studentMissing", modelCalled: false, candidates: 0 };
    } else if (script?.outcome.kind === "error") {
      const code = script.outcome.code;
      outcome = { kind: "error", code, modelCalled: code === "emptyPlan" || code === "failed", candidates: 0 };
    } else if (script?.outcome.kind === "items") {
      const speed = normalizeSpeed(participant.speed ?? q.profile(participant.studentId)?.speed);
      const plan = scriptedPlan(script.outcome, participant.studentId, speed, gapComment);
      outcome = { kind: "plan", plan, candidates: plan.main.length + plan.extra.length };
    } else {
      outcome = lesson.kind === "HOMEWORK" ? generateHomeworkPlan(lesson, participant, locale) : generateLessonPlan(lesson, participant, locale);
    }

    if (outcome.kind === "plan") writePlan(participant, outcome.plan);
    else store.participants.update(participant.id, { planError: planErrorValue(outcome.code), updatedAt: ctx.nowIso() });

    // The journal gets one AI row per model call: none when the generation stopped before the model.
    if (student && outcome.kind === "plan" && outcome.shortlist) {
      // Stage 1 runs on the cheap model; the site falls back to the main one when none is set.
      const action = lesson.kind === "HOMEWORK" ? ("homework_plan.shortlist" as const) : ("lesson_plan.shortlist" as const);
      const settings = ctx.settings();
      const shortlistModel = settings.aiShortlistModel.trim();
      const model = shortlistModel || settings.aiModel;
      const inputTokens = 1200 + 40 * outcome.shortlist.pool;
      const outputTokens = 20 + 4 * outcome.shortlist.picked;
      const cost = estimateModelCostRub(model, inputTokens, outputTokens);
      ctx.audit.write({
        category: "AI",
        action,
        outcome: "ok",
        actor: requester ?? null,
        targetType: "User",
        targetId: student.id,
        targetLabel: student.name,
        text: { key: action, params: { name: student.name } },
        model,
        inputTokens,
        outputTokens,
        costRub: cost === null ? null : cost.toFixed(4),
        durationMs: Math.round(job.delayMs / 3),
        error: null,
        meta: { lessonId: lesson.id, participantId: participant.id },
      });
    }
    if (student && (outcome.kind === "plan" || outcome.modelCalled)) {
      const action = lesson.kind === "HOMEWORK" ? ("homework_plan.generate" as const) : ("lesson_plan.generate" as const);
      const failed = outcome.kind === "error" && outcome.code === "failed";
      const model = ctx.settings().aiModel;
      const inputTokens = 3200 + 140 * outcome.candidates;
      const outputTokens = failed ? null : outcome.kind === "plan" ? 180 + 45 * (outcome.plan.main.length + outcome.plan.extra.length) : 40;
      const cost = estimateModelCostRub(model, inputTokens, outputTokens);
      ctx.audit.write({
        category: "AI",
        action,
        outcome: failed ? "failed" : "ok",
        actor: requester ?? null,
        targetType: "User",
        targetId: student.id,
        targetLabel: student.name,
        text: { key: action, params: { name: student.name } },
        model,
        inputTokens,
        outputTokens,
        costRub: cost === null ? null : cost.toFixed(4),
        durationMs: job.delayMs,
        error: failed ? "Request timed out" : null,
        meta: { lessonId: lesson.id, participantId: participant.id },
      });
    }
  };

  ctx.jobs.handle(PLAN_JOB, runGeneration);

  // ───────────────────────────── handout: forced errors of the synchronous builder ─────────────────────────────

  /**
   * `getHandoutUrl` is synchronous, so the client's wrapper (latency, `forceNextError`) does not see it. A
   * forced error armed for exactly this method is honoured here — it is also the only way to reach
   * `503 pdfRendererUnavailable` (a forced `serviceUnavailable` on `format: "pdf"`).
   */
  const takeForcedHandoutError = (): ForcedError | null => {
    const forced = ctx.switches.current().forceNextError;
    if (!forced || forced.times < 1 || forced.method !== HANDOUT_METHOD) return null;
    store.patchControls({ forceNextError: forced.times > 1 ? { ...forced, times: forced.times - 1 } : null });
    return forced.error;
  };

  const forcedHandoutError = (error: ForcedError, format: "pdf" | "html"): ApiError => {
    switch (error) {
      case "sessionExpired":
        return errors.sessionExpired();
      case "unauthorized":
        return errors.unauthorized();
      case "notFound":
        return errors.notFound("lessonNotFound");
      case "rateLimited":
        return errors.rateLimited(30);
      case "serviceUnavailable":
        return format === "pdf"
          ? errors.make({ status: 503, code: "pdfRendererUnavailable", message: (dict) => dict.apiPlanner.lessons.pdfRendererFallback })
          : errors.serviceUnavailable();
      case "network":
        return errors.network();
    }
  };

  // ───────────────────────────── the member ─────────────────────────────

  return {
    async listLessons() {
      const user = auth.requireStaff();
      // Lazy closing of lessons that ended within the last 48 hours — before anything is read.
      ctx.lessons.finalizeDue(user.role === "DEVELOPER" ? {} : { teacherId: user.id });
      return { lessons: ownedLessons(user, "LESSON").map(toListItem), serverNow: ctx.nowIso() };
    },

    async getLessonTargets() {
      const user = auth.requireStaff();
      const groups = user.role === "DEVELOPER" ? store.groups.all() : q.groupsOfTeacher(user.id);
      return {
        groups: groups.map((group) => ({ id: group.id, name: group.name, membersCount: q.groupMembers(group.id).length })).sort(byName),
        students: q.visibleStudents(user).map((student) => ({ id: student.id, name: student.name })),
      };
    },

    async getLessonNewForm(target) {
      const user = auth.requireStaff();
      const source = (target ?? {}) as { groupId?: unknown; studentId?: unknown };
      const groupId = ctx.validate.id(source.groupId);
      const studentId = ctx.validate.id(source.studentId);
      const topics = topicOptions();
      const aiAvailable = plannerAvailable("LESSON");

      if (groupId) {
        const group = ctx.guard.group(user, groupId);
        return { mode: "group", kicker: group.name, groupId: group.id, members: visibleGroupMembers(user, group.id).map(formMember), topics, aiAvailable, composeTopics: null };
      }
      // SPEC-GAP: the site shows the target chooser when neither parameter is given; the typed method always
      // carries one of them, so a target without a usable id is a missing resource.
      if (!studentId) throw errors.notFound("groupNotFound");

      const student = ctx.guard.student(user, studentId);
      const statuses = q.statusMap(student.id);
      // "Already used in a lesson": the number is in ANY set of this student (lessons and drafts).
      const used = new Set<string>();
      for (const participant of store.participants.by("studentId", student.id)) {
        for (const item of store.lessonItems.by("participantId", participant.id)) used.add(item.homeworkNumberId);
      }
      return {
        mode: "student",
        kicker: student.name,
        groupId: null,
        members: [formMember(student)],
        topics,
        aiAvailable,
        // Statements travel with the first topic only; the others are fetched on selection (`content.getTopicConditions`).
        composeTopics: q.topicsOrdered().map((topic, index) => {
          const numbers = q.numbersOfTopic(topic.id);
          return {
            id: topic.id,
            title: topic.title,
            totalNumbers: numbers.length,
            conditionsLoaded: index === 0,
            numbers: numbers.map((number) => ({
              id: number.id,
              number: number.number,
              status: statuses.get(number.id) ?? null,
              inLesson: used.has(number.id),
              conditionLatex: index === 0 ? number.conditionLatex : null,
            })),
          };
        }),
      };
    },

    async getNumberBank() {
      auth.requireStaff();
      // The bank is shared: every topic with every number, no ownership scope.
      return {
        topics: q.topicsOrdered().map((topic) => ({
          topicId: topic.id,
          topicTitle: topic.title,
          numbers: q.numbersOfTopic(topic.id).map((number) => ({ id: number.id, number: number.number })),
        })),
      };
    },

    async createLesson(input) {
      const user = auth.requireStaff();
      limits.enforce("api:lesson-plan");
      const body = (input ?? {}) as Partial<typeof input>;

      const { group, studentIds } = resolveStudents(user, body.groupId, body.studentIds);
      if (studentIds.length === 0) {
        return errors.fail({ status: 400, code: "selectAtLeastOneStudent", message: (dict) => dict.apiPlanner.lessons.selectAtLeastOneStudent });
      }
      if (studentIds.length > LIMITS.maxStudentsPerLesson) {
        return errors.fail({
          status: 400,
          code: "tooManyStudents",
          message: (dict) => dict.apiPlanner.lessons.tooManyStudents,
          params: { max: LIMITS.maxStudentsPerLesson },
        });
      }

      const startsAtRaw = typeof body.startsAt === "string" ? body.startsAt.trim() : "";
      const startsAt = startsAtRaw ? ctx.validate.instant(startsAtRaw) : null;
      if (startsAtRaw && !startsAt) {
        return errors.fail({ status: 400, code: "invalidStartsAt", message: (dict) => dict.apiPlanner.lessons.invalidStartsAt });
      }

      const params = normalizePlanParams({ title: body.title, durationMinutes: body.durationMinutes, topicIds: body.topicIds, teacherNote: body.teacherNote });
      // The default title is plain stored data in the creator's language.
      const title = params.title || format(ctx.dict().apiPlanner.lessons.defaultTitle, { date: formatDate(ctx.nowDate(), ctx.locale()) });
      const speeds = new Map<string, number | null>();
      if (body.speeds && typeof body.speeds === "object") {
        for (const [studentId, speed] of Object.entries(body.speeds)) speeds.set(studentId, normalizeSpeed(speed));
      }
      const skipPlan = body.skipPlan === true;
      // Manual composition: the chosen numbers go to every participant in the chosen order.
      const manualNumberIds = skipPlan ? ctx.validate.ids(body.numberIds).filter((id) => store.numbers.has(id)) : [];

      const { lesson, participantIds } = store.transaction(() => {
        const now = ctx.nowIso();
        const row = store.lessons.insert({
          id: store.nextId("les"),
          title,
          subject: group?.subject ?? "MATH",
          teacherId: user.id,
          groupId: group?.id ?? null,
          topicId: null,
          status: "PLANNED",
          kind: "LESSON",
          deadlineAt: null,
          durationMinutes: params.durationMinutes,
          // `outputLocale` is the language of the creating request — never read from the body.
          planParams: { title, durationMinutes: params.durationMinutes, topicIds: params.topicIds, teacherNote: params.teacherNote, outputLocale: ctx.locale() },
          startsAt,
          startedAt: null,
          finishedAt: null,
          createdAt: now,
          updatedAt: now,
        });
        const ids: string[] = [];
        for (const studentId of studentIds) {
          // A manual set is "ready" at once: no plan will ever arrive for it.
          const participant = insertParticipant(row.id, studentId, { speed: speeds.get(studentId) ?? null, planGeneratedAt: skipPlan ? now : null });
          ids.push(participant.id);
          manualNumberIds.forEach((homeworkNumberId, order) => {
            store.lessonItems.insert({
              id: store.nextId("li"),
              participantId: participant.id,
              homeworkNumberId,
              order,
              reason: "NEW",
              forReview: false,
              minutes: null,
              comment: null,
              isExtra: false,
              result: null,
              createdAt: now,
            });
          });
        }
        return { lesson: row, participantIds: ids };
      });

      // A lesson with a time: a student already waiting on the Lesson tab sees it without a reload.
      if (startsAt) {
        for (const studentId of studentIds) ctx.emit({ kind: "lesson-activity", lessonId: lesson.id, teacherId: user.id, studentId });
      }

      return { lessonId: lesson.id, plan: skipPlan ? "skipped" : startPlans(lesson, participantIds, user) };
    },

    async getLessonBoard(lessonId) {
      const user = auth.requireStaff();
      ctx.guard.lesson(user, lessonId, "LESSON");
      ctx.lessons.finalizeDue({ lessonId, ...(user.role === "DEVELOPER" ? {} : { teacherId: user.id }) });
      // Read again: finalisation may have changed the stored status and the results.
      const lesson = ctx.guard.lesson(user, lessonId, "LESSON");
      const group = q.group(lesson.groupId);
      const settings = ctx.settings();
      return {
        serverNow: ctx.nowIso(),
        id: lesson.id,
        title: lesson.title,
        kind: "LESSON",
        status: q.lessonStatus(lesson),
        startsAt: lesson.startsAt,
        createdAt: lesson.createdAt,
        finishedAt: lesson.finishedAt,
        durationMinutes: lesson.durationMinutes,
        group: group ? { id: group.id, name: group.name } : null,
        participants: q
          .participants(lesson.id)
          .filter((participant) => seesStudent(user, participant.studentId))
          .map(boardParticipant),
        aiAvailable: plannerAvailable("LESSON"),
        idleWarnMinutes: settings.lessonIdleWarnMinutes,
        idleAlertMinutes: settings.lessonIdleAlertMinutes,
      };
    },

    async getLessonStatus(lessonId) {
      const user = auth.requireStaff();
      // SPEC-GAP: the site route has no kind filter; on mobile a draft is `{planId}` with its own status
      // endpoint, so a draft id is a 404 here like on the board.
      const lesson = ctx.guard.lesson(user, lessonId, "LESSON");
      const participants = q.participants(lesson.id).map((participant) => {
        touchPending(participant);
        return {
          participantId: participant.id,
          studentId: participant.studentId,
          name: studentName(participant.studentId),
          planGeneratedAt: participant.planGeneratedAt,
          planError: participant.planError,
          itemsCount: store.lessonItems.by("participantId", participant.id).length,
        };
      });
      const ready = participants.filter((participant) => participant.planGeneratedAt !== null).length;
      const failed = participants.filter((participant) => participant.planGeneratedAt === null && participant.planError !== null).length;
      return { total: participants.length, ready, failed, pending: participants.length - ready - failed, participants };
    },

    async getLessonLive(lessonId) {
      const user = auth.requireStaff();
      limits.enforce("api:lesson-live");
      const lesson = ctx.guard.lesson(user, lessonId, "LESSON");
      const participants = q.participants(lesson.id);
      const time = (value: string | null) => (value ? new Date(value).getTime() : 0);
      const submissions = participants
        .flatMap((participant) => store.lessonItems.by("participantId", participant.id))
        .flatMap((item) => store.submissions.by("itemId", item.id))
        .sort((left, right) => left.submittedAt.localeCompare(right.submittedAt) || left.id.localeCompare(right.id));
      const signature = [
        time(lesson.finishedAt),
        participants.map((participant) => `${participant.id}:${time(participant.joinedAt)}`).join("|"),
        submissions.map((submission) => `${submission.itemId}:${submission.status}:${time(submission.submittedAt)}:${time(submission.checkedAt)}`).join("|"),
      ].join("#");
      return { signature };
    },

    async scheduleLesson(lessonId, startsAtInput) {
      const user = auth.requireStaff();
      limits.enforce("api:lesson-schedule");
      // The body is read before the lesson is looked up, as the site's handler does (05 §3.3).
      const startsAt = ctx.validate.instant(startsAtInput);
      if (!startsAt) return errors.fail({ status: 400, code: "invalidStartsAt", message: (dict) => dict.apiPlanner.lessons.invalidStartsAt });
      const lesson = ctx.guard.lesson(user, lessonId, "LESSON");
      if (lesson.finishedAt) {
        return errors.fail({ status: 409, code: "alreadyFinished", message: (dict) => dict.apiPlanner.lesson.alreadyFinished });
      }

      // A lesson whose results were already closed lazily comes back to life only when nothing was handed in:
      // then the automatic marks were SKIPPED / ABSENT only and the rollback is clean.
      const reopened = lesson.status === "FINISHED" && deriveLessonStatus({ ...lesson, startsAt }, ctx.now()) !== "FINISHED";
      const participants = store.participants.by("lessonId", lesson.id);
      if (reopened) {
        const hasSubmissions = participants.some((participant) =>
          store.lessonItems.by("participantId", participant.id).some((item) => store.submissions.by("itemId", item.id).length > 0),
        );
        if (hasSubmissions) {
          return errors.fail({ status: 409, code: "alreadyClosed", message: (dict) => dict.apiPlanner.lesson.alreadyClosed });
        }
      }

      const updated = store.transaction(() => {
        const now = ctx.nowIso();
        if (!reopened) return store.lessons.update(lesson.id, { startsAt, updatedAt: now });
        for (const participant of participants) {
          for (const item of store.lessonItems.by("participantId", participant.id)) {
            if (item.result === "SKIPPED") store.lessonItems.update(item.id, { result: null });
          }
          if (participant.joinedAt === null && participant.attendance === "ABSENT") {
            store.participants.update(participant.id, { attendance: "UNKNOWN", updatedAt: now });
          }
        }
        return store.lessons.update(lesson.id, { startsAt, status: "PLANNED", updatedAt: now });
      });

      ctx.emit({ kind: "lesson-activity", lessonId: lesson.id, teacherId: lesson.teacherId });
      for (const participant of participants) {
        ctx.emit({ kind: "lesson-activity", lessonId: lesson.id, teacherId: lesson.teacherId, studentId: participant.studentId });
      }
      ctx.audit.write({
        category: "DATA",
        action: "lesson.schedule",
        actor: user,
        targetType: "Lesson",
        targetId: lesson.id,
        targetLabel: lesson.title,
        text: { key: "lesson.scheduled", params: { startsAt } },
      });

      return { status: q.lessonStatus(updated), reopened };
    },

    async finishLesson(lessonId) {
      const user = auth.requireStaff();
      limits.enforce("api:lesson-finish");
      const lesson = ctx.guard.lesson(user, lessonId, "LESSON");
      if (q.lessonStatus(lesson) !== "ACTIVE") {
        return errors.fail({ status: 409, code: "lessonNotActive", message: (dict) => dict.apiPlanner.lessonFinish.notActive });
      }

      // Only `finishedAt`: the stored status FINISHED is the "results are closed" mark set by the finalisation.
      const now = ctx.nowIso();
      store.lessons.update(lesson.id, { finishedAt: now, updatedAt: now });
      const finalized = ctx.lessons.finalize(lesson.id);

      ctx.emit({ kind: "lesson-activity", lessonId: lesson.id, teacherId: lesson.teacherId });
      ctx.audit.write({
        category: "DATA",
        action: "lesson.finish",
        actor: user,
        targetType: "Lesson",
        targetId: lesson.id,
        targetLabel: lesson.title,
        text: { key: "lesson.finished_early" },
      });

      return { finalized: { notSolved: finalized.notSolved, skipped: finalized.skipped } };
    },

    async deleteLesson(lessonId) {
      const user = auth.requireStaff();
      limits.enforce("api:lesson-delete");
      // SPEC-GAP: the site route also deletes a draft passed as a lesson id; the mobile contract answers 404
      // for the wrong kind (05 §7 item 13).
      const lesson = ctx.guard.lesson(user, lessonId, "LESSON");
      // Results already mirrored onto the number statuses stay; no realtime event is published.
      removeLesson(lesson.id);
    },

    async saveLessonItems(lessonOrPlanId, participantId, main, extra) {
      const user = auth.requireStaff();
      limits.enforce("api:lesson-items");
      const { participant } = guardParticipant(user, lessonOrPlanId, participantId);
      // The STORED stamp decides, even when the homework it names was cancelled since.
      if (participant.issuedAssignmentId !== null) {
        return errors.fail({ status: 409, code: "homeworkAlreadyIssued", message: (dict) => dict.apiPlanner.lessonItems.homeworkAlreadyIssued });
      }
      if (!Array.isArray(main)) {
        return errors.fail({ status: 400, code: "numbersRequired", message: (dict) => dict.apiPlanner.lessonItems.numbersRequired });
      }

      // Trim, drop blanks, de-duplicate, cut each part to 40; main wins over extra; unknown ids are dropped.
      const mainUnique = ctx.validate.ids(main).slice(0, LIMITS.maxItemsPerPart);
      const extraUnique = ctx.validate
        .ids(extra)
        .filter((id) => !mainUnique.includes(id))
        .slice(0, LIMITS.maxItemsPerPart);
      const mainIds = mainUnique.filter((id) => store.numbers.has(id));
      const extraIds = extraUnique.filter((id) => store.numbers.has(id));

      const existing = q.items(participant.id);
      const change = planLessonItemsUpdate(
        existing.map((item) => ({ id: item.id, homeworkNumberId: item.homeworkNumberId, hasSubmission: store.submissions.by("itemId", item.id).length > 0 })),
        mainIds,
        extraIds,
      );
      if (change.blockedItemIds.length > 0) {
        const numbers = existing.filter((item) => change.blockedItemIds.includes(item.id)).map((item) => q.number(item.homeworkNumberId)?.number ?? "");
        return errors.fail({
          status: 409,
          code: "blockedNumbers",
          message: (dict) => dict.apiPlanner.lessonItems.blockedNumbers,
          params: { numbers: numbers.join(", ") },
          details: { numbers },
        });
      }

      // A kept row keeps its id — and with it the reason, minutes, comment, result and submissions.
      store.transaction(() => {
        const now = ctx.nowIso();
        for (const itemId of change.toDelete) ctx.cascade.deleteLessonItem(itemId);
        for (const entry of change.toUpdate) store.lessonItems.update(entry.id, { order: entry.order, isExtra: entry.isExtra });
        for (const entry of change.toCreate) {
          store.lessonItems.insert({
            id: store.nextId("li"),
            participantId: participant.id,
            homeworkNumberId: entry.homeworkNumberId,
            order: entry.order,
            reason: "NEW",
            forReview: false,
            minutes: null,
            comment: null,
            isExtra: entry.isExtra,
            result: null,
            createdAt: now,
          });
        }
      });

      // The plan state (`planGeneratedAt`, `planError`, `planSummary`) and the student's progress are not touched.
      return boardItems(participant);
    },

    async regenerateParticipant(lessonOrPlanId, participantId) {
      const user = auth.requireStaff();
      limits.enforce("api:lesson-plan");
      const { lesson, participant } = guardParticipant(user, lessonOrPlanId, participantId);
      if (participant.issuedAssignmentId !== null) {
        return errors.fail({ status: 409, code: "homeworkAlreadyIssued", message: (dict) => dict.apiPlanner.lessonItems.homeworkAlreadyIssued });
      }
      if (!plannerAvailable(lesson.kind)) {
        return errors.fail({ status: 503, code: "plannerUnavailable", message: (dict) => dict.apiPlanner.lessons.plannerUnavailable });
      }
      // The slot is reserved before the state is reset: on a refusal the previous set and error stay as they are.
      const refused = reservePlanGenerations(1);
      if (refused?.code === "queueFull") {
        return errors.fail({ status: 503, code: "queueFull", message: (dict) => dict.planner.planErrors.queueFull });
      }
      if (refused) {
        // No `retryAfterSeconds`: the site sends no Retry-After for the planner's daily budget.
        return errors.fail({
          status: 429,
          code: "budgetExhausted",
          message: (dict) => dict.planner.planErrors.budgetExhausted,
          ...(refused.resetAt !== null ? { details: { resetAt: new Date(refused.resetAt).toISOString() } } : {}),
        });
      }

      // Items and summary stay until the new plan arrives.
      const planRequestedAt = ctx.nowIso();
      store.participants.update(participant.id, { planGeneratedAt: null, planError: null, updatedAt: planRequestedAt });
      enqueuePlans(lesson.id, [participant.id], user);
      return { planRequestedAt };
    },

    async setItemResult(lessonId, participantId, itemId, result) {
      const user = auth.requireStaff();
      limits.enforce("api:lesson-item-result");
      // The body is read before the item is looked up, as the site's handler does (05 §3.8).
      // `undefined` = the key is missing from the body.
      if (result !== null && !ctx.validate.oneOf<LessonItemResult>(result, LESSON_ITEM_RESULTS)) {
        return errors.fail({ status: 400, code: "invalidResult", message: (dict) => dict.apiPlanner.lessonResult.invalidResult });
      }
      const found = ctx.guard.lessonItem(user, lessonId, participantId, itemId);
      if (!seesStudent(user, found.participant.studentId)) throw errors.notFound("itemNotFound");

      const { lesson, participant, item } = found;
      // One transaction: the result and the mirrored number status with its history entry. Allowed in any lesson status.
      const written = store.transaction(() => {
        store.lessonItems.update(item.id, { result });
        return ctx.progress.write({
          source: "lesson_teacher",
          result,
          previousResult: item.result,
          studentId: participant.studentId,
          homeworkNumberId: item.homeworkNumberId,
          actor: user,
          references: { lessonId: lesson.id, itemId: item.id },
        });
      });

      ctx.emit({ kind: "student-progress-changed", studentId: participant.studentId, topicId: q.number(item.homeworkNumberId)?.topicId });
      // The student's Lesson tab refreshes on lesson activity, not on a progress change.
      ctx.emit({ kind: "lesson-activity", lessonId: lesson.id, teacherId: lesson.teacherId, studentId: participant.studentId });

      return { result, studentStatus: written.decision.status };
    },

    getHandoutUrl(lessonId, opts) {
      // The mock has no request behind the URL, so the checks of `GET …/handout` run here and reject
      // synchronously with the `ApiError` that request would answer with.
      const user = auth.requireStaff();
      const format: "pdf" | "html" = opts?.format === "html" ? "html" : "pdf";
      const forced = takeForcedHandoutError();
      if (forced) throw forcedHandoutError(forced, format);
      limits.enforce("lesson-pdf");

      const lesson = q.lesson(lessonId);
      const owned = lesson !== undefined && (user.role === "DEVELOPER" || lesson.teacherId === user.id);
      if (!lesson || !owned) throw errors.notFound("lessonNotFound");
      const answers = opts?.answers === true;
      if (lesson.kind !== "LESSON" && !answers) {
        return errors.fail({ status: 404, code: "noHomeworkHandout", message: (dict) => dict.apiPlanner.lessons.noHomeworkHandout });
      }
      const studentId = ctx.validate.id(opts?.studentId);
      const participants = q
        .participants(lesson.id)
        .filter((participant) => seesStudent(user, participant.studentId) && (!studentId || participant.studentId === studentId));
      // Nobody left after the filter: nothing to print.
      if (participants.length === 0) throw errors.notFound("lessonNotFound");

      return ctx.documents.url(format === "html" ? "lessonPrint" : "lessonHandout", { lessonId: lesson.id, format, studentId: studentId ?? undefined, answers: answers ? "1" : undefined });
    },

    async listHomeworkPlans() {
      const user = auth.requireStaff();
      return ownedLessons(user, "HOMEWORK").map((plan) => {
        const participants = store.participants.by("lessonId", plan.id);
        return {
          id: plan.id,
          title: plan.title,
          deadlineAt: plan.deadlineAt,
          createdAt: plan.createdAt,
          topicTitle: q.topic(plan.topicId)?.title ?? null,
          groupName: q.group(plan.groupId)?.name ?? null,
          participantsCount: participants.length,
          readyCount: participants.filter((participant) => participant.planGeneratedAt !== null).length,
          failedCount: participants.filter((participant) => participant.planError !== null).length,
          // The raw stored stamp: a cancelled homework still counts (05 §7 item 4).
          issuedCount: participants.filter((participant) => participant.issuedAssignmentId !== null).length,
        };
      });
    },

    async getHomeworkPlanNewForm(src) {
      const user = auth.requireStaff();
      const source = (src ?? {}) as { lessonId?: unknown; groupId?: unknown; studentId?: unknown };
      const lessonId = ctx.validate.id(source.lessonId);
      const groupId = ctx.validate.id(source.groupId);
      const studentId = ctx.validate.id(source.studentId);
      const topics = topicOptions();
      const texts = ctx.dict().planner.homeworkPlans.new;

      if (lessonId) {
        const lesson = ctx.guard.lesson(user, lessonId, "LESSON");
        const participants = q.participants(lesson.id);
        let members = participants.map((participant) => ({ id: participant.studentId, name: studentName(participant.studentId) }));
        // Entry from a student card: homework from the lesson for that student only.
        if (studentId) {
          members = members.filter((member) => member.id === studentId);
          if (members.length === 0) throw errors.notFound("studentNotFound");
        }
        const itemTopics = participants.flatMap((participant) =>
          q.items(participant.id).flatMap((item) => {
            const topicId = q.number(item.homeworkNumberId)?.topicId;
            return topicId ? [{ topicId }] : [];
          }),
        );
        return {
          kicker: format(texts.afterLesson, { title: lesson.title }),
          topics,
          members,
          defaultTopicId: pickDominantTopicId(itemTopics),
          defaultTitle: format(texts.defaultTitle, { title: lesson.title }),
          groupId: lesson.groupId,
          sourceLessonId: lesson.id,
        };
      }
      if (groupId) {
        const group = ctx.guard.group(user, groupId);
        const members = visibleGroupMembers(user, group.id).map((member) => ({ id: member.id, name: member.name }));
        return { kicker: group.name, topics, members, defaultTopicId: null, defaultTitle: "", groupId: group.id, sourceLessonId: null };
      }
      // SPEC-GAP: without any of the three parameters the site page is a plain 404; the first entity of the
      // contract's error list stands in for it.
      if (!studentId) throw errors.notFound("lessonNotFound");
      const student = ctx.guard.student(user, studentId);
      return { kicker: student.name, topics, members: [{ id: student.id, name: student.name }], defaultTopicId: null, defaultTitle: "", groupId: null, sourceLessonId: null };
    },

    async createHomeworkPlan(input) {
      const user = auth.requireStaff();
      limits.enforce("api:homework-plan");
      const body = (input ?? {}) as Partial<typeof input>;

      // The site's order (05 §3.13): the body first — exactly one topic and a deadline in the future (the
      // date of the next lesson) — then the topic, then the group, then the students.
      const params = normalizeHomeworkParams(body, ctx.nowDate());
      if (!params) {
        return errors.fail({ status: 400, code: "topicAndDeadlineRequired", message: (dict) => dict.apiPlanner.homeworkPlans.topicAndDeadlineRequired });
      }
      const topic = q.topic(params.topicId);
      if (!topic) throw errors.notFound("topicNotFound");
      const { group, studentIds } = resolveStudents(user, body.groupId, body.studentIds);
      if (studentIds.length === 0) {
        return errors.fail({ status: 400, code: "selectAtLeastOneStudent", message: (dict) => dict.apiPlanner.lessons.selectAtLeastOneStudent });
      }
      if (studentIds.length > LIMITS.maxStudentsPerLesson) {
        return errors.fail({
          status: 400,
          code: "tooManyStudents",
          message: (dict) => dict.apiPlanner.homeworkPlans.tooManyStudents,
          params: { max: LIMITS.maxStudentsPerLesson },
        });
      }

      const deadlineAt = params.deadlineAt.toISOString();
      const title = params.title || format(ctx.dict().apiPlanner.homeworkPlans.defaultTitle, { topic: topic.title, date: formatDate(deadlineAt, ctx.locale()) });
      // The source lesson is kept only when it is the caller's own lesson; otherwise silently dropped.
      const source = q.lesson(params.sourceLessonId);
      const sourceLessonId = source && source.kind === "LESSON" && (user.role === "DEVELOPER" || source.teacherId === user.id) ? source.id : null;

      const { plan, participantIds } = store.transaction(() => {
        const now = ctx.nowIso();
        const row = store.lessons.insert({
          id: store.nextId("hp"),
          title,
          subject: topic.subject,
          teacherId: user.id,
          groupId: group?.id ?? null,
          topicId: topic.id,
          status: "PLANNED",
          kind: "HOMEWORK",
          deadlineAt,
          durationMinutes: LIMITS.lessonDurationMinutes.default,
          planParams: { title, topicId: topic.id, deadlineAt, teacherNote: params.teacherNote, sourceLessonId, dailyMinutes: params.dailyMinutes, outputLocale: ctx.locale() },
          startsAt: null,
          startedAt: null,
          finishedAt: null,
          createdAt: now,
          updatedAt: now,
        });
        // No speed overrides in a draft: the generator reads the profile.
        return { plan: row, participantIds: studentIds.map((studentId) => insertParticipant(row.id, studentId, {}).id) };
      });

      return { planId: plan.id, plan: startPlans(plan, participantIds, user) };
    },

    async getHomeworkPlanBoard(planId) {
      const user = auth.requireStaff();
      const plan = ctx.guard.lesson(user, planId, "HOMEWORK");
      const topic = q.topic(plan.topicId);
      // A draft without a topic (the topic was deleted) cannot be shown.
      if (!topic) throw errors.notFound("draftNotFound");
      const group = q.group(plan.groupId);
      const sourceId = plan.planParams && "sourceLessonId" in plan.planParams ? plan.planParams.sourceLessonId : null;
      const source = q.lesson(sourceId);
      const sourceVisible = source !== undefined && source.kind === "LESSON" && (user.role === "DEVELOPER" || source.teacherId === user.id);

      const participants: HomeworkPlanParticipant[] = q
        .participants(plan.id)
        .filter((participant) => seesStudent(user, participant.studentId))
        .map((participant) => {
          // The stamp is shown only while the homework it names still exists (it may have been cancelled).
          const issued = participant.issuedAssignmentId !== null && store.homeworks.has(participant.issuedAssignmentId);
          if (participant.issuedAssignmentId === null) touchPending(participant);
          const items: HomeworkPlanItem[] = boardItems(participant)
            .filter((item) => !item.isExtra)
            .map((item) => ({
              id: item.id,
              homeworkNumberId: item.homeworkNumberId,
              number: item.number,
              conditionLatex: item.conditionLatex,
              reason: item.reason,
              minutes: item.minutes,
              comment: item.comment,
              studentStatus: item.studentStatus,
            }));
          return {
            id: participant.id,
            studentId: participant.studentId,
            studentName: studentName(participant.studentId),
            planSummary: participant.planSummary,
            planGeneratedAt: participant.planGeneratedAt,
            planError: participant.planError,
            issuedAssignmentId: issued ? participant.issuedAssignmentId : null,
            issuedAt: issued ? participant.issuedAt : null,
            createdAt: participant.createdAt,
            items,
          };
        });

      return {
        serverNow: ctx.nowIso(),
        id: plan.id,
        title: plan.title,
        topicId: topic.id,
        topicTitle: topic.title,
        deadlineAt: plan.deadlineAt,
        daysUntilDeadline: plan.deadlineAt ? daysUntil(new Date(plan.deadlineAt), ctx.nowDate()) : null,
        group: group ? { id: group.id, name: group.name } : null,
        sourceLesson: source && sourceVisible ? { id: source.id, title: source.title } : null,
        aiAvailable: plannerAvailable("HOMEWORK"),
        participants,
        topicNumbers: q.numbersOfTopic(topic.id).map((number) => ({ id: number.id, number: number.number })),
      };
    },

    async getHomeworkPlanStatus(planId) {
      const user = auth.requireStaff();
      const plan = ctx.guard.lesson(user, planId, "HOMEWORK");
      const participants = q.participants(plan.id).map((participant) => {
        if (participant.issuedAssignmentId === null) touchPending(participant);
        return {
          participantId: participant.id,
          studentId: participant.studentId,
          name: studentName(participant.studentId),
          planGeneratedAt: participant.planGeneratedAt,
          planError: participant.planError,
          // Raw stored values here — only the board checks that the homework still exists.
          issuedAssignmentId: participant.issuedAssignmentId,
          issuedAt: participant.issuedAt,
          itemsCount: store.lessonItems.by("participantId", participant.id).length,
        };
      });
      const ready = participants.filter((participant) => participant.planGeneratedAt !== null).length;
      const failed = participants.filter((participant) => participant.planGeneratedAt === null && participant.planError !== null).length;
      const issued = participants.filter((participant) => participant.issuedAssignmentId !== null).length;
      return { total: participants.length, ready, failed, issued, pending: participants.length - ready - failed, participants };
    },

    async issueHomeworkPlan(planId, participantIds) {
      const user = auth.requireStaff();
      limits.enforce("api:homework-plan#issue-delete");
      const plan = ctx.guard.lesson(user, planId, "HOMEWORK");
      const texts = ctx.dict().apiPlanner.homeworkPlanIssue;
      const { topicId, deadlineAt } = plan;
      if (!topicId || !deadlineAt) {
        return errors.fail({ status: 400, code: "missingTopicOrDeadline", message: texts.missingTopicOrDeadline });
      }
      if (new Date(deadlineAt).getTime() <= ctx.now()) {
        return errors.fail({ status: 400, code: "deadlinePassed", message: texts.deadlinePassed });
      }

      // An empty / missing list = every participant; per participant the outcome is independent.
      const requested = ctx.validate.ids(participantIds);
      const targets = q.participants(plan.id).filter((participant) => requested.length === 0 || requested.includes(participant.id));
      // The fixtures keep "" in `planParams.title` for auto-titled drafts; the site stores the resolved title there.
      const title = plan.planParams?.title || plan.title;

      const issued: IssueResult["issued"] = [];
      const failed: IssueResult["failed"] = [];
      for (const participant of targets) {
        const who = { participantId: participant.id, studentId: participant.studentId, name: studentName(participant.studentId) };
        // Idempotent: an issued participant (by the STORED stamp) is skipped silently.
        if (participant.issuedAssignmentId !== null) continue;
        const homeworkNumberIds = q.items(participant.id).map((item) => item.homeworkNumberId);
        if (homeworkNumberIds.length === 0) {
          failed.push({ ...who, code: "emptySet", message: texts.emptySet });
          continue;
        }
        try {
          const result = ctx.homework.issue({
            studentId: participant.studentId,
            issuedBy: user,
            topicId,
            homeworkNumberIds,
            deadlineAt,
            title,
            planParticipantId: participant.id,
          });
          if (result.ok) {
            issued.push({ ...who, assignmentId: result.assignmentId });
          } else if (result.code !== "alreadyIssued") {
            failed.push({ ...who, code: result.code, message: result.message, ...(result.conflictNumbers ? { conflictNumbers: result.conflictNumbers } : {}) });
          }
        } catch {
          failed.push({ ...who, code: "internalError", message: texts.internalError });
        }
      }

      return { issued, failed };
    },

    async deleteHomeworkPlan(planId) {
      const user = auth.requireStaff();
      limits.enforce("api:homework-plan#issue-delete");
      const plan = ctx.guard.lesson(user, planId, "HOMEWORK");
      // Homework already issued from the draft stays with the students.
      removeLesson(plan.id);
    },
  };
}
