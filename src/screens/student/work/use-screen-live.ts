import { useEffect, useRef, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { useScreenFocused } from '@/navigation';

function subscribeToAppState(notify: () => void): () => void {
  const subscription = AppState.addEventListener('change', notify);
  return () => subscription.remove();
}

function isAppActive(): boolean {
  return AppState.currentState === 'active';
}

/**
 * True while this screen is the focused one AND the app is in the foreground. Polling, the lesson "join"
 * call and the schedule timers run only then (03 §1 H2 "Mobile translation", §7 Q6): a tab scene and a
 * screen under a pushed one stay mounted, and timers do not fire reliably in the background anyway.
 */
export function useScreenLive(): boolean {
  const focused = useScreenFocused();
  const active = useSyncExternalStore(subscribeToAppState, isAppActive, () => true);
  return focused && active;
}

/**
 * Calls `onReturn` each time the screen becomes live again after having been hidden (another tab, a
 * pushed screen, the background) — the app's "refetch on focus" (00 §2.3). Not called on the first mount.
 */
export function useOnReturn(live: boolean, onReturn: () => void): void {
  const wasLive = useRef(live);
  const callback = useRef(onReturn);
  useEffect(() => {
    callback.current = onReturn;
  });
  useEffect(() => {
    if (live && !wasLive.current) callback.current();
    wasLive.current = live;
  }, [live]);
}
