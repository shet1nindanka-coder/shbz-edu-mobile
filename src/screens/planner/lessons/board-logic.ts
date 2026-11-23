// Pure rules of the lesson board (docs/spec/05-teacher-lessons-plans.md §1.3, §4.8, §5.3): parts of a set,
// live monitoring numbers, set editing payloads and the schedule timers. No React, no RN imports —
// unit-tested in tests/planner-board.test.ts.
import type { HomeworkNumberStatus, LessonBankTopic, LessonBoardItem, LessonBoardModel, LessonBoardParticipant, LessonItemResult } from '@/api/types';
import { computeIdleLevel, computeSpentMinutes, type IdleLevel } from '@/domain/lesson-live';
import { deriveLessonStatus, MAX_TIMER_DELAY_MS, type DerivedLessonStatus } from '@/domain/lesson-status';

// ───────────────────────────── set ─────────────────────────────

export type SetParts = { main: LessonBoardItem[]; extra: LessonBoardItem[] };

/** Main part first, then the extra part; each keeps the server order. */
export function splitParts(items: readonly LessonBoardItem[]): SetParts {
  return { main: items.filter((item) => !item.isExtra), extra: items.filter((item) => item.isExtra) };
}

export type SetIds = { mainIds: string[]; extraIds: string[] };

/** The complete set as the two id lists `saveLessonItems` takes. */
export function setIdsOf(items: readonly Pick<LessonBoardItem, 'homeworkNumberId' | 'isExtra'>[]): SetIds {
  return {
    mainIds: items.filter((item) => !item.isExtra).map((item) => item.homeworkNumberId),
    extraIds: items.filter((item) => item.isExtra).map((item) => item.homeworkNumberId),
  };
}

export function withoutNumber(ids: SetIds, homeworkNumberId: string): SetIds {
  return {
    mainIds: ids.mainIds.filter((id) => id !== homeworkNumberId),
    extraIds: ids.extraIds.filter((id) => id !== homeworkNumberId),
  };
}

/** A manually added number goes to the end of the chosen part. */
export function withNumber(ids: SetIds, homeworkNumberId: string, toExtra: boolean): SetIds {
  return toExtra
    ? { mainIds: ids.mainIds, extraIds: [...ids.extraIds, homeworkNumberId] }
    : { mainIds: [...ids.mainIds, homeworkNumberId], extraIds: ids.extraIds };
}

/** Numbers of a bank topic that are not in the participant's set yet (manual add offers only these). */
export function availableNumbers(
  topic: LessonBankTopic | undefined,
  existingIds: readonly string[],
): { id: string; number: string }[] {
  if (!topic) return [];
  const taken = new Set(existingIds);
  return topic.numbers.filter((number) => !taken.has(number.id));
}

/** Replaces one participant's set in a cached board (the response of a set save). */
export function replaceParticipantItems(board: LessonBoardModel, participantId: string, items: LessonBoardItem[]): LessonBoardModel {
  return {
    ...board,
    participants: board.participants.map((participant) => (participant.id === participantId ? { ...participant, items } : participant)),
  };
}

/** Patches one item of a cached board (optimistic result, then the server's answer). */
export function patchBoardItem(
  board: LessonBoardModel,
  participantId: string,
  itemId: string,
  patch: Partial<Pick<LessonBoardItem, 'result' | 'studentStatus'>>,
): LessonBoardModel {
  return {
    ...board,
    participants: board.participants.map((participant) =>
      participant.id === participantId
        ? { ...participant, items: participant.items.map((item) => (item.id === itemId ? { ...item, ...patch } : item)) }
        : participant,
    ),
  };
}

/** Result marks sent and not yet answered, by item id. */
export type PendingResults = Readonly<Record<string, { participantId: string; result: LessonItemResult | null }>>;

/**
 * The board as the teacher must see it while result marks are in flight: a board read that left the server
 * before a mark was written (a realtime refresh of the previous mark, a poll) does not switch the
 * optimistic traffic light off until that mark's own request has settled.
 */
export function applyPendingResults(board: LessonBoardModel, pending: PendingResults): LessonBoardModel {
  let next = board;
  for (const [itemId, mark] of Object.entries(pending)) {
    const participant = next.participants.find((row) => row.id === mark.participantId);
    const item = participant?.items.find((row) => row.id === itemId);
    if (!item || item.result === mark.result) continue;
    next = patchBoardItem(next, mark.participantId, itemId, { result: mark.result });
  }
  return next;
}

/** A regenerate was accepted: the participant is pending again; its set and summary stay until the new plan arrives. */
export function markParticipantPending(board: LessonBoardModel, participantId: string): LessonBoardModel {
  return {
    ...board,
    participants: board.participants.map((participant) =>
      participant.id === participantId ? { ...participant, planGeneratedAt: null, planError: null } : participant,
    ),
  };
}

// ───────────────────────────── the class list and the tiles ─────────────────────────────

/**
 * Colour of a number's tile on the board: the lesson result as a number status (solved → green, with
 * mistakes → yellow, not solved → red). «Не успел» and a number without a result carry no mark.
 */
