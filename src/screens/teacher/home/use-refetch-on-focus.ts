import { useEffect, useRef } from 'react';

import { useScreenFocused } from '@/navigation';

/** The part of a query result this hook needs. */
type FocusQuery = { isStale: boolean; refetch: () => unknown };

/**
 * Refetches stale queries when the screen comes back into focus (00 §2.3: staff lists and cards — realtime
 * first, "refetch on focus" as the fallback). A tab scene stays mounted while another tab is open, so
 * mounting alone never triggers it; fresh data (younger than the stale time) is left alone.
 */
export function useRefetchOnFocus(queries: readonly FocusQuery[]): void {
  const focused = useScreenFocused();
  const wasFocused = useRef(focused);
  const latest = useRef(queries);

  useEffect(() => {
    latest.current = queries;
  });

  useEffect(() => {
    const returned = focused && !wasFocused.current;
    wasFocused.current = focused;
    if (!returned) return;
    for (const query of latest.current) {
      if (query.isStale) void query.refetch();
    }
  }, [focused]);
}
