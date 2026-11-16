import type { UseQueryResult } from '@tanstack/react-query';

/**
 * A first read that cannot start: the device is offline and nothing is cached. TanStack Query pauses such
 * a query instead of failing it, so without this check the screen would show its skeleton for as long as
 * the connection is down. With cached data the screen simply keeps showing it under the offline strip.
 */
export function isWaitingForNetwork(query: Pick<UseQueryResult, 'fetchStatus' | 'data'>): boolean {
  return query.data === undefined && query.fetchStatus === 'paused';
}
