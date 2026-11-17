import type { QueryClient, QueryKey } from '@tanstack/react-query';

/**
 * Folds the answer of a mutation or a poll into a cached GET response WITHOUT moving its timestamp.
 *
 * The screens derive the server clock from the pair (`response.serverNow`, `dataUpdatedAt`)
 * (docs/spec/03-student-homework-lesson.md §5.3, 09 §6.2 rule 6). A plain `setQueryData` stamps the
 * entry with the current device time while `serverNow` stays that of the last real GET, so every merge
 * would push the app's "server now" back by the age of that GET — the remaining lesson time grows, the
 * end-of-lesson timer and the overdue badge come late. Keeping `dataUpdatedAt` also keeps the entry's
 * age honest: merged data is not a fresh read.
 */
export function mergeQueryData<T>(queryClient: QueryClient, queryKey: QueryKey, merge: (current: T) => T): void {
  const state = queryClient.getQueryState<T>(queryKey);
  // Nothing cached (the screen is gone, or the entry was removed): there is nothing to merge into.
  if (!state || state.data === undefined) return;
  const next = merge(state.data);
  if (next === state.data) return;
  queryClient.setQueryData<T>(queryKey, next, { updatedAt: state.dataUpdatedAt });
}
