// Realtime: the event → query-invalidation table (pure) and the bridge hook the composition root mounts.
// Screens that need the raw events subscribe through `useApi().shell.subscribeRealtime` themselves.
export {
  dedupePrefixes,
  invalidationPrefixesAfterGap,
  invalidationPrefixesFor,
  prefixId,
  type InvalidationPrefix,
} from './invalidation';
export { getRealtimeState, useRealtimeState } from './realtime-state';
export { useRealtimeBridge } from './use-realtime-bridge';
