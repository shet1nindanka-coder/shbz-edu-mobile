import { useCallback, useState } from 'react';

import { isRateLimited } from '@/api';
import { useCountdown } from '@/screens/shell';

export type RateLimitWait = {
  /** Seconds until the limited action may be tried again; 0 when nothing is limited. */
  seconds: number;
  waiting: boolean;
  /** Feed every mutation error here: a `429 rateLimited` starts the countdown. */
  note: (error: unknown) => void;
};

/**
 * Keeps a control disabled for `retryAfterSeconds` after a `429 rateLimited` (90-addendum-1 A.3 rule 3:
 * never auto-retry a mutation, never let the user hammer a closed window). One instance per bucket.
 */
export function useRateLimit(): RateLimitWait {
  const [until, setUntil] = useState<number | null>(null);
  const seconds = useCountdown(until);
  const note = useCallback((error: unknown) => {
    if (isRateLimited(error)) setUntil(Date.now() + error.retryAfterSeconds * 1000);
  }, []);
  return { seconds, waiting: seconds > 0, note };
}
