/**
 * Pure decisions of the student's homework and live-lesson screens (docs/spec/03-student-homework-lesson.md,
 * 90-addendum-5 Part A): list grouping, check summaries, cache merges after a poll, the polling back-off
 * and the lesson clock. No React, no React Native — covered by `tests/student-work-logic.test.ts`.
 */
import type {
  AttachedPhoto,
  GetHomeworkResponse,
  GetLessonResponse,
  HomeworkNumberStatus,
  HomeworkSummaryDto,
  LatestHomeworkCheckResponse,
  LessonItemDto,
  LessonItemResult,
  LessonStateResponse,
  LessonSubmissionDto,
  SolutionCheckStatus,
  SolutionVerdict,
  StudentCheckDto,
  StudentCheckResultDto,
} from '@/api/types';
import { format } from '@/lib/i18n/format';

// ───────────────────────────── homework list (H1) ─────────────────────────────

/** `completed = totalNumbers > 0 && solvedCount === totalNumbers` (03 §1 H1, state C). */
export function isHomeworkCompleted(homework: { totalNumbers: number; solvedCount: number }): boolean {
  return homework.totalNumbers > 0 && homework.solvedCount === homework.totalNumbers;
}

/** Active first (server order kept), completed ones go to the archive. */
export function splitHomeworks<T extends { totalNumbers: number; solvedCount: number }>(
  assignments: readonly T[],
): { active: T[]; archived: T[] } {
  const active: T[] = [];
  const archived: T[] = [];
  for (const assignment of assignments) (isHomeworkCompleted(assignment) ? archived : active).push(assignment);
  return { active, archived };
}

export type HomeworkListRow =
  | { kind: 'homework'; key: string; homework: HomeworkSummaryDto; archived: boolean }
  /** «Все ДЗ выполнены — новых пока нет.» — shown instead of the active cards. */
  | { kind: 'allDone'; key: 'all-done' }
  /** The disclosure «Выполненные ДЗ (N)». */
  | { kind: 'archiveToggle'; key: 'archive-toggle'; count: number; open: boolean };

/** Rows of the homework list: active cards, the "all done" line, the archive disclosure and its cards. */
export function buildHomeworkRows(assignments: readonly HomeworkSummaryDto[], archiveOpen: boolean): HomeworkListRow[] {
  if (assignments.length === 0) return [];
  const { active, archived } = splitHomeworks(assignments);
  const rows: HomeworkListRow[] = active.map((homework) => ({ kind: 'homework', key: homework.id, homework, archived: false }));
  if (active.length === 0) rows.push({ kind: 'allDone', key: 'all-done' });
  if (archived.length > 0) {
    rows.push({ kind: 'archiveToggle', key: 'archive-toggle', count: archived.length, open: archiveOpen });
    if (archiveOpen) {
      for (const homework of archived) rows.push({ kind: 'homework', key: homework.id, homework, archived: true });
    }
  }
  return rows;
}

/** Label of an assignment: its own title, else «ДЗ N» by its order inside the topic. */
export function homeworkLabel(homework: { title: string | null; orderInTopic: number }, homeworkN: string): string {
  return homework.title || format(homeworkN, { n: homework.orderInTopic });
}

/**
 * Meta line of a list card (03 §1 H1): «ДЗ до {date} · » + «Выполнено {solved} из {total}» + « · Фото: {count}».
 * `deadlineDate` is the already formatted date, or null when the homework has no deadline.
 */
export function homeworkListMeta(
  homework: Pick<HomeworkSummaryDto, 'solvedCount' | 'totalNumbers' | 'photosCount'>,
  texts: { deadlineUntil: string; solvedOf: string; photos: string },
  deadlineDate: string | null,
): string {
  return (
    (deadlineDate ? format(texts.deadlineUntil, { date: deadlineDate }) : '') +
    format(texts.solvedOf, { solved: homework.solvedCount, total: homework.totalNumbers }) +
    (homework.photosCount > 0 ? format(texts.photos, { count: homework.photosCount }) : '')
  );
}

/**
 * Meta line of the detail header (03 §1 H2): «Дедлайн до {date} · » + «Выполнено {solved} из {total}».
 * `deadlineDateTime` is the already formatted date and time, or null.
 */
export function homeworkDetailMeta(
  homework: { solvedCount: number; totalNumbers: number },
  texts: { deadlineUntil: string; solvedOf: string },
  deadlineDateTime: string | null,
): string {
  return (
    (deadlineDateTime ? `${format(texts.deadlineUntil, { date: deadlineDateTime })} · ` : '') +
    format(texts.solvedOf, { solved: homework.solvedCount, total: homework.totalNumbers })
  );
}

