// Pure rules of the "Homework review" segment of the student card (docs/spec/04-teacher-students.md S4,
// §2.3 "Derived on the client", §4.3). No React, no RN imports — unit-tested in
// tests/teacher-card.test.ts.
import type {
  HomeworkNumberStatus,
  SolutionVerdict,
  TeacherHomeworkAssignment,
  TeacherHomeworkCheck,
  TeacherHomeworkCheckResult,
  TeacherStudentHomeworks,
} from '@/api/types';
import { getStatusForAiVerdict } from '@/domain/solution-check-status';

/** How long the "AI verdicts accepted — Undo" toast stays (`ACCEPT_UNDO_MS` of the site). */
export const ACCEPT_UNDO_MS = 10_000;

/** The batch endpoint takes 1..100 changes per call (00 §1.4.4 `SetNumberStatusesRequest`). */
export const STATUS_BATCH_MAX = 100;

export type StatusChangeEntry = { homeworkNumberId: string; status: HomeworkNumberStatus | null };

/** One number whose colour "Accept AI verdicts" changes, with the colour to restore on "Undo". */
export type VerdictChange = { homeworkNumberId: string; next: HomeworkNumberStatus; previous: HomeworkNumberStatus | null };

type Counted = Pick<TeacherHomeworkAssignment, 'totalNumbers' | 'solvedCount'>;

/** Completed ⇔ the homework has numbers and every one of them is green or yellow. */
export function isAssignmentCompleted(assignment: Counted): boolean {
  return assignment.totalNumbers > 0 && assignment.solvedCount === assignment.totalNumbers;
}

export function isAssignmentOverdue(assignment: Counted & Pick<TeacherHomeworkAssignment, 'deadlineAt'>, now: number): boolean {
  if (isAssignmentCompleted(assignment) || assignment.deadlineAt === null) return false;
  const deadline = Date.parse(assignment.deadlineAt);
  return !Number.isNaN(deadline) && deadline < now;
}

export function unmarkedCount(assignment: Pick<TeacherHomeworkAssignment, 'totalNumbers' | 'markedCount'>): number {
  return Math.max(0, assignment.totalNumbers - assignment.markedCount);
}

/** The newest finished check: its verdicts are the ones the card shows and "accept" applies. */
export function latestDoneCheck(checks: readonly TeacherHomeworkCheck[]): TeacherHomeworkCheck | null {
  return checks.find((check) => check.status === 'DONE') ?? null;
}

/** "Accept AI verdicts" is offered only when the latest finished check has a definite verdict. */
export function canAcceptVerdicts(check: TeacherHomeworkCheck | null): boolean {
  return check !== null && check.results.some((result) => result.verdict !== 'UNCERTAIN');
}

export function verdictsByNumber(check: TeacherHomeworkCheck | null): Map<string, TeacherHomeworkCheckResult> {
  return new Map(check?.results.map((result) => [result.number, result]) ?? []);
}

/** Results of a check that carry the "instruction aimed at the AI" flag (the banner above the card). */
export function injectionResults(check: TeacherHomeworkCheck | null): TeacherHomeworkCheckResult[] {
  return check?.results.filter((result) => result.injectionSuspected) ?? [];
}

export function hasResultDiagnostics(result: Pick<TeacherHomeworkCheckResult, 'copySuspected' | 'injectionSuspected'>): boolean {
  return result.copySuspected || result.injectionSuspected;
}

/** The "lesson mode" switch is shown only when some check of some homework has staff-only diagnostics. */
export function hasDiagnostics(assignments: readonly Pick<TeacherHomeworkAssignment, 'checks'>[]): boolean {
  return assignments.some((assignment) => assignment.checks.some((check) => check.results.some(hasResultDiagnostics)));
}

export function countVerdicts(results: readonly Pick<TeacherHomeworkCheckResult, 'verdict'>[]): Record<SolutionVerdict, number> {
  const counts: Record<SolutionVerdict, number> = { CORRECT: 0, INCORRECT: 0, UNCERTAIN: 0 };
  for (const result of results) counts[result.verdict] += 1;
  return counts;
}

/**
 * Shortens a long recognised answer for the number card (`shortenRecognizedAnswer` of the site): a list of
 * five or more `;`-separated parts keeps the first two and the last, anything else is cut at 140 chars.
 */
export function shortenRecognizedAnswer(answer: string): string {
  const trimmed = answer.trim();
  const parts = trimmed
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length >= 5 && trimmed.length > 80) return `${parts[0]}; ${parts[1]}; …; ${parts[parts.length - 1]}`;
  if (trimmed.length > 140) return `${trimmed.slice(0, 137).trimEnd()}…`;
  return trimmed;
}

/**
 * What "Accept AI verdicts" would change in one homework (04 §4.3): for every definite verdict of the
 * latest finished check whose number is still in the homework, the colour the automatic rule gives
 * (correct after red / yellow is yellow, not green), when it differs from the current one.
 */
