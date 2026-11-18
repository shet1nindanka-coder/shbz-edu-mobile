import type { Query, QueryCacheNotifyEvent, QueryClient, QueryKey } from '@tanstack/react-query';

/**
 * Server-driven refreshes (a realtime event, a poll that saw a new signature, a schedule timer) that never
 * cancel a read in flight.
 *
 * `invalidateQueries` cancels a running fetch by default (`cancelRefetch: true`). When refreshes come
 * faster than a read answers — a busy group lesson, a slow network, the developer who receives every
 * event — every refresh cancels the read the previous one started and the screen never updates. With
 * `cancelRefetch: false` alone a refresh that joins a running read is lost instead: that read may have
 * left the server before the change, and its success clears the "invalidated" mark.
 *
 * So a refresh keeps the running read and marks the query dirty; when that read settles exactly one more
 * read follows (several refreshes during one read still give one follow-up), as the site's queued
 * `router.refresh()` calls run one after another. The follow-up is an ordinary invalidation: a query
 * without active observers is only marked stale. `cancelPendingRefreshes` forgets the follow-ups (sign-out,
 * the bridge unmounting).
 *
 * A user's own write keeps calling `invalidateQueries` / `refetch()` directly: cancelling a read that
 * started before the write is what keeps an older answer from overwriting the optimistic state.
 */
export type RefreshFilters = { queryKey: QueryKey; exact?: boolean };

type Coordinator = {
  /** Queries whose running read started before a refresh arrived, by hash. */
  dirty: Map<string, Query>;
  unsubscribe: (() => void) | null;
};

const coordinators = new WeakMap<QueryClient, Coordinator>();

function coordinatorOf(queryClient: QueryClient): Coordinator {
  let coordinator = coordinators.get(queryClient);
  if (!coordinator) {
    coordinator = { dirty: new Map(), unsubscribe: null };
    coordinators.set(queryClient, coordinator);
  }
  return coordinator;
}

function stopListening(coordinator: Coordinator): void {
  coordinator.unsubscribe?.();
  coordinator.unsubscribe = null;
}

function listen(queryClient: QueryClient, coordinator: Coordinator): void {
  if (coordinator.unsubscribe) return;
  coordinator.unsubscribe = queryClient.getQueryCache().subscribe((event: QueryCacheNotifyEvent) => {
    const query = event.query;
    if (coordinator.dirty.get(query.queryHash) !== query) return;
    if (event.type === 'removed') {
      coordinator.dirty.delete(query.queryHash);
    } else if (event.type === 'updated' && query.state.fetchStatus === 'idle') {
      coordinator.dirty.delete(query.queryHash);
      // The one follow-up read; a refresh arriving during it marks it dirty again. A read cancelled by
      // `cancelQueries` (reverted through `setState`) belongs to a write that re-reads after itself.
      const settled = event.action.type === 'success' || event.action.type === 'error';
      if (settled) void refreshQueries(queryClient, { queryKey: query.queryKey, exact: true });
    }
    if (coordinator.dirty.size === 0) stopListening(coordinator);
  });
}

/** Re-reads the matching active queries (marks the rest stale) without cancelling a read in flight. */
export function refreshQueries(queryClient: QueryClient, filters: RefreshFilters): Promise<void> {
  const coordinator = coordinatorOf(queryClient);
  for (const query of queryClient.getQueryCache().findAll(filters)) {
    if (query.state.fetchStatus === 'fetching') coordinator.dirty.set(query.queryHash, query);
  }
  if (coordinator.dirty.size > 0) listen(queryClient, coordinator);
  return queryClient.invalidateQueries(filters, { cancelRefetch: false });
}

/** Drops every pending follow-up read (sign-out, the realtime bridge unmounting). */
export function cancelPendingRefreshes(queryClient: QueryClient): void {
  const coordinator = coordinators.get(queryClient);
  if (!coordinator) return;
  coordinator.dirty.clear();
  stopListening(coordinator);
}
