/**
 * Reading a query that has nothing to show yet (pure; the React half is `load-failure.tsx`).
 *
 * Queries are `offlineFirst`: with no connection the retry of a failed first load is parked, and the app's
 * QueryClient then ends such a query with its network error (`failQueriesWaitingWithoutData`). Until that
 * happens — and for a query with placeholder data, which is left parked — the paused state is treated as a
 * failure here, so a screen never sits on its skeleton while the device is offline.
 */

/** The part of a query result these helpers read. */
export type LoadQueryState = {
  isError: boolean;
  error: unknown;
  /** The failure of the last attempt while the query is still retrying or parked. */
  failureReason?: unknown;
  fetchStatus: 'fetching' | 'paused' | 'idle';
  data?: unknown;
};

/** A read that will not get its data by waiting: it failed, or it is parked because the device is offline. */
export function isLoadFailed(query: Pick<LoadQueryState, 'isError' | 'fetchStatus'>): boolean {
  return query.isError || query.fetchStatus === 'paused';
}

/** A first read parked offline with nothing cached (with cached data the screen keeps showing it). */
export function isWaitingForNetwork(query: Pick<LoadQueryState, 'fetchStatus' | 'data'>): boolean {
  return query.data === undefined && query.fetchStatus === 'paused';
}

/**
 * Why a read without data cannot show any: `{ error }` when it failed or is parked offline (the error is
 * then the failure of the attempt that was made), `null` while the first load is simply running.
 */
export function loadFailureOf(query: Pick<LoadQueryState, 'isError' | 'error' | 'failureReason' | 'fetchStatus'>): { error: unknown } | null {
  if (query.isError) return { error: query.error };
  if (query.fetchStatus === 'paused') return { error: query.failureReason ?? null };
  return null;
}
