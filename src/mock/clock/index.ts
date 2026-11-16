/**
 * The mock clock (docs/spec/90-addendum-6.md §5 rule 2): the single source of "now" for the whole mock
 * backend — session expiry, limiter windows, lesson status, deferred jobs, `serverNow` in responses.
 *
 * Two implementations:
 * - `createSystemClock()` — the device clock and real timers (the app);
 * - `createManualClock(start)` — a clock that moves only when a test calls `advance()` / `set()`; its
 *   timers fire synchronously during the advance, in due-time order.
 *
 * Fixture timestamps are offsets from the seed anchor `T0`, which is stored in `store.meta.t0` — the clock
 * itself is never re-anchored.
 */

export interface MockTimer {
  /** Cancels the timer; a no-op once it fired. */
  cancel(): void;
}

export interface MockClock {
  /** Epoch milliseconds. */
  now(): number;
  /** Runs `callback` once, `delayMs` from now. */
  setTimeout(callback: () => void, delayMs: number): MockTimer;
  /** Resolves `delayMs` from now; never synchronously (a zero delay resolves on a later microtask). */
  sleep(delayMs: number): Promise<void>;
}

/** The real clock. `now` can be replaced (e.g. to shift the whole app in time) while timers stay real. */
export function createSystemClock(now: () => number = Date.now): MockClock {
  return {
    now,
    setTimeout(callback, delayMs) {
      const handle = setTimeout(callback, Math.max(0, delayMs));
      return { cancel: () => clearTimeout(handle) };
    },
    sleep(delayMs) {
      if (delayMs <= 0) return Promise.resolve();
      return new Promise((resolve) => {
        setTimeout(resolve, delayMs);
      });
    },
  };
}

export interface ManualMockClock extends MockClock {
  /** Moves the clock forward and fires every timer that became due, oldest first. */
  advance(ms: number): void;
  /** Jumps to an absolute time (forwards only) and fires the timers that became due. */
  set(epochMs: number): void;
  /** Number of timers that have not fired yet. */
  pendingTimers(): number;
}

type ManualTimer = { id: number; dueAt: number; callback: () => void };

/** A clock for tests: time stands still until `advance()` / `set()` is called. */
export function createManualClock(start: number | Date | string): ManualMockClock {
  let current = typeof start === "number" ? start : new Date(start).getTime();
  if (!Number.isFinite(current)) throw new Error("createManualClock: the start time is not a valid date.");
  let nextId = 1;
  let timers: ManualTimer[] = [];

  const runDue = (target: number) => {
    for (;;) {
      const due = timers.filter((timer) => timer.dueAt <= target).sort((a, b) => a.dueAt - b.dueAt || a.id - b.id)[0];
      if (!due) break;
      timers = timers.filter((timer) => timer.id !== due.id);
      // A timer sees the time it was due at, so a callback that schedules a follow-up keeps the right spacing.
      current = Math.max(current, due.dueAt);
      due.callback();
    }
    current = Math.max(current, target);
  };

  const clock: ManualMockClock = {
    now: () => current,
    setTimeout(callback, delayMs) {
      const timer: ManualTimer = { id: nextId, dueAt: current + Math.max(0, delayMs), callback };
      nextId += 1;
      timers.push(timer);
      return {
        cancel: () => {
          timers = timers.filter((entry) => entry.id !== timer.id);
        },
      };
    },
    sleep(delayMs) {
      if (delayMs <= 0) return Promise.resolve();
      return new Promise((resolve) => {
        clock.setTimeout(resolve, delayMs);
      });
    },
    advance(ms) {
      if (ms < 0) throw new Error("createManualClock: cannot move backwards.");
      runDue(current + ms);
    },
    set(epochMs) {
      if (epochMs < current) throw new Error("createManualClock: cannot move backwards.");
      runDue(epochMs);
    },
    pendingTimers: () => timers.length,
  };

  return clock;
}
