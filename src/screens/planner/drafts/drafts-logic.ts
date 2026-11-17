// Pure rules of the homework-draft screens (docs/spec/05-teacher-lessons-plans.md §1.5–§1.7, §3.13, §3.15,
// §4.10): the list card, the create form's request body, set editing and what an issue answer means.
// No React, no RN imports — unit-tested in tests/planner-drafts.test.ts.
import type {
  CreateHomeworkPlanInput,
  HomeworkPlanBoardModel,
  HomeworkPlanItem,
  HomeworkPlanListItem,
  HomeworkPlanNewModel,
  HomeworkPlanParticipant,
  HomeworkPlanStatus,
  IssueResult,
  LessonBoardItem,
} from '@/api/types';
import { META_LIMITS } from '@/api/types/limits';
import { daysUntil } from '@/domain/homework-plan';
import { parseMskDateTimeInput, toEpochMs } from '@/domain/moscow-time';

// ───────────────────────────── list ─────────────────────────────

/**
 * Colour of the «выдано {issued} из {total}» chip: green once every participant has the homework,
 * yellow otherwise (an empty draft is never "all issued").
 */
export function issuedChipTone(plan: Pick<HomeworkPlanListItem, 'issuedCount' | 'participantsCount'>): 'green' | 'yellow' {
  return plan.participantsCount > 0 && plan.issuedCount === plan.participantsCount ? 'green' : 'yellow';
}

/** Newest first, as the site orders the list (`createdAt desc`); the id breaks ties so the order is stable. */
export function sortDrafts<T extends Pick<HomeworkPlanListItem, 'id' | 'createdAt'>>(plans: readonly T[]): T[] {
  return [...plans].sort((left, right) => toEpochMs(right.createdAt) - toEpochMs(left.createdAt) || left.id.localeCompare(right.id));
}

// ───────────────────────────── new draft ─────────────────────────────

export type DraftSource = { lessonId: string; studentId?: string } | { groupId: string } | { studentId: string };

/**
 * Which of the three route parameters decides the form (§1.6 "Resolution rules"): a lesson first (with
 * `studentId` it narrows the homework to that participant), then a group, then a single student. None of
 * them → `null`: the site answers 404.
 */
export function draftSourceOf(params: { lessonId?: string; groupId?: string; studentId?: string }): DraftSource | null {
  const lessonId = params.lessonId?.trim();
  const groupId = params.groupId?.trim();
  const studentId = params.studentId?.trim();
  if (lessonId) return studentId ? { lessonId, studentId } : { lessonId };
  if (groupId) return { groupId };
  if (studentId) return { studentId };
  return null;
}

/** A stable key of the source: a different source is a different form. */
export function draftSourceKey(source: DraftSource): string {
  if ('lessonId' in source) return `lesson-${source.lessonId}-${source.studentId ?? 'all'}`;
  if ('groupId' in source) return `group-${source.groupId}`;
  return `student-${source.studentId}`;
}

/** The topic the form starts with: the lesson's dominant topic, otherwise the first topic of the bank. */
export function initialTopicId(form: Pick<HomeworkPlanNewModel, 'defaultTopicId' | 'topics'>): string | null {
  if (form.defaultTopicId && form.topics.some((topic) => topic.id === form.defaultTopicId)) return form.defaultTopicId;
  return form.topics[0]?.id ?? null;
}

export type DraftFormState = {
  topicId: string | null;
  /** Moscow wall clock `YYYY-MM-DDTHH:mm`, or "" when not picked. */
  deadlineAt: string;
  dailyMinutes: number;
  teacherNote: string;
  studentIds: string[];
};

export type DraftFormProblem = 'pickTopic' | 'pickDeadline';

/** The two client checks of the site's form, in its order; `null` = the request may be sent. */
export function validateDraftForm(state: Pick<DraftFormState, 'topicId' | 'deadlineAt'>): DraftFormProblem | null {
  if (!state.topicId) return 'pickTopic';
  if (!state.deadlineAt) return 'pickDeadline';
  return null;
}

const DAILY = META_LIMITS.homeworkDailyMinutes;

export function clampDailyMinutes(value: number): number {
  if (!Number.isFinite(value)) return DAILY.default;
  return Math.min(DAILY.max, Math.max(DAILY.min, Math.round(value)));
}

/**
 * Body of `POST /teacher/homework-plans`. There is no title field: a draft made from a lesson carries the
 * lesson-derived title, any other one gets its title from the server.
 */
export function buildDraftInput(
  state: DraftFormState,
  form: Pick<HomeworkPlanNewModel, 'defaultTitle' | 'groupId' | 'sourceLessonId'>,
): CreateHomeworkPlanInput {
  const instant = parseMskDateTimeInput(state.deadlineAt);
  const title = form.defaultTitle.trim();
  return {
    topicId: state.topicId ?? '',
    // A malformed picker value still goes out as typed: the server answers `400 topicAndDeadlineRequired`.
    deadlineAt: instant ? instant.toISOString() : state.deadlineAt,
    ...(title ? { title } : {}),
    teacherNote: state.teacherNote.trim(),
    dailyMinutes: clampDailyMinutes(state.dailyMinutes),
    ...(form.sourceLessonId ? { sourceLessonId: form.sourceLessonId } : {}),
    ...(form.groupId ? { groupId: form.groupId } : {}),
    studentIds: state.studentIds,
  };
}

export type DraftBudget = { days: number; minutes: number; total: number };

/**
 * The volume the AI is given: minutes per day × days until the deadline (days clamped to 1..60, §4.10).
 * `null` while no deadline is picked or it is not in the future (the server refuses such a draft).
 */
