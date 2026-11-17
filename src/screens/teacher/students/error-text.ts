import { hasErrorCode, isApiError } from '@/api/errors';

/**
 * Text of a failed call: the server's localised message (a network failure is localised by the client),
 * otherwise the screen's own fallback line.
 */
export function errorText(error: unknown, fallback: string): string {
  return isApiError(error) && error.message ? error.message : fallback;
}

/**
 * `404 studentNotFound`: the student was deleted or re-assigned to another teacher while the screen was
 * open. Retrying is pointless — the caller closes its dialog, shows the message and re-reads the list
 * (90-addendum-1 A.3 rule 6).
 */
export function isStudentGone(error: unknown): boolean {
  return hasErrorCode(error, 'studentNotFound');
}

/** The part of a query result `loadFailureOf` reads. */
type LoadQuery = { isError: boolean; isPaused: boolean; error: unknown; failureReason: unknown };

/**
 * Why a read without data cannot show any: it failed, or — with no connection — its retry is parked until
 * the connection returns. TanStack Query keeps such a query `pending`, which would be an endless skeleton
 * under the offline strip. `null` while the first load is simply running.
 */
export function loadFailureOf(query: LoadQuery): { error: unknown } | null {
  if (query.isError) return { error: query.error };
  if (query.isPaused) return { error: query.failureReason };
  return null;
}