export function acceptVerdictChanges(
  assignment: Pick<TeacherHomeworkAssignment, 'numbers' | 'checks'>,
  effectiveStatus: (homeworkNumberId: string, serverStatus: HomeworkNumberStatus | null) => HomeworkNumberStatus | null = (_id, status) => status,
): VerdictChange[] {
  const check = latestDoneCheck(assignment.checks);
  if (!check) return [];
  const byNumber = new Map(assignment.numbers.map((number) => [number.number, number]));
  const changes: VerdictChange[] = [];
  const seen = new Set<string>();
  for (const result of check.results) {
    const target = byNumber.get(result.number);
    if (!target || result.verdict === 'UNCERTAIN' || seen.has(target.homeworkNumberId)) continue;
    const previous = effectiveStatus(target.homeworkNumberId, target.status);
    const next = getStatusForAiVerdict(result.verdict, previous);
    if (next !== null && next !== previous) {
      seen.add(target.homeworkNumberId);
      changes.push({ homeworkNumberId: target.homeworkNumberId, next, previous });
    }
  }
  return changes;
}

/**
 * The numbers of a homework that wait for the teacher — the rows under «Нужно проверить» (docs/design/
 * glass-over-paper.md §1 rule 5: many numbers never grow the screen, the rest is in «Все номера»):
 * - a number marked «нужна помощь»;
 * - a number the latest finished check could not judge («на проверке») and nobody has marked yet;
 * - a number whose definite AI verdict is not applied yet — what "Accept AI verdicts" would change.
 * In the homework's own order.
 */
export function numbersToCheck(assignment: Pick<TeacherHomeworkAssignment, 'numbers' | 'checks'>): string[] {
  const verdicts = verdictsByNumber(latestDoneCheck(assignment.checks));
  const pending = new Set(acceptVerdictChanges(assignment).map((change) => change.homeworkNumberId));
  return assignment.numbers
    .filter(
      (number) =>
        number.status === 'RED' ||
        pending.has(number.homeworkNumberId) ||
        (number.status === null && verdicts.get(number.number)?.verdict === 'UNCERTAIN'),
    )
    .map((number) => number.homeworkNumberId);
}

export function chunkChanges<T>(changes: readonly T[], size = STATUS_BATCH_MAX): T[][] {
  const chunks: T[][] = [];
  for (let start = 0; start < changes.length; start += size) chunks.push(changes.slice(start, start + size));
  return chunks;
}

/**
 * A status batch that failed part-way. The endpoint takes at most `STATUS_BATCH_MAX` changes per call, so a
 * longer batch goes out in several requests, each one a transaction of its own: when a later request fails,
 * the earlier ones are already applied. `applied` holds the server's results of those requests and
 * `appliedIds` the numbers they wrote (empty when the first request failed and nothing was applied).
 */
export class StatusBatchError extends Error {
  readonly reason: unknown;
  readonly applied: StatusChangeEntry[];
  readonly appliedIds: string[];

  constructor(reason: unknown, applied: StatusChangeEntry[], appliedIds: string[]) {
    super(reason instanceof Error ? reason.message : 'Status batch failed');
    // Keeps `instanceof` working when the class is transpiled to ES5-style constructors.
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'StatusBatchError';
    this.reason = reason;
    this.applied = applied;
    this.appliedIds = appliedIds;
  }
}

/**
 * Sends a status batch in chunks of `STATUS_BATCH_MAX`, one after another, and returns the server's results.
 * A failed chunk stops the batch and rejects with a `StatusBatchError` that says what was applied before it.
 */
export async function sendStatusChunks(
  entries: readonly StatusChangeEntry[],
  send: (chunk: StatusChangeEntry[]) => Promise<{ results: StatusChangeEntry[] }>,
  size = STATUS_BATCH_MAX,
): Promise<StatusChangeEntry[]> {
  const results: StatusChangeEntry[] = [];
  const appliedIds: string[] = [];
  for (const chunk of chunkChanges(entries, size)) {
    try {
      const response = await send(chunk);
      results.push(...response.results);
    } catch (error) {
      throw new StatusBatchError(error, results, appliedIds);
    }
    appliedIds.push(...chunk.map((entry) => entry.homeworkNumberId));
  }
  return results;
}

/** What a failed status batch left behind: the original error and the part that was applied before it. */
export function statusBatchFailure(error: unknown): { reason: unknown; applied: StatusChangeEntry[]; appliedIds: string[] } {
  if (error instanceof StatusBatchError) return { reason: error.reason, applied: error.applied, appliedIds: error.appliedIds };
  return { reason: error, applied: [], appliedIds: [] };
}

/**
 * The part of an undo that may be sent once its accept batch has settled: only the numbers the accept
 * actually wrote. After a failed accept that is nothing — writing the "previous" colours anyway would
 * record manual teacher marks the teacher never made (and refresh their protection against a check).
 */
