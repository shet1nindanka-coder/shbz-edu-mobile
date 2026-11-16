// Pure rules of the "Homework review" segment of the student card (docs/spec/04-teacher-students.md S4,
// §2.3 "Derived on the client", §4.3). No React, no RN imports — unit-tested in
// tests/teacher-card-review.test.ts.
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

export function chunkChanges<T>(changes: readonly T[], size = STATUS_BATCH_MAX): T[][] {
  const chunks: T[][] = [];
  for (let start = 0; start < changes.length; start += size) chunks.push(changes.slice(start, start + size));
  return chunks;
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
 * Where each homework card sits while the screen is open. The server sorts by attention and a completed
 * homework belongs under "Completed"; re-sorting after every mark would move the card the teacher is
 * marking from under the finger, so the placement is taken once per `token` (first load, pull-to-refresh)
 * and only extended for homework that appears later.
 */
export type ReviewPlacement = { token: number; order: readonly string[]; completedIds: readonly string[] };

export const EMPTY_PLACEMENT: ReviewPlacement = { token: -1, order: [], completedIds: [] };

export function reconcilePlacement(
  previous: ReviewPlacement,
  assignments: readonly Pick<TeacherHomeworkAssignment, 'id' | 'totalNumbers' | 'solvedCount'>[],
  token: number,
): ReviewPlacement {
  const fresh = previous.token !== token;
  const known = new Set(fresh ? [] : previous.order);
  const present = new Set(assignments.map((assignment) => assignment.id));
  const kept = fresh ? [] : previous.order.filter((id) => present.has(id));
  const keptCompleted = fresh ? [] : previous.completedIds.filter((id) => present.has(id));
  const added = assignments.filter((assignment) => !known.has(assignment.id));
  const unchanged = !fresh && added.length === 0 && kept.length === previous.order.length;
  if (unchanged) return previous;
  return {
    token,
    order: [...kept, ...added.map((assignment) => assignment.id)],
    completedIds: [...keptCompleted, ...added.filter(isAssignmentCompleted).map((assignment) => assignment.id)],
  };
}

export type ReviewRow =
  | { kind: 'assignment'; key: string; assignment: TeacherHomeworkAssignment }
  | { kind: 'completedToggle'; key: string; count: number; open: boolean };

/** Rows of the list: active homework, then the "Completed (n)" disclosure and, when open, its cards. */
export function buildReviewRows(
  assignments: readonly TeacherHomeworkAssignment[],
  placement: ReviewPlacement,
  completedOpen: boolean,
): ReviewRow[] {
  const byId = new Map(assignments.map((assignment) => [assignment.id, assignment]));
  const completedIds = new Set(placement.completedIds);
  const active: ReviewRow[] = [];
  const completed: ReviewRow[] = [];
  for (const id of placement.order) {
    const assignment = byId.get(id);
    if (!assignment) continue;
    (completedIds.has(id) ? completed : active).push({ kind: 'assignment', key: id, assignment });
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
