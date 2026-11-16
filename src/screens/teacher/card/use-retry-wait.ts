import { useCallback, useState } from 'react';

import { isApiError } from '@/api';
import { useCountdown } from '@/screens/shell';

export type RetryWait = {
  /** Seconds until the refused action may be tried again; 0 when nothing is cooling down. */
  seconds: number;
  waiting: boolean;
  /** Feed every mutation error here: one that names a wait (`retryAfterSeconds`) starts the countdown. */
  note: (error: unknown) => void;
};

/** Seconds the server asked to wait (`429 rateLimited`, `503 serviceUnavailable`, `503 reportsBusy`); 0 when it named none. */
export function retryAfterOf(error: unknown): number {
  return isApiError(error) && typeof error.retryAfterSeconds === 'number' && error.retryAfterSeconds > 0 ? error.retryAfterSeconds : 0;
}

/**
 * Keeps a control disabled for `retryAfterSeconds` after a refusal that names a wait (90-addendum-1 A.3
 * rules 3 and 4): a mutation is never retried on the user's behalf, the screen only says when it will
 * work again. One instance per rate-limit bucket.
 */
export function useRetryWait(): RetryWait {
  const [until, setUntil] = useState<number | null>(null);
  const seconds = useCountdown(until);
  const note = useCallback((error: unknown) => {
    const wait = retryAfterOf(error);
    if (wait > 0) setUntil(Date.now() + wait * 1000);
  }, []);
  return { seconds, waiting: seconds > 0, note };
}
