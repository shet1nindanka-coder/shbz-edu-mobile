// Pure rules of the "Lessons" segment of the student card (docs/spec/04-teacher-students.md S6, §3.11 –
// §3.13, §5.2). No React, no RN imports — unit-tested in tests/teacher-card.test.ts.
import type { LessonBankTopic, LessonBoardItem, LessonItemResult, LessonPlanStatus, TeacherStudentLesson } from '@/api/types';
import { LIMITS } from '@/api/types/limits';

export type LessonItem = TeacherStudentLesson['items'][number];

export type LessonParts = { main: LessonItem[]; extra: LessonItem[] };

/** Main part first, then the extra part; each keeps the server order. */
export function splitLessonParts(items: readonly LessonItem[]): LessonParts {
  return { main: items.filter((item) => !item.isExtra), extra: items.filter((item) => item.isExtra) };
}

export type LessonSetIds = { mainIds: string[]; extraIds: string[] };

/** The complete set as the two id lists `saveLessonItems` takes (main part, then extra part). */
export function lessonSetIds(items: readonly Pick<LessonItem, 'homeworkNumberId' | 'isExtra'>[]): LessonSetIds {
  return {
    mainIds: items.filter((item) => !item.isExtra).map((item) => item.homeworkNumberId),
    extraIds: items.filter((item) => item.isExtra).map((item) => item.homeworkNumberId),
  };
}

export function setWithoutNumber(ids: LessonSetIds, homeworkNumberId: string): LessonSetIds {
  return {
    mainIds: ids.mainIds.filter((id) => id !== homeworkNumberId),
    extraIds: ids.extraIds.filter((id) => id !== homeworkNumberId),
  };
}

/** A manually added number goes to the end of the chosen part. */
export function setWithNumber(ids: LessonSetIds, homeworkNumberId: string, toExtra: boolean): LessonSetIds {
  return toExtra
    ? { mainIds: ids.mainIds, extraIds: [...ids.extraIds, homeworkNumberId] }
    : { mainIds: [...ids.mainIds, homeworkNumberId], extraIds: ids.extraIds };
}

/** Numbers of a bank topic that are not in the set yet — manual add offers only these. */
export function freeBankNumbers(topic: LessonBankTopic | undefined, existingIds: readonly string[]): { id: string; number: string }[] {
  if (!topic) return [];
  const taken = new Set(existingIds);
  return topic.numbers.filter((number) => !taken.has(number.id));
}

/**
 * Why the number select of the "add a problem" sheet offers nothing: the topic has no numbers at all, or
 * every one of them is already in the set; `null` while there is something to pick (or no topic yet).
 * The two must not share a line: for an empty topic "all already in the set" contradicts an empty set.
 */
export function bankNumbersGap(topic: LessonBankTopic | undefined, freeCount: number): 'topicEmpty' | 'allInSet' | null {
  if (!topic || freeCount > 0) return null;
  return topic.numbers.length === 0 ? 'topicEmpty' : 'allInSet';
}

// ───────────────────────────── cache patches ─────────────────────────────

type LessonsData = { lessons: TeacherStudentLesson[] };

function patchLesson(data: LessonsData, lessonId: string, update: (lesson: TeacherStudentLesson) => TeacherStudentLesson): LessonsData {
  return { ...data, lessons: data.lessons.map((lesson) => (lesson.id === lessonId ? update(lesson) : lesson)) };
}

/** Optimistic lesson result of one item, and the server's answer afterwards. */
export function patchItemResult(data: LessonsData, lessonId: string, itemId: string, result: LessonItemResult | null): LessonsData {
  return patchLesson(data, lessonId, (lesson) => ({
    ...lesson,
    items: lesson.items.map((item) => (item.id === itemId ? { ...item, result } : item)),
  }));
}

/** The set after a save: the response is the whole set of board items; the card keeps its six fields. */
export function patchLessonItems(data: LessonsData, lessonId: string, items: readonly LessonBoardItem[]): LessonsData {
  return patchLesson(data, lessonId, (lesson) => ({
    ...lesson,
    items: items.map((item) => ({
      id: item.id,
      homeworkNumberId: item.homeworkNumberId,
      number: item.number,
      topicTitle: item.topicTitle,
      isExtra: item.isExtra,
      result: item.result,
    })),
  }));
}

