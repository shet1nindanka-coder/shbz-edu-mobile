import { useCallback, useSyncExternalStore } from 'react';

import { subscribeClock } from './clock-store';
import { clockSnapshot } from './clock-tick';

/**
 * The device clock as render data, rounded down to `intervalMs`: re-renders its owner at every interval
 * boundary and whenever the app comes back to the foreground, so "overdue" badges, idle chips, "N min ago",
 * the lessons list's «Сегодня» and the 15-minute "plan was lost" rule move on without a refetch
 * (04 §5.2, 05 §5.3). Every render reads the real clock (see `clock-store.ts`): the value is never older
 * than one interval, even right after the phone slept.
 */
export function useNowTick(intervalMs = 30_000): number {
  const subscribe = useCallback((notify: () => void) => subscribeClock(intervalMs, notify), [intervalMs]);
  const snapshot = useCallback(() => clockSnapshot(intervalMs), [intervalMs]);
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
