import { useCallback, useSyncExternalStore } from 'react';

import { subscribeClock } from './clock-store';
import { clockSnapshot } from './clock-tick';

/**
 * The server's "now" in epoch ms, re-evaluated every `tickMs` and on every return to the foreground
 * (09 §6.2 rule 6: overdue badges and lesson windows are computed with the server clock, never with the
 * raw device time). `offsetMs` comes from `serverClockOffset(response.serverNow, query.dataUpdatedAt)`
 * (`@/domain/server-clock`).
 */
export function useServerNow(offsetMs: number, tickMs = 30_000): number {
  const subscribe = useCallback((notify: () => void) => subscribeClock(tickMs, notify), [tickMs]);
  const snapshot = useCallback(() => clockSnapshot(tickMs), [tickMs]);
  const deviceNow = useSyncExternalStore(subscribe, snapshot, () => 0);
  return deviceNow + offsetMs;
}
