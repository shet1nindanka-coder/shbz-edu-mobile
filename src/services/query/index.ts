// Query infrastructure: the QueryClient with its offline rules, the persistence policy, and the
// pending-writes queue (read the header of `pending-writes.ts` before using it).
export {
  PENDING_WRITES_STORAGE_KEY,
  createPendingWritesQueue,
  parsePendingWrites,
  type FlushResult,
  type PendingWrite,
  type PendingWriteHandler,
  type PendingWritesOptions,
  type PendingWritesQueue,
  type PendingWritesStorage,
  type SubmitOutcome,
} from './pending-writes';
export {
  PERSIST_BUSTER,
  PERSIST_MAX_AGE_MS,
  PERSIST_STORAGE_KEY,
  QUERY_GC_TIME_MS,
  QUERY_STALE_TIME_MS,
  isPersistableQueryKey,
} from './persist-policy';
export { createAppQueryClient, createPersistOptions, shouldRetryQuery } from './query-client';
