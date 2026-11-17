import { useCallback, useEffect, useRef, useState } from 'react';

/** What the hook needs from a `useQuery` / `useInfiniteQuery` result. */
export type PullRefreshQuery = {
  fetchStatus: 'fetching' | 'paused' | 'idle';
  refetch: () => Promise<unknown>;
};

export type PullRefresh = {
  /** Pass to `refreshing` of the RefreshControl (`Screen` / FlashList). */
  refreshing: boolean;
  /** Pass to `onRefresh`. Refetches every query given to the hook. */
  refresh: () => void;
};

/**
 * Whether the pull-to-refresh spinner is shown: only for a refresh the user asked for, and never while a
 * refetch is parked waiting for the connection. Pure; exported for tests.
 */
export function isPullRefreshing(asked: boolean, statuses: readonly PullRefreshQuery['fetchStatus'][]): boolean {
  return asked && !statuses.includes('paused');
}

/**
 * Pull-to-refresh of one or more queries. The spinner is shown only for a refresh the user asked for (never
 * for the realtime bridge's background refetches), and it always ends:
 *
 * - online, when every refetch has settled;
 * - offline, as soon as a refetch is parked by TanStack Query. Queries are `offlineFirst` with one retry, so
 *   offline the promise of `refetch()` over cached data stays pending until the connection returns — a
 *   spinner bound to that promise would spin for as long as the phone is offline. The cached value stays on
 *   screen and the offline banner says why; the parked refetch resumes by itself on reconnect, without
 *   bringing the spinner back.
 *
 * Falsy entries are skipped, so a query that only some states refresh can be passed conditionally:
 * `usePullRefresh([group, visited.has('statistics') && statistics])`.
 */
export function usePullRefresh(queries: readonly (PullRefreshQuery | null | undefined | false)[]): PullRefresh {
  const active = queries.filter((query): query is PullRefreshQuery => Boolean(query));
  const statuses = active.map((query) => query.fetchStatus);
  const [asked, setAsked] = useState(false);
  // The latest refresh owns the flag: an older one settling late must not end the newer one's spinner.
  const generation = useRef(0);
  const latest = useRef(active);
  useEffect(() => {
    latest.current = active;
  });

  // Drop the request once it is parked, so the fetch resuming on reconnect stays a silent background one.
  // Adjusted during render (React's "storing information from previous renders"), not in an effect.
  if (asked && statuses.includes('paused')) setAsked(false);

  const refresh = useCallback(() => {
    generation.current += 1;
    const mine = generation.current;
    setAsked(true);
    void Promise.allSettled(latest.current.map((query) => query.refetch())).finally(() => {
      if (generation.current === mine) setAsked(false);
    });
  }, []);

  return { refreshing: isPullRefreshing(asked, statuses), refresh };
}
