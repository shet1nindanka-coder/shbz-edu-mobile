import { useState } from 'react';

import { retryAfterOf } from '@/api';
import { useCountdown } from '@/components/retry-wait';






/**
 * Keeps a control locked for the `retryAfterSeconds` of a refused call (90-addendum-1 A.3 rule 3).
 * `lockFor(error)` after a failure; `seconds` counts down to 0 and the control unlocks by itself.
 */
export function useRetryLock(): { seconds: number; lockFor: (error: unknown) => void } {
  const [until, setUntil] = useState<number | null>(null);
  const seconds = useCountdown(until);
  return {
    seconds,
    lockFor: (error) => {
      const wait = retryAfterOf(error);
      setUntil(wait > 0 ? Date.now() + wait * 1000 : null);
    },
  };
}
