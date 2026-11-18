import type { QueryClient, QueryKey } from '@tanstack/react-query';

import { mergeQueryData } from '@/services/query';

/**
 * Folds the answer of a write made on this screen (an upload, a deletion, a started check, a submission)
 * into a cached GET response. A read of that response that is still in flight left before the write and
 * would replace the merged data with what the server had before it, so it is restarted: the new read is
 * made after the write and carries it (`invalidateQueries` cancels the old one without reverting).
 */
export function mergeLocalWrite<T>(queryClient: QueryClient, queryKey: QueryKey, merge: (current: T) => T): void {
  mergeQueryData<T>(queryClient, queryKey, merge);
  if (queryClient.isFetching({ queryKey, exact: true }) > 0) {
    void queryClient.invalidateQueries({ queryKey, exact: true });
  }
}
