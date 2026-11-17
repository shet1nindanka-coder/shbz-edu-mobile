import { retryAfterOf } from '@/api';
import { useDurationLock } from '@/components/retry-wait';

/**
 * Keeps a control locked for the `retryAfterSeconds` of a refused call (90-addendum-1 A.3 rule 3).
 * `lockFor(error)` after a failure; `seconds` counts down to 0 and the control unlocks by itself.
 * The wait is a duration (`useDurationLock`), not a device-clock deadline: setting the clock back cannot
 * lengthen it, and the time the app spent in the background counts.
 */
export function useRetryLock(): { seconds: number; lockFor: (error: unknown) => void } {
  const lock = useDurationLock();
  return {
    seconds: lock.seconds,
    lockFor: (error) => {
      const wait = retryAfterOf(error);
      // A refusal without a wait (or a later success path calling this) ends the previous lock, as before.
      if (wait > 0) lock.start(wait);
      else lock.clear();
    },
  };
}
