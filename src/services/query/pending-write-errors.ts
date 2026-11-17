// How the app's pending-writes queue classifies a failed send (the queue itself takes these as options, so it
// stays pure). Kept apart from `@/providers` so the rules are unit-tested exactly as the app uses them.
import { hasErrorCode, isApiError, isNetworkError, isNotFoundError, isRateLimited } from '@/api/errors';

import type { PendingWriteRefusalInfo } from './pending-writes';

/**
 * A failure the queue waits out and re-sends by itself (backoff): no answer at all, or `503 serviceUnavailable`
 * — transient by contract (90-addendum-1 A.3 rule 4, «Попробуйте снова позже»). Parked as a refusal it would
 * never be sent again unless the student reopened that number. Other 5xx codes are refusals the student
 * retries by hand (rule 5); `queueFull` / `reportsBusy` never reach a note.
 */
export function isPendingWriteRetryable(error: unknown): boolean {
  return isNetworkError(error) || hasErrorCode(error, 'serviceUnavailable');
}

/** A refusal is kept with the draft for the editor to show, unless the target is gone (nothing will show it). */
export function keepPendingWriteRefusal(error: unknown): PendingWriteRefusalInfo | null {
  if (isNotFoundError(error)) return null;
  // Only a rate limit holds the next attempt back (the editor's own rule).
  return isApiError(error)
    ? { code: error.code, message: error.message || null, retryAfterSeconds: isRateLimited(error) ? error.retryAfterSeconds : null }
    : { code: null, message: null, retryAfterSeconds: null };
}

/** Writes that still wait to be sent, and those the server refused (they wait for the user, not for the queue). */
export type PendingWritesSummary = { waiting: number; refused: number };

export function summarizePendingWrites(writes: readonly { userId: string; refusal?: unknown }[], userId: string | null): PendingWritesSummary {
  let waiting = 0;
  let refused = 0;
  for (const write of writes) {
    if (write.userId !== userId) continue;
    if (write.refusal) refused += 1;
    else waiting += 1;
  }
  return { waiting, refused };
}
