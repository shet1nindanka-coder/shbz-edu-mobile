import { useEffect, useRef } from 'react';

import { useScreenFocused } from '@/navigation';

/** The part of a query result this hook needs. */
type FocusQuery = { isStale: boolean; refetch: () => unknown };

/**
 * Refetches stale queries when the screen comes back into focus (00 §2.3 "Channel per feature": realtime
 * first, "refetch on focus" as the fallback; 02 §5 "Mobile recommendation"). A tab scene and a screen under
 * a pushed one stay mounted, so mounting alone never triggers it. Data younger than the stale time is left
 * alone, and nothing is asked on the first mount — the query fetches by itself then. The return to the
 * foreground is handled by the realtime bridge.
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
