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

const STATUS_ORDER: readonly HomeworkNumberStatus[] = ['GREEN', 'YELLOW', 'RED'];

/**
 * The traffic-light chips of a list card as spoken text, one piece per status in the site's order
 * (green, yellow, red, then the unmarked ones): «Нужна помощь преподавателя: № 118».
 *
 * WHY: the card is one pressable element for screen readers (iOS hides its descendants), so the colours a
 * sighted student reads off the chips have to be in its name; grouping keeps a long homework short to hear.
 */
export function homeworkNumbersA11yParts(
  numbers: readonly { number: string; status: HomeworkNumberStatus | null }[],
  texts: { group: string; numberLabel: string; unmarked: string; statuses: Record<HomeworkNumberStatus, string> },
): string[] {
  const groups: { label: string; status: HomeworkNumberStatus | null }[] = [
    ...STATUS_ORDER.map((status) => ({ label: texts.statuses[status], status })),
    { label: texts.unmarked, status: null },
  ];
  const parts: string[] = [];
  for (const group of groups) {
    const members = numbers.filter((number) => (number.status ?? null) === group.status);
    if (members.length === 0) continue;
    const list = members.map((number) => format(texts.numberLabel, { number: number.number })).join(', ');
    parts.push(format(texts.group, { status: group.label, numbers: list }));
  }
  return parts;
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

function isoMs(value: string | null | undefined): number {
  const ms = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(ms) ? ms : Number.NaN;
}

/**
 * A poll answered: only the check itself is taken from it (the site's poll keeps nothing else either,
 * `components/student-homework-check.tsx`). The batch, the number statuses and the counters stay as the
 * detail has them — the poll may have been read on the server before a photo was uploaded or deleted
 * here, and copying its batch would undo that. When the check ends the caller re-reads the detail, as the
 * site's `router.refresh()` does.
 *
 * An answer about an OLDER check than the cached one (another id, created earlier), or one that takes the
 * same check back from DONE / FAILED to running, left before what the screen already shows: it is ignored.
 */
export function applyLatestCheck(detail: GetHomeworkResponse, latest: LatestHomeworkCheckResponse): GetHomeworkResponse {
  const cached = detail.assignment.latestCheck;
  const fresh = latest.check;
  if (cached && fresh) {
    if (fresh.id !== cached.id && isoMs(fresh.createdAt) < isoMs(cached.createdAt)) return detail;
    if (fresh.id === cached.id && !isCheckRunning(cached.status) && isCheckRunning(fresh.status)) return detail;
    // Nothing new (a check's results are written once, together with `checkedAt`).
    if (fresh.id === cached.id && fresh.status === cached.status && fresh.checkedAt === cached.checkedAt) return detail;
  }
  if (!cached && !fresh) return detail;
  return {
    ...detail,
    assignment: { ...detail.assignment, latestCheck: fresh, latestCheckStatus: fresh?.status ?? null },
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
 * The fresh submission of an item was read on the server BEFORE the one the screen already shows: a /state
 * answer that left before this device sent a new photo (or before a newer read landed). Submissions of
 * one item only move forward — a later `submittedAt`, or the same submission from running to finished.
 */
export function isOlderSubmission(fresh: LessonSubmissionDto | null, cached: LessonSubmissionDto | null): boolean {
  if (!cached) return false;
  if (!fresh) return true;
  if (fresh.id !== cached.id) return isoMs(fresh.submittedAt) < isoMs(cached.submittedAt);
  return !isCheckRunning(cached.status) && isCheckRunning(fresh.status);
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
    const found = byId.get(item.id);
    if (!found) return item;
    let fresh = found;
    if (isOlderSubmission(found.submission, item.submission)) {
      // A stale answer must not bring the previous submission back (and with it an enabled «Пересдать»):
      // the item keeps its submission and the flags that go with it, so the poll keeps following it.
      // A result the teacher set meanwhile still comes through, and closes the item with it.
      const resultMoved = found.result !== item.result;
      const closed = resultMoved ? found.closed : item.closed;
      fresh = { ...found, submission: item.submission, closed, canSubmit: closed ? false : item.canSubmit };
    }
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

/**
 * Which items' checks ended since the last call. `running` maps an item id to the submission seen
 * `PENDING` / `CHECKING` on this screen; an item whose submission is finished now (DONE / FAILED) and was
 * seen running is reported once. A submission that was already finished when the screen opened is not
 * reported — only a change the student is waiting for.
 */
export function trackLessonOutcomes(
  running: ReadonlyMap<string, string>,
  items: readonly Pick<LessonItemDto, 'id' | 'submission'>[],
): { running: Map<string, string>; finished: string[] } {
  const next = new Map<string, string>();
  const finished: string[] = [];
  for (const item of items) {
    const submission = item.submission;
    if (submission && isCheckRunning(submission.status)) next.set(item.id, submission.id);
    else if (submission && running.has(item.id)) finished.push(item.id);
  }
  return { running: next, finished };
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

// ───────────────────────────── photos ─────────────────────────────

/** Free slots of a batch: `max − attached − being uploaded`, never negative. */
export function freePhotoSlots(max: number, attached: number, uploading = 0): number {
  return Math.max(0, max - attached - uploading);
}