export function draftBudget(dailyMinutes: number, deadlineAt: string, now: number): DraftBudget | null {
  const instant = deadlineAt ? parseMskDateTimeInput(deadlineAt) : null;
  if (!instant || instant.getTime() <= now) return null;
  const minutes = clampDailyMinutes(dailyMinutes);
  const days = daysUntil(instant, new Date(now));
  return { days, minutes, total: minutes * days };
}

// ───────────────────────────── board ─────────────────────────────

export function isIssued(participant: Pick<HomeworkPlanParticipant, 'issuedAssignmentId'>): boolean {
  return Boolean(participant.issuedAssignmentId);
}

/** Participants «Выдать всем (n)» counts: not issued and with at least one problem. */
export function countIssuable(participants: readonly Pick<HomeworkPlanParticipant, 'issuedAssignmentId' | 'items'>[]): number {
  return participants.filter((participant) => !isIssued(participant) && participant.items.length > 0).length;
}

export function countIssued(participants: readonly Pick<HomeworkPlanParticipant, 'issuedAssignmentId'>[]): number {
  return participants.filter(isIssued).length;
}

/** A draft has only the main part: the rows of a set-save answer as draft items. */
export function toDraftItems(items: readonly LessonBoardItem[]): HomeworkPlanItem[] {
  return items
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
}

/** The set without one item, as the id list `saveLessonItems` takes. */
export function idsWithout(items: readonly Pick<HomeworkPlanItem, 'id' | 'homeworkNumberId'>[], itemId: string): string[] {
  return items.filter((item) => item.id !== itemId).map((item) => item.homeworkNumberId);
}

/** The set with one more number at the end (a manually added number is always last). */
export function idsWith(items: readonly Pick<HomeworkPlanItem, 'homeworkNumberId'>[], homeworkNumberId: string): string[] {
  const ids = items.map((item) => item.homeworkNumberId);
  return ids.includes(homeworkNumberId) ? ids : [...ids, homeworkNumberId];
}

/** Numbers of the draft's topic that are not in the participant's set yet (manual add offers only these). */
export function freeTopicNumbers<T extends { id: string }>(topicNumbers: readonly T[], existingIds: readonly string[]): T[] {
  const taken = new Set(existingIds);
  return topicNumbers.filter((number) => !taken.has(number.id));
}

/** Replaces one participant's set in a cached board (the answer of a set save). */
export function replaceDraftItems(board: HomeworkPlanBoardModel, participantId: string, items: HomeworkPlanItem[]): HomeworkPlanBoardModel {
  return {
    ...board,
    participants: board.participants.map((participant) => (participant.id === participantId ? { ...participant, items } : participant)),
  };
}

/** A regenerate was accepted: pending again; the set and the summary stay until the new plan arrives. */
export function markDraftParticipantPending(board: HomeworkPlanBoardModel, participantId: string): HomeworkPlanBoardModel {
  return {
    ...board,
    participants: board.participants.map((participant) =>
      participant.id === participantId ? { ...participant, planGeneratedAt: null, planError: null } : participant,
    ),
  };
}

/** Chip colour of the reason a problem was selected — coloured on this board: gap = yellow, new = green. */
export function reasonTone(reason: string): 'yellow' | 'green' | 'muted' {
  if (reason === 'GAP') return 'yellow';
  if (reason === 'REVIEW') return 'muted';
  // NEW, and anything unknown falls back to the "new" look, as its label does.
  return 'green';
}

/**
 * The Moscow day in the answer sheet's file name is the day the draft was created. The board payload has
 * no `createdAt` of the draft itself; its participants are created together with it.
 */
export function draftCreatedAt(board: Pick<HomeworkPlanBoardModel, 'participants' | 'serverNow'>): string {
  let earliest: string | null = null;
  for (const participant of board.participants) {
    if (earliest === null || toEpochMs(participant.createdAt) < toEpochMs(earliest)) earliest = participant.createdAt;
  }
  return earliest ?? board.serverNow;
}

// ───────────────────────────── generation poll ─────────────────────────────

type StatusRow = HomeworkPlanStatus['participants'][number];

/**
 * The issue stamps as the status endpoint reports them — the STORED values. The board hides the stamp of
 * a homework that was cancelled, so stamps are compared poll to poll, never with the board.
 */
export function issueStampSignature(rows: readonly Pick<StatusRow, 'participantId' | 'issuedAssignmentId'>[]): string {
  return [...rows]
    .sort((left, right) => left.participantId.localeCompare(right.participantId))
    .map((row) => `${row.participantId}:${row.issuedAssignmentId ?? ''}`)
    .join('|');
}

// ───────────────────────────── issue ─────────────────────────────

export type IssueOutcome = {
  /** How many students got the homework by this request. */
  issuedCount: number;
  /**
   * `issuedTo` — «ДЗ выдано: {n}.»; `alreadyIssued` — nobody new and nobody failed: every selected student
   * already had it; `null` — only failures, which the red block lists.
   */
  notice: 'issuedTo' | 'alreadyIssued' | null;
  failures: { participantId: string; name: string; message: string }[];
};

export function issueOutcomeOf(result: Pick<IssueResult, 'issued' | 'failed'>): IssueOutcome {
  const issuedCount = result.issued.length;
  const failures = result.failed.map((entry) => ({ participantId: entry.participantId, name: entry.name, message: entry.message }));
  const notice = issuedCount > 0 ? 'issuedTo' : failures.length === 0 ? 'alreadyIssued' : null;
  return { issuedCount, notice, failures };
}
