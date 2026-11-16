// Pure rules of the lesson board (docs/spec/05-teacher-lessons-plans.md §1.3, §4.8, §5.3): parts of a set,
// live monitoring numbers, set editing payloads and the schedule timers. No React, no RN imports —
// unit-tested in tests/planner-board.test.ts.
import type { LessonBankTopic, LessonBoardItem, LessonBoardModel, LessonBoardParticipant } from '@/api/types';
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

/** Ordinal shown before a number: the extra part continues the numbering of the main part. */
export function itemOrdinal(index: number, isExtra: boolean, mainCount: number): number {
  return (isExtra ? mainCount : 0) + index + 1;
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

/** A regenerate was accepted: the participant is pending again; its set and summary stay until the new plan arrives. */
export function markParticipantPending(board: LessonBoardModel, participantId: string): LessonBoardModel {
  return {
    ...board,
    participants: board.participants.map((participant) =>
      participant.id === participantId ? { ...participant, planGeneratedAt: null, planError: null } : participant,
    ),
  };
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