// ───────────────────────────── AI check (H2.b) ─────────────────────────────

/** `PENDING` / `CHECKING` — the check (or a lesson submission) is still in the queue or with the model. */
export function isCheckRunning(status: SolutionCheckStatus | null | undefined): boolean {
  return status === 'PENDING' || status === 'CHECKING';
}

export type VerdictCounts = { correct: number; incorrect: number; uncertain: number };

export function countVerdicts(results: readonly { verdict: SolutionVerdict }[]): VerdictCounts {
  const counts: VerdictCounts = { correct: 0, incorrect: 0, uncertain: 0 };
  for (const result of results) {
    if (result.verdict === 'CORRECT') counts.correct += 1;
    else if (result.verdict === 'INCORRECT') counts.incorrect += 1;
    else counts.uncertain += 1;
  }
  return counts;
}

/**
 * The site's `shortenRecognizedAnswer`: a long list of answers keeps its first two and its last part, any
 * other long text is cut at 137 characters. The full text stays available to the caller.
 */
export function shortenRecognizedAnswer(answer: string): string {
  const parts = answer
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length >= 5 && answer.length > 80) return `${parts[0]}; ${parts[1]}; …; ${parts[parts.length - 1]}`;
  if (answer.length > 140) return `${answer.slice(0, 137).trimEnd()}…`;
  return answer;
}

/** The answer line of a result row, or null when there is nothing to show (UNCERTAIN, empty answer). */
export function recognizedAnswerOf(result: Pick<StudentCheckResultDto, 'verdict' | 'recognizedAnswer'>): string | null {
  if (result.verdict === 'UNCERTAIN') return null;
  const answer = result.recognizedAnswer?.trim();
  return answer ? answer : null;
}

// ───────────────────────────── polling (03 §5.2, A.6 rule 1) ─────────────────────────────

export type PollingRule = { baseMs: number; maxBackoffFactor: number; maxConsecutiveFailures: number };

/** Delay before the next poll: `base · min(2^failures, maxFactor)` — 4 s, then 8, 16, 32, 32 after failures. */
export function nextPollDelay(failures: number, rule: PollingRule): number {
  return rule.baseMs * Math.min(2 ** Math.max(0, failures), rule.maxBackoffFactor);
}

/** After this many consecutive failed polls the screen gives up and says so. */
export function isPollBroken(failures: number, rule: PollingRule): boolean {
  return failures >= rule.maxConsecutiveFailures;
}

// ───────────────────────────── homework detail cache (A.6 rule 3) ─────────────────────────────

function percentOf(done: number, total: number): number {
  return total ? Math.round((done / total) * 100) : 0;
}

/** Photos were stored: append them to the current batch. */
export function applyUploadedPhotos(
  detail: GetHomeworkResponse,
  created: readonly AttachedPhoto[],
  photosCount: number,
): GetHomeworkResponse {
  const known = new Set(detail.assignment.photos.map((photo) => photo.id));
  const photos = [...detail.assignment.photos, ...created.filter((photo) => !known.has(photo.id))];
  return { ...detail, assignment: { ...detail.assignment, photos, photosCount } };
}

/** A photo was deleted: drop it from the current batch. */
export function applyDeletedPhoto(detail: GetHomeworkResponse, photoId: string, photosCount: number): GetHomeworkResponse {
  const photos = detail.assignment.photos.filter((photo) => photo.id !== photoId);
  return { ...detail, assignment: { ...detail.assignment, photos, photosCount } };
}

/** A check was started: it becomes the latest one (status `PENDING`). */
export function applyStartedCheck(detail: GetHomeworkResponse, check: StudentCheckDto): GetHomeworkResponse {
  return { ...detail, assignment: { ...detail.assignment, latestCheck: check, latestCheckStatus: check.status } };
}

/**
 * A poll answered: the latest check, the batch after a possible detach, the number statuses and the solved
 * counter replace what the detail holds — no second request is needed when the check completes.
 */
export function applyLatestCheck(detail: GetHomeworkResponse, latest: LatestHomeworkCheckResponse): GetHomeworkResponse {
  const statuses = new Map<string, HomeworkNumberStatus | null>(
    latest.numbers.map((number) => [number.homeworkNumberId, number.status]),
  );
  const numbers = detail.assignment.numbers.map((number) =>
    statuses.has(number.homeworkNumberId) ? { ...number, status: statuses.get(number.homeworkNumberId) ?? null } : number,
  );
  return {
    ...detail,
    assignment: {
      ...detail.assignment,
      latestCheck: latest.check,
      latestCheckStatus: latest.check?.status ?? null,
      photos: latest.photos,
      photosCount: latest.photos.length,
      numbers,
      solvedCount: latest.solvedCount,
      solvedPercent: percentOf(latest.solvedCount, detail.assignment.totalNumbers),
    },
  };
}

