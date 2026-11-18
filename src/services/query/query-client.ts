/**
 * The app's QueryClient and its persistence options.
 *
 * - Queries are `offlineFirst`: the first attempt always runs (the mock answers in-process; an HTTP client
 *   fails fast), and with no connection the cached value stays on screen instead of an endless spinner.
 * - A query that has NOTHING to show never waits for the network: TanStack parks the retry of a failed
 *   first load until the device is back online, which left a never-opened screen on its skeleton for as
 *   long as the connection was gone. Such a query is ended with its network error instead
 *   (`failQueriesWaitingWithoutData`), so the screen reaches its error state with "Retry"; it is fetched
 *   again by itself on reconnect. A refetch over cached data keeps waiting silently, as before.
 * - Mutations are `always`: they run even offline and reject at once with the `network` error, so the form
 *   can say so. A mutation is NEVER retried automatically (CLAUDE.md "Errors"). The one exception with a
 *   retry — the student's note — goes through the pending-writes queue (`pending-writes.ts`).
 */
import { CancelledError, QueryClient, defaultShouldDehydrateQuery, onlineManager } from '@tanstack/react-query';
import type { PersistQueryClientProviderProps } from '@tanstack/react-query-persist-client';

import { isApiError, isNetworkError } from '@/api/errors';

import type { KeyValueStorage } from '../preferences';
import {
  PERSIST_BUSTER,
  PERSIST_MAX_AGE_MS,
  QUERY_GC_TIME_MS,
  QUERY_STALE_TIME_MS,
  isPersistableQueryKey,
} from './persist-policy';
import { createQueryPersister, removePersistedQueryCache } from './query-persister';

/** One retry, and only for failures that a second attempt can fix (no response, 503). */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (failureCount >= 1) return false;
  if (!isApiError(error)) return false;
  return isNetworkError(error) || error.code === 'serviceUnavailable';
}

/**
 * Ends every query that is parked offline with no data: its state becomes `error` with the failure of the
 * first attempt (the `network` error), exactly as if there had been no retry. Returns the unsubscribe
 * function.
 *
 * Left alone on purpose:
 * - a query that has data — the cached value stays on screen and the refetch resumes on reconnect;
 * - a query whose screen still shows the previous result as placeholder data (a filter switched offline);
 * - a pause that is not about the connection.
 */
export function failQueriesWaitingWithoutData(client: QueryClient): () => void {
  return client.getQueryCache().subscribe((event) => {
    if (event.type !== 'updated' || event.action.type !== 'pause') return;
    const { query } = event;
    if (query.state.data !== undefined || onlineManager.isOnline()) return;
    if (query.observers.some((observer) => observer.getCurrentResult().isPlaceholderData)) return;
    const reason: unknown = query.state.fetchFailureReason;
    // Cancelling settles the parked fetch as an error; the error shown is the one the request failed with.
    void query.cancel().then(() => {
      const { state } = query;
      if (reason !== null && state.status === 'error' && state.error instanceof CancelledError) {
        query.setState({ ...state, error: reason as typeof state.error });
      }
    });
  });
}

/**
 * Destroys a query that was removed from the cache (`clear()` on sign-out, a role change, «clear cache»)
 * once its last observer leaves. Returns the unsubscribe function.
 *
 * WHY: `clear()` takes the queries out of the cache, but the screens on display still observe them. When
 * those screens unmount, `removeObserver` schedules the query's garbage collection with its `gcTime` (24 h
 * here) — on a query that is no longer in the cache, so no later `clear()` reaches it. Each such orphan
 * kept the previous user's data and a live timer for a day, and they piled up with every account switch.
 * Lowering `gcTime` cannot help (TanStack keeps the longest one seen), and the cache still announces
 * `observerRemoved` for a removed query: that is where it is destroyed (timer cleared, fetch cancelled),
 * after which nothing references it. The clear stays immediate, so the next user never sees old data.
 */
export function destroyOrphanedQueries(client: QueryClient): () => void {
  const cache = client.getQueryCache();
  return cache.subscribe((event) => {
    if (event.type !== 'observerRemoved') return;
    const { query } = event;
    if (query.getObserversCount() > 0 || cache.get(query.queryHash) === query) return;
    query.destroy();
  });
}

export type AppQueryClientOptions = {
  /** Pause before the one retry; tests shorten it. */
  retryDelayMs?: number;
};

export function createAppQueryClient(options: AppQueryClientOptions = {}): QueryClient {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        networkMode: 'offlineFirst',
        staleTime: QUERY_STALE_TIME_MS,
        gcTime: QUERY_GC_TIME_MS,
        retry: shouldRetryQuery,
        retryDelay: options.retryDelayMs ?? 1500,
        refetchOnReconnect: true,
        // React Native has no window focus; the realtime bridge refreshes on return to the foreground.
        refetchOnWindowFocus: false,
      },
      mutations: {
        networkMode: 'always',
        retry: false,
      },
    },
  });
  // Both live as long as the client (a module-level singleton in the app).
  failQueriesWaitingWithoutData(client);
  destroyOrphanedQueries(client);
  return client;
}

/**
 * Marks every query restored from the persisted cache as stale (`onSuccess` of the persist provider).
 * Everything on disk was answered in an earlier run of the app, the realtime stream has no replay of the
 * events missed while the app was closed, and a screen may keep a query fresh for long (`staleTime`
 * Infinity for statements): without this, such a query would show what the server said days ago. Nothing
 * is fetched here — mounted screens fetch once the restore ends, the others when they open; offline the
 * cached value stays on screen. `restoredBefore`: start of this run (data newer than that is this run's).
 */
export function markRestoredQueriesStale(client: QueryClient, restoredBefore: number): Promise<void> {
  return client.invalidateQueries({
    predicate: (query) => query.state.dataUpdatedAt > 0 && query.state.dataUpdatedAt < restoredBefore,
    refetchType: 'none',
  });
}

/**
 * Deletes the persisted cache from the device at once. The persister only writes on a throttle, so after
 * `queryClient.clear()` the previous user's responses would stay on disk for about a second — for good if
 * the app is closed inside that second. Sign-out awaits this instead of relying on the next write.
 */
export async function removePersistedQueries(storage: KeyValueStorage): Promise<void> {
  // Every piece of the chunked value goes; a storage failure is swallowed (the next throttled write stores
  // the empty cache).
  await removePersistedQueryCache(storage);
}

/**
 * `persistOptions` of `PersistQueryClientProvider`: the chunked, size-capped AsyncStorage persister
 * (`query-persister.ts`) + the dehydration policy.
 */
export function createPersistOptions(storage: KeyValueStorage): PersistQueryClientProviderProps['persistOptions'] {
  return {
    persister: createQueryPersister(storage),
    maxAge: PERSIST_MAX_AGE_MS,
    buster: PERSIST_BUSTER,
    dehydrateOptions: {
      shouldDehydrateQuery: (query) => defaultShouldDehydrateQuery(query) && isPersistableQueryKey(query.queryKey),
      // Paused or failed mutations are never restored: a mutation is not replayed behind the user's back.
      shouldDehydrateMutation: () => false,
    },
  };
}
