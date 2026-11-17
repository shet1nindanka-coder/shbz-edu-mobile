// A wait measured as a DURATION ("try again in 60 s"), not as a wall-clock moment. Pure, no React.
//
// WHY: `retryAfterSeconds` is a duration (90-addendum-1 A.3 rule 3). A deadline `Date.now() + wait` grows
// by the size of every backward change of the device clock (a network-time correction, a manual change):
// the control stayed locked for an hour after the clock was set back an hour. A monotonic clock is no
// better on a phone: React Native's `performance.now()` stops while the device sleeps, so a 10-minute
// daily-budget wait would last 10 minutes of screen-on time.
//
// So the remaining time is counted down by the wall-clock time that passes between two readings, and a
// reading EARLIER than the previous one (the clock went back) counts as no time at all: the wait is then
// never longer than it was at the last reading. A forward jump only ends it early, which is harmless — the
// server refuses again and names a new wait.

export type WaitClock = {
  /** Milliseconds still to wait as of `seenAt`. */
  readonly remainingMs: number;
  /** The wall-clock reading (epoch ms) the remaining time was last measured at. */
  readonly seenAt: number;
};

/** A wait of `waitSeconds` that started at `startedAtMs` (a wall-clock reading, e.g. when a request failed). */
export function startWaitClock(waitSeconds: number, startedAtMs: number): WaitClock {
  const remainingMs = Number.isFinite(waitSeconds) && waitSeconds > 0 ? waitSeconds * 1000 : 0;
  return { remainingMs, seenAt: startedAtMs };
}

/** The clock read again at `nowMs`: what passed since the last reading is subtracted; a step back is ignored. */
export function advanceWaitClock(clock: WaitClock, nowMs: number): WaitClock {
  if (!Number.isFinite(nowMs)) return clock;
  const elapsed = nowMs > clock.seenAt ? nowMs - clock.seenAt : 0;
  return { remainingMs: Math.max(0, clock.remainingMs - elapsed), seenAt: nowMs };
}

/** Whole seconds still to wait, rounded up (the control stays locked until the wait is really over). */
export function waitClockSeconds(clock: WaitClock | null): number {
  return clock === null ? 0 : Math.max(0, Math.ceil(clock.remainingMs / 1000));
}