// ───────────────────────────── live lesson (L2) ─────────────────────────────

export type LessonParts = {
  main: LessonItemDto[];
  extra: LessonItemDto[];
  closedMain: number;
  /** Main items still open — the count of the "N more" hint on the locked extra part. */
  remainingMain: number;
  /** `isExtraPartUnlocked`: no main items, or every main item is closed. */
  extraUnlocked: boolean;
};

export function lessonParts(items: readonly LessonItemDto[]): LessonParts {
  const sorted = [...items].sort((left, right) => left.order - right.order);
  const main = sorted.filter((item) => !item.isExtra);
  const extra = sorted.filter((item) => item.isExtra);
  const closedMain = main.filter((item) => item.closed).length;
  return { main, extra, closedMain, remainingMain: main.length - closedMain, extraUnlocked: closedMain === main.length };
}

export type LessonRow =
  | { kind: 'section'; key: string; part: 'main' | 'extra' }
  /** `index` — 1-based position inside its part (the extra part starts from 1 again). */
  | { kind: 'item'; key: string; item: LessonItemDto; index: number }
  /** The teacher has not put the set together yet. */
  | { kind: 'noItems'; key: 'no-items' }
  /** The extra part while the main part is not closed: statements are not shown. */
  | { kind: 'extraLocked'; key: 'extra-locked'; remaining: number };

/** Rows of the live lesson (03 §1 L2): «Основная часть», then «Дополнительная часть» when it exists. */
export function buildLessonRows(parts: LessonParts): LessonRow[] {
  const rows: LessonRow[] = [{ kind: 'section', key: 'section-main', part: 'main' }];
  if (parts.main.length === 0) rows.push({ kind: 'noItems', key: 'no-items' });
  parts.main.forEach((item, position) => rows.push({ kind: 'item', key: item.id, item, index: position + 1 }));
  if (parts.extra.length > 0) {
    rows.push({ kind: 'section', key: 'section-extra', part: 'extra' });
    if (parts.extraUnlocked) {
      parts.extra.forEach((item, position) => rows.push({ kind: 'item', key: item.id, item, index: position + 1 }));
    } else {
      rows.push({ kind: 'extraLocked', key: 'extra-locked', remaining: parts.remainingMain });
    }
  }
  return rows;
}

export type LessonItemChip =
  | { kind: 'result'; result: LessonItemResult }
  | { kind: 'verdict'; verdict: SolutionVerdict }
  | null;

/** The result chip wins; without a result the verdict of a finished latest submission is shown. */
export function lessonItemChip(item: Pick<LessonItemDto, 'result' | 'submission'>): LessonItemChip {
  if (item.result) return { kind: 'result', result: item.result };
  const submission = item.submission;
  if (submission && submission.status === 'DONE' && submission.verdict) return { kind: 'verdict', verdict: submission.verdict };
  return null;
}

export function hasRunningSubmission(items: readonly Pick<LessonItemDto, 'submission'>[]): boolean {
  return items.some((item) => isCheckRunning(item.submission?.status));
}

function sameSubmission(left: LessonSubmissionDto | null, right: LessonSubmissionDto | null): boolean {
  if (left === null || right === null) return left === right;
  return (
    left.id === right.id &&
    left.status === right.status &&
    left.verdict === right.verdict &&
    left.comment === right.comment &&
    left.errorCode === right.errorCode &&
    left.checkedAt === right.checkedAt
  );
}

/**
 * Merges a `/state` poll into the lesson. `resultChanged` — an item result differs (lesson results are
 * mirrored into number statuses, so homework queries become stale); `changed` — anything differs at all.
 */
