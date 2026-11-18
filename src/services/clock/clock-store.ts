import { AppState } from 'react-native';

import { delayToNextTick } from './clock-tick';

/**
 * The device clock as an external store for `useSyncExternalStore`, shared by `useNowTick` and
 * `useServerNow`.
 *
 * The snapshot is computed from the real clock on every read — rounded down to the tick, so it is stable
 * between notifications — and never by counting ticks: Android timers run on a monotonic clock that
 * stands still while the phone sleeps, so after waking a pending timer fires only "the remaining delay"
 * later (up to a whole interval). Any re-render (a refetch landing) therefore already sees the current
 * time, and the app coming back to the foreground notifies at once, because a refetch that returns
 * identical data re-renders nothing.
 *
 * `subscribeClock` notifies at every tick boundary of the wall clock and at every return of the app to
 * the foreground.
 */
export function subscribeClock(tickMs: number, notify: () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const arm = () => {
    timer = setTimeout(() => {
      notify();
      arm();
    }, delayToNextTick(tickMs));
  };
  arm();
  const subscription = AppState.addEventListener('change', (next) => {
    if (next !== 'active') return;
    notify();
    // The pending timer may have been frozen during sleep: re-aim it at the next real boundary.
    if (timer) clearTimeout(timer);
    arm();
  });
  return () => {
    if (timer) clearTimeout(timer);
    timer = null;
    subscription.remove();
  };
}
