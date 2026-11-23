import { useCallback, useEffect, useState } from 'react';

import { advanceWaitClock, startWaitClock, waitClockSeconds, type WaitClock } from './wait-clock';

/** A wait to count down: `seconds` long, started at the wall-clock reading `at` (epoch ms). */
export type WaitStart = { readonly seconds: number; readonly at: number };

type State = { start: WaitStart | null; clock: WaitClock | null };

function clockFor(start: WaitStart | null): WaitClock | null {
  return start === null ? null : advanceWaitClock(startWaitClock(start.seconds, start.at), Date.now());
}

/**
 * Seconds left of a wait (`wait-clock.ts`: a duration, immune to backward clock changes), re-rendering once a
 * second while it runs; 0 when it is over or `start` is null. A new `start` object starts a new wait: keep it
 * in state or memoise it.
 *
 * Use this for a cool-down (`retryAfterSeconds`); `useCountdown` is for a real moment on the clock (a lesson
 * start), which must follow the clock.
 */
export function useWaitClock(start: WaitStart | null): number {
  const [state, setState] = useState<State>(() => ({ start, clock: clockFor(start) }));
  // A new wait is measured in this very render, so a control is locked from the first frame.
  let current = state;
  if (state.start !== start) {
    current = { start, clock: clockFor(start) };
    setState(current);
  }
  const seconds = waitClockSeconds(current.clock);
  const running = seconds > 0;

  useEffect(() => {
    if (!running) return;
    const tick = () =>
      setState((previous) => (previous.start === start && previous.clock ? { start, clock: advanceWaitClock(previous.clock, Date.now()) } : previous));
    // Timers stop in the background; the first tick after the return subtracts the whole time away.
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [running, start]);

  return seconds;
}

export type DurationLock = {
  /** Seconds until the lock ends; 0 when nothing is locked. */
  seconds: number;
  locked: boolean;
  /** Locks for `seconds` from now (a refusal's `retryAfterSeconds`); a non-positive value does nothing. */
  start: (seconds: number) => void;
  /** Ends the lock at once (e.g. the user typed another login, which may not be limited). */
  clear: () => void;
};

/** A control lock for a cool-down that is a duration: `useWaitClock` with its start kept in state. */
export function useDurationLock(): DurationLock {
  const [start, setStart] = useState<WaitStart | null>(null);
  const seconds = useWaitClock(start);
  const begin = useCallback((wait: number) => {
    if (Number.isFinite(wait) && wait > 0) setStart({ seconds: wait, at: Date.now() });
  }, []);
  const clear = useCallback(() => setStart(null), []);
  return { seconds, locked: seconds > 0, start: begin, clear };
}