export function boardTileStatus(item: Pick<LessonBoardItem, 'result'>): HomeworkNumberStatus | null {
  if (item.result === 'SOLVED') return 'GREEN';
  if (item.result === 'PARTIAL') return 'YELLOW';
  if (item.result === 'NOT_SOLVED') return 'RED';
  return null;
}

/** «2/7» of a row: the numbers the student has solved (also with mistakes) out of the whole set. */
export function solvedCount(items: readonly Pick<LessonBoardItem, 'result'>[]): number {
  return items.filter((item) => item.result === 'SOLVED' || item.result === 'PARTIAL').length;
}

/** Why a number waits for the teacher, strongest reason first; `null` = it does not. */
export type ItemAttention = 'injection' | 'uncertain' | 'checkFailed';

/**
 * A submitted number the automatic check could not close: an instruction to the checker was found on the
 * photo, the answer was not recognised, or the check failed. Once the number has a result it is settled.
 */
export function itemAttention(item: Pick<LessonBoardItem, 'result' | 'submission'>): ItemAttention | null {
  const submission = item.submission;
  if (item.result !== null || !submission) return null;
  if (submission.status === 'FAILED') return 'checkFailed';
  if (submission.status !== 'DONE') return null;
  if (submission.injectionSuspected) return 'injection';
  return submission.verdict === 'UNCERTAIN' ? 'uncertain' : null;
}

/** The latest submission of the number is waiting for its check or being checked. */
export function isItemChecking(item: Pick<LessonBoardItem, 'submission'>): boolean {
  return item.submission?.status === 'PENDING' || item.submission?.status === 'CHECKING';
}

/**
 * The number whose card the board shows for a student: the picked one while it is still in the set, else
 * the first that waits for the teacher, else the first submitted one without a result, else the first
 * without a result, else the first.
 */
export function pickBoardItemId(items: readonly Pick<LessonBoardItem, 'id' | 'result' | 'submission'>[], pickedId?: string | null): string | null {
  if (pickedId && items.some((item) => item.id === pickedId)) return pickedId;
  return (
    items.find((item) => itemAttention(item) !== null) ??
    items.find((item) => item.result === null && item.submission !== null) ??
    items.find((item) => item.result === null) ??
    items[0]
  )?.id ?? null;
}

/** The one caption of a student's row: what the student is at, the thing that needs the teacher first. */
export type ParticipantCaption =
  | { kind: 'planFailed' }
  | { kind: 'planPending' }
  | { kind: 'attention'; reason: ItemAttention; number: string }
  | { kind: 'notOpened'; alert: boolean }
  | { kind: 'idle'; minutes: number; alert: boolean }
  | { kind: 'checking' }
  | { kind: 'inClass'; joinedAt: string }
  | { kind: 'tasks'; count: number };

export function participantCaption(
  participant: Pick<LessonBoardParticipant, 'joinedAt' | 'items'>,
  plan: { pending: boolean; stale: boolean; failed: boolean },
  live: Pick<ParticipantLive, 'idle'>,
  lessonStatus: DerivedLessonStatus,
): ParticipantCaption {
  if (plan.failed || plan.stale) return { kind: 'planFailed' };
  if (plan.pending) return { kind: 'planPending' };
  const waiting = participant.items.find((item) => itemAttention(item) !== null);
  const reason = waiting ? itemAttention(waiting) : null;
  if (waiting && reason) return { kind: 'attention', reason, number: waiting.number };
  if (lessonStatus === 'ACTIVE') {
    const idle = live.idle && live.idle.level !== 'ok' ? live.idle : null;
    if (!participant.joinedAt) return { kind: 'notOpened', alert: idle?.level === 'alert' };
    if (idle?.level === 'alert') return { kind: 'idle', minutes: idle.idleMinutes, alert: true };
    if (participant.items.some(isItemChecking)) return { kind: 'checking' };
    if (idle) return { kind: 'idle', minutes: idle.idleMinutes, alert: false };
    return { kind: 'inClass', joinedAt: participant.joinedAt };
  }
  return { kind: 'tasks', count: participant.items.length };
}

// ───────────────────────────── live monitoring ─────────────────────────────

export type ParticipantLive = {
  /** Items that have a latest submission. */
  submittedCount: number;
  /** All items, main + extra. */
  totalCount: number;
  /** max(joinedAt, every latest submission's submittedAt); `null` = no activity at all. */
  lastActivityAt: number | null;
  /** Only while the lesson is ACTIVE and has a start time. */
  idle: { level: IdleLevel; idleMinutes: number } | null;
  /** Minutes spent on a submitted item, by item id (only when the lesson has a start time). */
  spentByItemId: Record<string, number>;
};