export function applyLessonState(
  lesson: GetLessonResponse,
  state: LessonStateResponse,
): { next: GetLessonResponse; changed: boolean; resultChanged: boolean } {
  if (!lesson.active) return { next: lesson, changed: false, resultChanged: false };
  const byId = new Map(state.items.map((item) => [item.id, item]));
  let changed = false;
  let resultChanged = false;
  const items = lesson.active.items.map((item) => {
    const fresh = byId.get(item.id);
    if (!fresh) return item;
    const same =
      fresh.result === item.result &&
      fresh.closed === item.closed &&
      fresh.canSubmit === item.canSubmit &&
      sameSubmission(fresh.submission, item.submission);
    if (same) return item;
    changed = true;
    if (fresh.result !== item.result) resultChanged = true;
    return { ...item, result: fresh.result, submission: fresh.submission, closed: fresh.closed, canSubmit: fresh.canSubmit };
  });
  if (!changed) return { next: lesson, changed: false, resultChanged: false };
  return { next: { ...lesson, active: { ...lesson.active, items } }, changed, resultChanged };
}

/** A submission was accepted for checking: the item shows "checking" and cannot be submitted again. */
export function applySubmission(lesson: GetLessonResponse, submission: LessonSubmissionDto): GetLessonResponse {
  if (!lesson.active) return lesson;
  const items = lesson.active.items.map((item) =>
    item.id === submission.itemId ? { ...item, submission, canSubmit: false } : item,
  );
  return { ...lesson, active: { ...lesson.active, items } };
}

// ───────────────────────────── lesson timers (03 §5.3) ─────────────────────────────
// The server clock itself (`serverClockOffset`) lives in `@/domain/server-clock`.

/** Grace added to the lesson's start and end moments before the screen re-reads the lesson (the site's 1000 ms). */
export const LESSON_EDGE_GRACE_MS = 1000;

/** `setTimeout` cannot wait longer than this. */
export const MAX_TIMER_DELAY_MS = 2 ** 31 - 1;

/**
 * Milliseconds until the screen must re-read the lesson because `moment` (its start or its scheduled end)
 * has passed on the server clock; 0 when it already has. null — the date is unusable or too far for a timer.
 */
export function delayUntilLessonEdge(moment: string, serverNowMs: number): number | null {
  const at = Date.parse(moment);
  if (!Number.isFinite(at) || !Number.isFinite(serverNowMs)) return null;
  const delay = Math.max(0, at + LESSON_EDGE_GRACE_MS - serverNowMs);
  return delay <= MAX_TIMER_DELAY_MS ? delay : null;
}

/** Whole seconds until `moment` on the server clock, never negative. */
export function secondsUntil(moment: string, serverNowMs: number): number {
  const at = Date.parse(moment);
  if (!Number.isFinite(at)) return 0;
  return Math.max(0, Math.ceil((at - serverNowMs) / 1000));
}

// ───────────────────────────── runtime switches ─────────────────────────────

/**
 * How often a focused screen re-reads its data while the server reports the AI check as switched off
 * (`aiCheckAvailable` / `lessonCheckAvailable` false). The control is disabled up front on that flag, so
 * without a re-read it would stay dead after the switch is turned back on.
 * SPEC-GAP: the spec gives the flags but no refresh rule; the site re-reads its lesson page every 30 s
 * around the start (`LESSON_START_CHECK_INTERVAL_MS`), the same interval is used here.
 */
export const UNAVAILABLE_RECHECK_MS = 30_000;

// ───────────────────────────── note autosave (H2.c) ─────────────────────────────

/**
 * What to do with the note of a re-read detail while the card's field is at rest:
 * - `confirmed` — the server holds what this card saved last (only trimmed): nothing to change;
 * - `adopt` — the note was changed somewhere else (another device, the number screen): show it;
 * - `keep` — the field holds something newer than the server: an unsaved edit, a draft waiting for a
 *   connection, or the server's note is an echo of this card's own EARLIER save (a re-read that started
 *   before the latest save).
 * The field is never rewritten with the same text in trimmed form — that would eat the trailing space or
 * line break the student has just typed (the site's textarea is not touched after mount either).
 */
export function decideServerNote(input: {
  serverNote: string;
  /** What the field shows. */
  text: string;
  /** The last note this card saved or handed to the offline queue (trimmed). */
  baseline: string;
  hasPendingWrite: boolean;
  /** Notes this card saved before `baseline`. */
  superseded: readonly string[];
}): 'confirmed' | 'adopt' | 'keep' {
  const incoming = input.serverNote.trim();
  if (incoming === input.baseline) return 'confirmed';
  if (input.hasPendingWrite || input.text.trim() !== input.baseline || input.superseded.includes(incoming)) return 'keep';
  return 'adopt';
}

// ───────────────────────────── photos ─────────────────────────────

/** Free slots of a batch: `max − attached − being uploaded`, never negative. */
export function freePhotoSlots(max: number, attached: number, uploading = 0): number {
  return Math.max(0, max - attached - uploading);
}