export function undoEntriesAfterAccept(previous: readonly StatusChangeEntry[], appliedIds: ReadonlySet<string>): StatusChangeEntry[] {
  return previous.filter((entry) => appliedIds.has(entry.homeworkNumberId));
}

/**
 * Which write a number's in-flight colour and lock belong to. A number can be written by several requests
 * in a row (the accept batch, then its undo; a tap after either): only the LAST one that took the number may
 * release it, so an earlier request that settles later does not unlock the number or bring back its colour
 * while the newer write is still on its way.
 */
export type WriteOwners = Map<string, number>;

/** The write `token` takes these numbers over. */
export function claimWrites(owners: WriteOwners, ids: readonly string[], token: number): void {
  for (const id of ids) owners.set(id, token);
}

/** The write `token` has settled: returns the numbers it still owned (now released); the others were taken over. */
export function releaseWrites(owners: WriteOwners, ids: readonly string[], token: number): string[] {
  const released: string[] = [];
  for (const id of ids) {
    if (owners.get(id) !== token) continue;
    owners.delete(id);
    released.push(id);
  }
  return released;
}

function percent(done: number, total: number): number {
  return total ? Math.round((done / total) * 100) : 0;
}

/** The homework with the given colours applied to its numbers and every counter recomputed. */
export function applyStatuses(
  assignment: TeacherHomeworkAssignment,
  statuses: Readonly<Record<string, HomeworkNumberStatus | null>>,
): TeacherHomeworkAssignment {
  if (!assignment.numbers.some((number) => number.homeworkNumberId in statuses)) return assignment;
  const numbers = assignment.numbers.map((number) =>
    number.homeworkNumberId in statuses ? { ...number, status: statuses[number.homeworkNumberId] ?? null } : number,
  );
  const greenCount = numbers.filter((number) => number.status === 'GREEN').length;
  const yellowCount = numbers.filter((number) => number.status === 'YELLOW').length;
  const redCount = numbers.filter((number) => number.status === 'RED').length;
  const markedCount = greenCount + yellowCount + redCount;
  const solvedCount = greenCount + yellowCount;
  return {
    ...assignment,
    numbers,
    greenCount,
    yellowCount,
    redCount,
    markedCount,
    solvedCount,
    progressPercent: percent(markedCount, numbers.length),
    solvedPercent: percent(solvedCount, numbers.length),
  };
}

/** The cached response after a status write: a number may sit in several homeworks at once. */
export function patchHomeworkStatuses(data: TeacherStudentHomeworks, changes: readonly StatusChangeEntry[]): TeacherStudentHomeworks {
  if (changes.length === 0) return data;
  const statuses: Record<string, HomeworkNumberStatus | null> = {};
  for (const change of changes) statuses[change.homeworkNumberId] = change.status;
  let touched = false;
  const assignments = data.assignments.map((assignment) => {
    const next = applyStatuses(assignment, statuses);
    if (next !== assignment) touched = true;
    return next;
  });
  return touched ? { ...data, assignments } : data;
}

// ───────────────────────────── placement of the cards ─────────────────────────────

/**
 * Ids of the homework that belongs under "Completed". Taken from the server's answer (the query cache),
 * not from the colours of writes still in flight: a card stays where it is while its request is on the
 * way and is regrouped once the write has settled or a refetch has arrived, as the site's refresh does.
 */
export function completedAssignmentIds(
  serverAssignments: readonly Pick<TeacherHomeworkAssignment, 'id' | 'totalNumbers' | 'solvedCount'>[],
): ReadonlySet<string> {
  return new Set(serverAssignments.filter(isAssignmentCompleted).map((assignment) => assignment.id));
}

export type ReviewRow =
  | { kind: 'assignment'; key: string; assignment: TeacherHomeworkAssignment }
  | { kind: 'completedToggle'; key: string; count: number; open: boolean };

/**
 * Rows of the list in the server's attention order (04 §4.4): active homework, then the "Completed (n)"
 * disclosure and, when it is open, its cards.
 */
export function buildReviewRows(
  assignments: readonly TeacherHomeworkAssignment[],
  completedIds: ReadonlySet<string>,
  completedOpen: boolean,
): ReviewRow[] {
  const active: ReviewRow[] = [];
  const completed: ReviewRow[] = [];
  for (const assignment of assignments) {
    (completedIds.has(assignment.id) ? completed : active).push({ kind: 'assignment', key: assignment.id, assignment });
  }
  if (completed.length === 0) return active;
  return [
    ...active,
    { kind: 'completedToggle', key: 'completed-toggle', count: completed.length, open: completedOpen },
    ...(completedOpen ? completed : []),
  ];
}

export function reviewRowIndex(rows: readonly ReviewRow[], assignmentId: string): number {
  return rows.findIndex((row) => row.kind === 'assignment' && row.assignment.id === assignmentId);
}

/** Time of a check in the history: when it finished, else when it was started. */
export function checkMoment(check: Pick<TeacherHomeworkCheck, 'checkedAt' | 'createdAt'>): string {
  return check.checkedAt ?? check.createdAt;
}
