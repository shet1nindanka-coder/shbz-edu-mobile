import { useEffect, useRef } from 'react';

import { useScreenFocused } from './navigate';

/** The part of a query result this hook needs. */
export type FocusQuery = { isStale: boolean; refetch: () => unknown };

export type RefetchOnFocusOptions = {
  /**
   * Refetch even fresh data. For screens the site renders anew on every visit and that have no realtime
   * event (the developer's panel and journal). Default: only stale queries are asked again.
   */
  always?: boolean;
};

/**
 * Refetches when the screen comes back into focus — the app's "refetch on focus" (00 §2.3: realtime first,
 * this as the fallback; sections without a realtime event rely on it and on pull-to-refresh).
 *
 *   useRefetchOnFocus([students, groups]);          // stale queries only
 *   useRefetchOnFocus([panel], { always: true });   // every return
 *   useRefetchOnFocus(() => refetchAll());          // a custom refresh, every return
 *
 * A tab scene and a screen under a pushed one stay mounted, so mounting alone never triggers it, and
 * nothing is asked on the first mount — the query fetches by itself then. The return of the app to the
 * foreground is handled by the realtime bridge.
 */
export function useRefetchOnFocus(target: readonly FocusQuery[] | (() => unknown), options: RefetchOnFocusOptions = {}): void {
  const focused = useScreenFocused();
  const wasFocused = useRef(focused);
  const latest = useRef({ target, always: options.always === true });

  useEffect(() => {
    latest.current = { target, always: options.always === true };
  });

  useEffect(() => {
    const returned = focused && !wasFocused.current;
    wasFocused.current = focused;
    if (!returned) return;
    const current = latest.current;
    if (typeof current.target === 'function') {
      void current.target();
      return;
    }
    for (const query of current.target) {
      if (current.always || query.isStale) void query.refetch();
    }
  }, [focused]);
}
