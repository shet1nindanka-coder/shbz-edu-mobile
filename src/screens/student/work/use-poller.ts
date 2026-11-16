import { useCallback, useEffect, useRef, useState } from 'react';

import { POLLING } from '@/api';

import { isPollBroken, nextPollDelay } from './logic';

export type PollerOptions = {
  /** Something is `PENDING` / `CHECKING` and the screen is live. */
  active: boolean;
  /** One request. A rejection counts as a failed poll. */
  poll: () => Promise<void>;
  /** Changes with every new start / submit: the failure counter and the "broken" state start over. */
  resetKey: string | number | null;
};

/**
 * The site's polling loop (03 §5.2, 90-addendum-5 A.6 rule 1): first request 4 s after something started
 * running, then `4 s · min(2^failures, 8)`; after 5 consecutive failures it stops and reports `broken`.
 * Timers are cleared when `active` drops (unmount, blur, background); a screen that comes back while
 * something is still running resumes by itself.
 */
export function usePoller({ active, poll, resetKey }: PollerOptions): { broken: boolean; retry: () => void } {
  const [broken, setBroken] = useState(false);
  const [seenKey, setSeenKey] = useState(resetKey);
  if (seenKey !== resetKey) {
    // A new check / submission: forget the failures of the previous one.
    setSeenKey(resetKey);
    setBroken(false);
  }

  const pollRef = useRef(poll);
  useEffect(() => {
    pollRef.current = poll;
  });

  useEffect(() => {
    if (!active || broken) return;
    let cancelled = false;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const schedule = () => {
      timer = setTimeout(() => {
        pollRef.current().then(
          () => {
            failures = 0;
            if (!cancelled) schedule();
          },
          () => {
            failures += 1;
            if (cancelled) return;
            if (isPollBroken(failures, POLLING.studentCheck)) setBroken(true);
            else schedule();
          },
        );
      }, nextPollDelay(failures, POLLING.studentCheck));
    };
    schedule();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [active, broken, resetKey]);

  const retry = useCallback(() => setBroken(false), []);
  return { broken, retry };
}
