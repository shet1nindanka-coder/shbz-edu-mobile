import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { useScreenFocused } from './navigate';

function subscribeToAppState(notify: () => void): () => void {
  const subscription = AppState.addEventListener('change', notify);
  return () => subscription.remove();
}

function isAppActive(): boolean {
  return AppState.currentState === 'active';
}

/**
 * True while the calling screen is the focused one AND the app is in the foreground. Interval polling
 * (`refetchInterval`) runs only then: a tab scene and a screen under a pushed one stay mounted, and
 * TanStack Query's own focus manager does not follow `AppState` on React Native, so an unconditional poll
 * would keep firing under another screen and — where the OS lets timers run — in the background.
 */
export function useScreenLive(): boolean {
  const focused = useScreenFocused();
  const active = useSyncExternalStore(subscribeToAppState, isAppActive, () => true);
  return focused && active;
}