/** A regenerate was accepted: the plan is pending again; the previous set stays until the new one replaces it. */
export function markLessonPending(data: LessonsData, lessonId: string): LessonsData {
  return patchLesson(data, lessonId, (lesson) => ({ ...lesson, planPending: true, planError: null }));
}

// ───────────────────────────── AI plan state ─────────────────────────────

export type LessonPlanState = 'ready' | 'pending' | 'stale' | 'failed';

/**
 * State of this student's plan in a lesson. A plan that has been "running" for more than 15 minutes was
 * lost (the server does not expose the queue time). Like the site's lessons tab (04 §5.2), the anchor is
 * when THIS client first saw the lesson pending (`pendingSince`, epoch ms) — never `lesson.createdAt`, so a
 * plan still being built after an app restart or a retry made elsewhere shows the spinner — or the latest
 * "Retry" the app had accepted for this participant, whichever is later. Not seen yet → pending.
 *
 * Every term is DEVICE time: `now`, `pendingSince` and `requestedAt` (the accepted Retry converted with
 * `planRequestDeviceAnchor`). Comparing the server's `planRequestedAt` with the device clock would let a
 * device that runs behind the server keep the spinner for 15 minutes plus the skew, while the lesson
 * board — which corrects its clock by the server's — already says the plan was lost (09 §6.2 rule 6).
 */
export function lessonPlanState(
  lesson: Pick<TeacherStudentLesson, 'planPending' | 'planError'>,
  now: number,
  pendingSince: number | undefined,
  requestedAt?: number,
): LessonPlanState {
  if (lesson.planError !== null) return 'failed';
  if (!lesson.planPending) return 'ready';
  const seen = pendingSince ?? Number.NaN;
  const requested = requestedAt ?? Number.NaN;
  const anchor = Number.isNaN(requested) ? seen : Number.isNaN(seen) ? requested : Math.max(seen, requested);
  return !Number.isNaN(anchor) && now - anchor > LIMITS.stalePlanMs ? 'stale' : 'pending';
}

/** An accepted "Retry" (`raw` = the server's `planRequestedAt`) and the same moment on the device clock. */
export type PlanRequestAnchor = { raw: string; deviceMs: number };

/**
 * Converts the server's `planRequestedAt` into device time, once per accepted Retry (`previous` is kept
 * while `raw` is unchanged). With the server-clock offset the lesson board used (`serverOffsetMs`, server
 * minus device) the result is exactly the board's anchor, so the two screens turn "lost" together. Without
 * one (the board was never read, or its cache is gone) the moment the card first saw the Retry
 * (`observedAt`) is used: never before the real request, so the card can only be late, never early — the
 * same guarantee as `pendingSince`. A Retry made on the card itself is stamped with the device time at which
 * the response arrived (`{ raw, deviceMs: Date.now() }`) and never goes through here.
 */
export function planRequestDeviceAnchor(
  previous: PlanRequestAnchor | undefined,
  raw: string | null,
  serverOffsetMs: number | null,
  observedAt: number,
): PlanRequestAnchor | undefined {
  if (raw === null) return undefined;
  if (previous && previous.raw === raw) return previous;
  const server = Date.parse(raw);
  if (Number.isNaN(server)) return undefined;
  return { raw, deviceMs: serverOffsetMs === null ? observedAt : server - serverOffsetMs };
}

/**
 * Keeps the "first seen pending" map in step with the current pending set (the site's `pendingSinceRef`):
 * a newly pending lesson is stamped with `now`, a lesson that left the set is forgotten. Mutates `since`.
 */
export function syncPendingSince(since: Map<string, number>, pendingIds: readonly string[], now: number): void {
  const pending = new Set(pendingIds);
  for (const id of pending) if (!since.has(id)) since.set(id, now);
  for (const id of [...since.keys()]) if (!pending.has(id)) since.delete(id);
}

/** The status poll answered: has this student's plan been built (or failed) since the list was read? */
export function planSettled(status: Pick<LessonPlanStatus, 'participants'> | undefined, participantId: string): boolean {
  const participant = status?.participants.find((entry) => entry.participantId === participantId);
  return participant !== undefined && (participant.planGeneratedAt !== null || participant.planError !== null);
}
