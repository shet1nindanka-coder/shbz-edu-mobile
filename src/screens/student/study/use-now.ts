import { useSyncExternalStore } from 'react';

const MINUTE_MS = 60_000;

function currentMinute(): number {
  return Math.floor(Date.now() / MINUTE_MS) * MINUTE_MS;
}

/** Re-renders subscribers when the minute changes (checked every 15 s; the snapshot is stable in between). */
function subscribeToMinutes(notify: () => void): () => void {
  const timer = setInterval(notify, 15_000);
  return () => clearInterval(timer);
}

/**
 * The device clock as render data, rounded down to the minute: an «Просрочено» badge appears and the
 * calendar's "today" moves on without a refetch. The clock is an external store, so reading it never
 * makes a render impure.
 */
export function useNow(): number {
  return useSyncExternalStore(subscribeToMinutes, currentMinute, currentMinute);
}
