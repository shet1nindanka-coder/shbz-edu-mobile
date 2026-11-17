// The cached board of a lesson or a homework draft is patched in place after a mutation (an optimistic
// result mark, a saved set, an accepted "Retry"). Two things depend on WHEN the board was really read
// from the server, and a patch must not disturb either of them:
//   - the server-corrected clock of the board (idle chips, "N min ago", the 15-minute stale rule and the
//     start/end timers — docs/spec/05-teacher-lessons-plans.md §4.8, §5.3) pairs `serverNow` of the
//     response with the moment it arrived;
//   - the persisted cache restores `serverNow` together with that moment after an app restart.
// TanStack Query stamps `setQueryData` with the current time by default, which would pair an old
// `serverNow` with "now" and make the board clock run behind by the age of the board.
import type { QueryClient, QueryKey } from '@tanstack/react-query';

/**
 * Replaces the cached value through `update` and keeps the time of the last real fetch (`dataUpdatedAt`).
 * Does nothing when the query has no data yet.
 */
export function patchKeepingFetchTime<T>(queryClient: QueryClient, queryKey: QueryKey, update: (current: T) => T): void {
  const fetchedAt = queryClient.getQueryState<T>(queryKey)?.dataUpdatedAt;
  queryClient.setQueryData<T>(queryKey, (current) => (current === undefined ? current : update(current)), fetchedAt ? { updatedAt: fetchedAt } : undefined);
}

/**
 * How far the server clock is ahead of the device clock, in ms: `serverNow` of a response minus the
 * device time at which that response arrived. Unusable input → 0 (the device clock is used as is).
 */
export function serverClockOffset(serverNow: string | null | undefined, fetchedAt: number): number {
  if (!serverNow || !fetchedAt) return 0;
  const offset = Date.parse(serverNow) - fetchedAt;
  return Number.isFinite(offset) ? offset : 0;
}
