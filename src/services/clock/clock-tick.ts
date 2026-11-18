// The pure arithmetic of the clock store (no React Native: unit-tested).

/** The clock rounded down to the tick: stable between notifications, never counted from ticks. */
export function clockSnapshot(tickMs: number, nowMs: number = Date.now()): number {
  return Math.floor(nowMs / tickMs) * tickMs;
}

/** Delay until the next tick boundary of the wall clock (never 0, so a timer cannot spin). */
export function delayToNextTick(tickMs: number, nowMs: number = Date.now()): number {
  return clockSnapshot(tickMs, nowMs) + tickMs - nowMs || tickMs;
}
