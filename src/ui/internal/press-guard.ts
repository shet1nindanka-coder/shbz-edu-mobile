import { useCallback, useRef } from 'react';
import type { GestureResponderEvent } from 'react-native';

/** An `onPress` may return a promise (`() => mutation.mutateAsync(…)`): the control stays locked until it settles. */
export type GuardedPress = (event: GestureResponderEvent) => unknown;

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return typeof value === 'object' && value !== null && typeof (value as { then?: unknown }).then === 'function';
}

/** Releases the lock on the next macrotask (see `createPressGuard`). Tests replace it. */
export type ReleaseScheduler = (release: () => void) => void;

const nextTask: ReleaseScheduler = (release) => {
  setTimeout(release, 0);
};

/**
 * Synchronous re-entrancy guard of a press handler. `disabled` / `loading` reach a control only with the
 * next render, and TanStack Query delivers `isPending` one timer tick after `mutate()`. Two taps that the JS
 * thread handles back to back (it was busy while the user tapped again) would both run the handler and
 * create two lessons, two homework sets, two call records. The guard drops a press while:
 *
 * - the previous press is still being handled — until the next macrotask, which runs after TanStack's own
 *   notification timer, so by then the screen has rendered its pending state and the control is disabled;
 * - or, when the handler returned a promise, until that promise settles.
 *
 * A human cannot tap twice within one macrotask on an idle thread, so ordinary repeated presses (steppers,
 * next / previous) are never swallowed. Pure apart from the scheduler; unit-tested.
 */
export function createPressGuard(schedule: ReleaseScheduler = nextTask) {
  let locked = false;
  const release = () => {
    locked = false;
  };
  return {
    isLocked: () => locked,
    press<E>(handler: ((event: E) => unknown) | undefined, event: E): void {
      if (locked || !handler) return;
      locked = true;
      let result: unknown;
      try {
        result = handler(event);
      } catch (error) {
        locked = false;
        throw error;
      }
      if (isThenable(result)) {
        // A rejection is the handler's business (the screen shows its error); the lock only waits for it.
        result.then(
          () => schedule(release),
          () => schedule(release),
        );
      } else {
        schedule(release);
      }
    },
  };
}

/** `onPress` of a control wrapped in the guard; `undefined` stays `undefined` (no handler, no role change). */
export function usePressGuard(onPress: GuardedPress | undefined): ((event: GestureResponderEvent) => void) | undefined {
  // One guard for the life of the control: a new `onPress` on every render must not reset the lock.
  const guard = useRef<ReturnType<typeof createPressGuard> | null>(null);
  const guarded = useCallback(
    (event: GestureResponderEvent) => {
      guard.current ??= createPressGuard();
      guard.current.press(onPress, event);
    },
    [onPress],
  );
  return onPress ? guarded : undefined;
}
