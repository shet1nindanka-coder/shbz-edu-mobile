import { useSyncExternalStore } from 'react';

/**
 * The server's "now" in epoch ms, re-evaluated every `tickMs` (09 §6.2 rule 6: overdue badges and lesson
 * windows are computed with the server clock, never with the raw device time). `offsetMs` comes from
 * `serverClockOffset(response.serverNow, query.dataUpdatedAt)` (`@/domain/server-clock`).
 */
export function useServerNow(offsetMs: number, tickMs = 30_000): number {
  const deviceNow = useSyncExternalStore(
    (notify) => {
      const timer = setInterval(notify, tickMs);
      return () => clearInterval(timer);
    },
    // Rounded to the tick so the snapshot is stable between notifications.
    () => Math.floor(Date.now() / tickMs) * tickMs,
    () => 0,
  );
  return deviceNow + offsetMs;
}
