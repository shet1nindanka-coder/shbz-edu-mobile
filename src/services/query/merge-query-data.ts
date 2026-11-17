import type { QueryClient, QueryKey } from "@tanstack/react-query";

/**
 * Folds the answer of a mutation or a poll (an optimistic mark, a saved set, a poll result) into a cached
 * GET response WITHOUT moving its timestamp. Does nothing when the query has no data or when `merge`
 * returns its argument.
 *
 * The screens derive the server clock from the pair (`response.serverNow`, `dataUpdatedAt`)
 * (`@/domain/server-clock`). A plain `setQueryData` stamps the entry with the current device time while
 * `serverNow` stays that of the last real GET, so every merge would push the app's "server now" back by
 * the age of that GET — the remaining lesson time grows, timers and overdue badges come late. Keeping
 * `dataUpdatedAt` also keeps the entry's age honest (merged data is not a fresh read), and it is the
 * moment the persisted cache restores together with `serverNow` after an app restart.
 */
export function mergeQueryData<T>(queryClient: QueryClient, queryKey: QueryKey, merge: (current: T) => T): void {
  const state = queryClient.getQueryState<T>(queryKey);
  // Nothing cached (the screen is gone, or the entry was removed): there is nothing to merge into.
  if (!state || state.data === undefined) return;
  const next = merge(state.data);
  if (next === state.data) return;
  queryClient.setQueryData<T>(queryKey, next, { updatedAt: state.dataUpdatedAt });
}
