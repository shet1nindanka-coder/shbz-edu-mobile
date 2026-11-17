import { useCallback } from 'react';

import { retryAfterOf } from '@/api/errors';

import { useDurationLock } from './use-wait-clock';

export type RetryWait = {
  /** Seconds until the refused action may be tried again; 0 when nothing is cooling down. */
  seconds: number;
  waiting: boolean;
  /** Feed every mutation error here: one that carries `retryAfterSeconds` starts the countdown. */
  note: (error: unknown) => void;
};

/**
 * Keeps a control disabled for `retryAfterSeconds` after a refusal that names a wait — `429 rateLimited`
 * as well as `503 serviceUnavailable` / `queueFull` / `reportsBusy` (90-addendum-1 A.3 rules 3 and 4): a
 * mutation is never retried on the user's behalf, the screen only says when it will work again. One
 * instance per rate-limit bucket (e.g. "create + regenerate" share `api:lesson-plan`).
 *
 *   const wait = useRetryWait();
 *   const save = useMutation({ …, onError: wait.note });
 *   <Button disabled={wait.waiting} … />
 *   <RetryWaitLine wait={wait} />   // next to the button, never inside the dismissible error notice
 *
 * Keep the hook where it outlives what the user can close: in the screen that owns a sheet, not in the
 * sheet, so reopening it still shows the lock and its line.
 */
export function useRetryWait(): RetryWait {
  // A duration, not a deadline on the device clock: setting the clock back must not lengthen the wait.
  const lock = useDurationLock();
  const { start } = lock;
  const note = useCallback(
    (error: unknown) => {
      const wait = retryAfterOf(error);
      if (wait > 0) start(wait);
    },
    [start],
  );
  return { seconds: lock.seconds, waiting: lock.locked, note };
}
