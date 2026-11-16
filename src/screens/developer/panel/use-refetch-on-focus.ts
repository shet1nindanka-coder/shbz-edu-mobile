import { useEffect, useRef } from 'react';

import { useScreenFocused } from '@/navigation';

/**
 * Refetches when the screen comes back into focus (00 §2.3: the dev panel and the journal have no realtime
 * event — "refetch on focus / pull-to-refresh"). The site renders both pages fresh on every visit, so the
 * refetch does not wait for the data to go stale. A tab scene stays mounted while another tab is open:
 * mounting alone never triggers it.
 */
export function useRefetchOnFocus(refetch: () => unknown): void {
  const focused = useScreenFocused();
  const wasFocused = useRef(focused);
  const latest = useRef(refetch);

  useEffect(() => {
    latest.current = refetch;
  });

  useEffect(() => {
    const returned = focused && !wasFocused.current;
    wasFocused.current = focused;
    if (returned) void latest.current();
  }, [focused]);
}
