/**
 * The app's QueryClient and its persistence options.
 *
 * - Queries are `offlineFirst`: the first attempt always runs (the mock answers in-process; an HTTP client
 *   fails fast), and with no connection the cached value stays on screen instead of an endless spinner.
 * - Mutations are `always`: they run even offline and reject at once with the `network` error, so the form
 *   can say so. A mutation is NEVER retried automatically (CLAUDE.md "Errors"). The one exception with a
 *   retry — the student's note — goes through the pending-writes queue (`pending-writes.ts`).
 */
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { QueryClient, defaultShouldDehydrateQuery } from '@tanstack/react-query';
import type { PersistQueryClientProviderProps } from '@tanstack/react-query-persist-client';

import { isApiError, isNetworkError } from '@/api/errors';

import type { KeyValueStorage } from '../preferences';
import {
  PERSIST_BUSTER,
  PERSIST_MAX_AGE_MS,
  PERSIST_STORAGE_KEY,
  QUERY_GC_TIME_MS,
  QUERY_STALE_TIME_MS,
  isPersistableQueryKey,
} from './persist-policy';

/** One retry, and only for failures that a second attempt can fix (no response, 503). */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (failureCount >= 1) return false;
  if (!isApiError(error)) return false;
  return isNetworkError(error) || error.code === 'serviceUnavailable';
}

export function createAppQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        networkMode: 'offlineFirst',
        staleTime: QUERY_STALE_TIME_MS,
        gcTime: QUERY_GC_TIME_MS,
        retry: shouldRetryQuery,
        retryDelay: 1500,
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
}

/** `persistOptions` of `PersistQueryClientProvider`: AsyncStorage persister + the dehydration policy. */
export function createPersistOptions(storage: KeyValueStorage): PersistQueryClientProviderProps['persistOptions'] {
  return {
    persister: createAsyncStoragePersister({ storage, key: PERSIST_STORAGE_KEY, throttleTime: 1000 }),
    maxAge: PERSIST_MAX_AGE_MS,
    buster: PERSIST_BUSTER,
    dehydrateOptions: {
      shouldDehydrateQuery: (query) => defaultShouldDehydrateQuery(query) && isPersistableQueryKey(query.queryKey),
      // Paused or failed mutations are never restored: a mutation is not replayed behind the user's back.
      shouldDehydrateMutation: () => false,
    },
  };
}
