// Pure rules of the AI-plan state of a participant, shared by the lesson board and the homework-draft
// board (docs/spec/05-teacher-lessons-plans.md §4.2, §5.2, §5.3). No React, no RN imports — unit-tested
// in tests/planner-plan-state.test.ts.
import { LIMITS } from '@/api/types/limits';

/** The fields of a participant the plan state depends on (lesson and draft participants both have them). */
export type PlanParticipantLike = {
  id: string;
  planGeneratedAt: string | null;
  planError: string | null;
  createdAt: string;
  /** Homework drafts only: an issued participant is frozen and never "pending". */
  issuedAssignmentId?: string | null;
};

export type PlanState = {
  /** Generation is running: no plan, no error, not issued — and the job is not older than 15 minutes. */
  pending: boolean;
  /** Same condition, but the job has been "running" for more than 15 minutes: it was lost — offer Retry. */
  stale: boolean;
  /** `planError` is set. A failed participant keeps whatever items it had. */
  failed: boolean;
};

function epoch(value: string | null | undefined): number {
  if (!value) return Number.NaN;
  return Date.parse(value);
}

/**
 * When the running generation was requested: the participant's `createdAt`, or the `planRequestedAt` of
 * the latest accepted "Retry" when the app knows it. The server never moves `createdAt` on a retry
 * (05 §7 item 5), so without the second value a retried participant of an old lesson would look stale
 * while its plan is being built.
 */
export function planAnchorMs(participant: Pick<PlanParticipantLike, 'createdAt'>, planRequestedAt?: string | null): number {
  const created = epoch(participant.createdAt);
  const requested = epoch(planRequestedAt);
  if (Number.isNaN(requested)) return created;
  if (Number.isNaN(created)) return requested;
  return Math.max(created, requested);
}

/** `now` — the ticking clock of the board (30 s), in epoch ms. */
export function planStateOf(participant: PlanParticipantLike, now: number, planRequestedAt?: string | null): PlanState {
  const failed = participant.planError !== null;
  const waiting = participant.planGeneratedAt === null && !failed && !participant.issuedAssignmentId;
  if (!waiting) return { pending: false, stale: false, failed };
  const anchor = planAnchorMs(participant, planRequestedAt);
  const stale = !Number.isNaN(anchor) && now - anchor > LIMITS.stalePlanMs;
  return { pending: !stale, stale, failed: false };
}

/** Participants whose plan exists (`planGeneratedAt`) — the "ready" of «Готово {ready} из {total}…». */
export function countReady(participants: readonly Pick<PlanParticipantLike, 'planGeneratedAt'>[]): number {
  return participants.filter((participant) => participant.planGeneratedAt !== null).length;
}

/**
 * Signature of the generation progress: what the status poll compares to decide whether the board has
 * to be read again (05 §5.2). The draft board also includes the issue stamp.
 */
export function planSignature(
  rows: readonly { id: string; planGeneratedAt: string | null; planError: string | null; issuedAssignmentId?: string | null }[],
  withIssue = false,
): string {
  return [...rows]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((row) => {
      const base = `${row.id}:${row.planGeneratedAt ?? ''}:${row.planError ?? ''}`;
      return withIssue ? `${base}:${row.issuedAssignmentId ?? ''}` : base;
    })
    .join('|');
}

/**
 * Whether the plan progress of a board has moved since the signature seen before: the moment the screens
 * that show it without polling (lessons and drafts lists, student card, group pages) must be refreshed.
 * The first signature (`previous === null`, the board just loaded) only initialises the comparison.
 */
export function planProgressMoved(previous: string | null, next: string | null): boolean {
  return previous !== null && next !== null && previous !== next;
}

/** Rows of a status payload (`participantId`) as signature rows. */
export function statusSignatureRows<T extends { participantId: string; planGeneratedAt: string | null; planError: string | null }>(
  rows: readonly T[],
): (T & { id: string })[] {
  return rows.map((row) => ({ ...row, id: row.participantId }));
}

/**
 * Status rows of the participants the board shows, as signature rows. The status endpoint also lists a
 * participant whose student moved to another teacher; the board hides it (05 §0.4), so it must not take
 * part in the comparison (it would look like a change on every tick).
 */
export function statusRowsOnBoard<T extends { participantId: string; planGeneratedAt: string | null; planError: string | null }>(
  rows: readonly T[],
  boardParticipantIds: readonly string[],
): (T & { id: string })[] {
  const shown = new Set(boardParticipantIds);
  return statusSignatureRows(rows.filter((row) => shown.has(row.participantId)));
}
