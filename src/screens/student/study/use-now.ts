import { useNowTick } from '@/services/clock';

const MINUTE_MS = 60_000;

/**
 * The device clock as render data, rounded down to the minute: an «Просрочено» badge appears, the
 * calendar's and the streak's "today" move on without a refetch. The shared clock store re-renders at
 * every minute boundary and at once when the app returns to the foreground (a timer stands still while
 * the phone sleeps), so a value from before a sleep or Moscow midnight is never kept.
 */
export function useNow(): number {
  return useNowTick(MINUTE_MS);
}
