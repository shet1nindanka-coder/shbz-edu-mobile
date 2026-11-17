/**
 * The persister of the query cache: TanStack's async-storage persister over the chunked layout of
 * `chunked-storage.ts`, with a size budget.
 *
 * - Chunked: the dehydrated cache of a teacher who opened a few large imported topics is several MB; kept
 *   as one AsyncStorage row it could be written but never read back on Android (cursor window ≈ 2 MB), so
 *   the whole offline cache was discarded at every cold start.
 * - Budget: the legacy Android AsyncStorage database is capped at 6 MB in total, shared with the mock
 *   store and the preferences. Before a write, a query larger than `PERSIST_MAX_QUERY_BYTES` is left out,
 *   then the least recently updated ones until the cache fits `PERSIST_MAX_BYTES` (UTF-8 bytes). Dropped
 *   queries stay in memory; they are only not available offline after a restart.
 * - A read that fails (storage error, a value whose pieces are missing) restores nothing instead of
 *   throwing; the next write replaces the stored value. Nothing is retried in a loop.
 */
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import type { PersistedClient, Persister } from '@tanstack/react-query-persist-client';

import { chunkedStorage, removeChunkedValue, utf8ByteLength } from '@/domain/chunked-storage';

import type { KeyValueStorage } from '../preferences';
import { PERSIST_MAX_BYTES, PERSIST_MAX_QUERY_BYTES, PERSIST_STORAGE_KEY } from './persist-policy';

export type PersistBudget = {
  /** Upper bound of the whole serialized cache, UTF-8 bytes. */
  maxBytes: number;
  /** A single query larger than this is never written. */
  maxQueryBytes: number;
};

const DEFAULT_BUDGET: PersistBudget = { maxBytes: PERSIST_MAX_BYTES, maxQueryBytes: PERSIST_MAX_QUERY_BYTES };

type DehydratedQuery = PersistedClient['clientState']['queries'][number];

/**
 * `client` with as many queries left out as needed to fit `budget`: first every query too large on its own,
 * then the least recently updated. Returns the same object when nothing has to go.
 */
export function trimPersistedClient(client: PersistedClient, budget: PersistBudget = DEFAULT_BUDGET): PersistedClient {
  const queries = client.clientState.queries;
  const sized = queries.map((query, index) => ({ query, index, bytes: utf8ByteLength(JSON.stringify(query)) }));
  // Everything except the queries themselves (buster, timestamp, mutations) plus the separators.
  const shell = utf8ByteLength(JSON.stringify({ ...client, clientState: { ...client.clientState, queries: [] } })) + queries.length;
  let total = shell + sized.reduce((sum, entry) => sum + entry.bytes, 0);
  if (total <= budget.maxBytes && sized.every((entry) => entry.bytes <= budget.maxQueryBytes)) return client;

  const dropped = new Set<number>();
  for (const entry of sized) {
    if (entry.bytes > budget.maxQueryBytes) {
      dropped.add(entry.index);
      total -= entry.bytes;
    }
  }
  const byAge = sized
    .filter((entry) => !dropped.has(entry.index))
    .sort((a, b) => updatedAt(a.query) - updatedAt(b.query) || b.bytes - a.bytes);
  for (const entry of byAge) {
    if (total <= budget.maxBytes) break;
    dropped.add(entry.index);
    total -= entry.bytes;
  }
  const kept: DehydratedQuery[] = queries.filter((_, index) => !dropped.has(index));
  return { ...client, clientState: { ...client.clientState, queries: kept } };
}

function updatedAt(query: DehydratedQuery): number {
  const { dataUpdatedAt, errorUpdatedAt } = query.state;
  return Math.max(dataUpdatedAt ?? 0, errorUpdatedAt ?? 0);
}

export type QueryPersisterOptions = {
  key?: string;
  throttleTime?: number;
  budget?: PersistBudget;
  /** Maximum UTF-8 bytes of one stored row (tests). */
  chunkBytes?: number;
};

/** The persister of `createPersistOptions`. */
export function createQueryPersister(storage: KeyValueStorage, options: QueryPersisterOptions = {}): Persister {
  const key = options.key ?? PERSIST_STORAGE_KEY;
  const budget = options.budget ?? DEFAULT_BUDGET;
  const chunked = chunkedStorage(storage, { chunkBytes: options.chunkBytes });
  const persister = createAsyncStoragePersister({
    storage: chunked,
    key,
    throttleTime: options.throttleTime ?? 1000,
    serialize: (client) => JSON.stringify(trimPersistedClient(client, budget)),
  });
  return {
    persistClient: persister.persistClient,
    async restoreClient() {
      try {
        return await persister.restoreClient();
      } catch {
        // Unreadable or torn: start without a restored cache. The value is not removed here — the first
        // write of this run replaces it (and an error thrown here would make TanStack remove it anyway).
        return undefined;
      }
    },
    removeClient: () => removeChunkedValue(storage, key),
  };
}

/** Deletes the persisted cache (all its pieces). Never throws. */
export async function removePersistedQueryCache(storage: KeyValueStorage, key: string = PERSIST_STORAGE_KEY): Promise<void> {
  try {
    await removeChunkedValue(storage, key);
  } catch {
    // Storage unavailable: the next throttled write stores the empty cache.
  }
}
