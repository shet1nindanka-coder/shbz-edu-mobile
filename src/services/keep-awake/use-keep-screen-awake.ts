import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useEffect, useId } from 'react';

/**
 * Keeps the screen from dimming and locking while `active` is true — for a screen the user watches
 * without touching it (the student's live lesson: the phone lies next to the notebook).
 *
 *   useKeepScreenAwake(lessonIsRunning && screenIsLive);
 *
 * Pass a condition that is false when the screen is not the focused one or the app is in the background
 * (e.g. `useScreenFocused()`), so the lock is released as soon as the user leaves. Each caller holds its
 * own lock (a tag per component instance), so two screens never release each other's.
 *
 * Safe everywhere: on web it uses the Screen Wake Lock API where the browser has it, and a platform that
 * cannot hold the lock (an old browser, a denied request) simply keeps its normal behaviour — the hook
 * never throws.
 */
export function useKeepScreenAwake(active: boolean): void {
  const tag = useId();
  useEffect(() => {
    if (!active) return;
    let held = false;
    const activation = activateKeepAwakeAsync(tag).then(
      () => {
        held = true;
      },
      // No wake lock on this platform, or the request was refused.
      () => undefined,
    );
    return () => {
      // Release only what was really taken, and only after the request has settled.
      void activation.then(() => (held ? deactivateKeepAwake(tag) : undefined)).catch(() => undefined);
    };
  }, [active, tag]);
}