export function participantLive(
  participant: Pick<LessonBoardParticipant, 'joinedAt' | 'items'>,
  lesson: { status: DerivedLessonStatus; startsAt: string | null; idleWarnMinutes: number; idleAlertMinutes: number },
  now: number,
): ParticipantLive {
  const joinedAt = participant.joinedAt ? Date.parse(participant.joinedAt) : null;
  const submitted = participant.items
    .filter((item) => item.submission !== null)
    .map((item) => ({ itemId: item.id, at: Date.parse(item.submission?.submittedAt ?? '') }))
    .filter((entry) => Number.isFinite(entry.at))
    .sort((left, right) => left.at - right.at);

  let lastActivityAt: number | null = joinedAt !== null && Number.isFinite(joinedAt) ? joinedAt : null;
  for (const entry of submitted) {
    if (lastActivityAt === null || entry.at > lastActivityAt) lastActivityAt = entry.at;
  }

  const startedAt = lesson.startsAt ? Date.parse(lesson.startsAt) : Number.NaN;
  const hasStart = Number.isFinite(startedAt);

  const idle =
    lesson.status === 'ACTIVE' && hasStart
      ? computeIdleLevel(
          { lastActivityAt, lessonStartedAt: startedAt, warnMinutes: lesson.idleWarnMinutes, alertMinutes: lesson.idleAlertMinutes },
          now,
        )
      : null;

  const spentByItemId: Record<string, number> = {};
  if (hasStart) {
    const spent = computeSpentMinutes(
      submitted.map((entry) => entry.at),
      { lessonStartedAt: startedAt, joinedAt: joinedAt !== null && Number.isFinite(joinedAt) ? joinedAt : null },
    );
    submitted.forEach((entry, index) => {
      const minutes = spent[index];
      if (typeof minutes === 'number') spentByItemId[entry.itemId] = minutes;
    });
  }

  return {
    submittedCount: participant.items.filter((item) => item.submission !== null).length,
    totalCount: participant.items.length,
    lastActivityAt,
    idle,
    spentByItemId,
  };
}

/** Whole minutes since `iso` (never negative); 0 = "just now". */
export function minutesAgo(iso: string, now: number): number {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return 0;
  return Math.max(0, Math.floor((now - at) / 60_000));
}

// ───────────────────────────── schedule ─────────────────────────────

type ScheduledLesson = Pick<LessonBoardModel, 'status' | 'startsAt' | 'durationMinutes' | 'finishedAt'>;

/**
 * The status the schedule gives at `now` (server-corrected clock). A lesson without a start keeps the
 * status it arrived with; an early finish and a reschedule are learned only from a refetch (A4 §3.4 L5).
 */
export function scheduledStatus(lesson: ScheduledLesson, now: number): DerivedLessonStatus {
  if (!lesson.startsAt) return lesson.status;
  return deriveLessonStatus({ startsAt: lesson.startsAt, durationMinutes: lesson.durationMinutes, status: lesson.status, finishedAt: lesson.finishedAt }, now);
}

const STATUS_RANK: Record<DerivedLessonStatus, number> = { PLANNED: 0, ACTIVE: 1, FINISHED: 2 };

/**
 * True when the schedule has moved the lesson past the status the board arrived with (it has started, or
 * its time is over): the board is then re-read. Only forward moves count, so a clock that is a little
 * behind the server's never asks for a read that cannot change anything.
 */
export function hasScheduleMovedOn(lesson: ScheduledLesson, now: number): boolean {
  return STATUS_RANK[scheduledStatus(lesson, now)] > STATUS_RANK[lesson.status];
}

/**
 * Whole minutes until a running lesson ends by its schedule (never negative); `null` for a lesson that is
 * not running or has no start time.
 */
export function minutesLeft(lesson: Pick<LessonBoardModel, 'status' | 'startsAt' | 'durationMinutes'>, now: number): number | null {
  if (lesson.status !== 'ACTIVE' || !lesson.startsAt) return null;
  const start = Date.parse(lesson.startsAt);
  if (!Number.isFinite(start)) return null;
  const end = start + Math.max(0, lesson.durationMinutes) * 60_000;
  return Math.max(0, Math.ceil((end - now) / 60_000));
}

/** Grace after a schedule edge, so the server already reports the new status when the board is re-read. */
const SCHEDULE_EDGE_GRACE_MS = 1000;

/**
 * Milliseconds until the board should be re-read because the schedule flips its status (start, then
 * end); `null` when no flip is ahead (no time, finished) or it is further than a timer can wait.
 */
export function nextScheduleRefreshDelay(lesson: ScheduledLesson, now: number): number | null {
  if (!lesson.startsAt || lesson.status === 'FINISHED') return null;
  const start = Date.parse(lesson.startsAt);
  if (!Number.isFinite(start)) return null;
  const end = start + Math.max(0, lesson.durationMinutes) * 60_000;
  const edge = now < start ? start : now < end ? end : null;
  if (edge === null) return null;
  const delay = edge - now + SCHEDULE_EDGE_GRACE_MS;
  return delay <= MAX_TIMER_DELAY_MS ? delay : null;
}

/** The "no time" banner: an unscheduled lesson that is not finished. */
export function needsSchedule(lesson: Pick<LessonBoardModel, 'startsAt' | 'status'>): boolean {
  return lesson.startsAt === null && lesson.status !== 'FINISHED';
}
