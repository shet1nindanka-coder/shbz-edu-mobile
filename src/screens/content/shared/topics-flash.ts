// One-shot message for the topics list, posted by a screen that leaves for it (the site passes
// `?deleted=1` / `?created=1` in the redirect; the app has no query string between screens).
import { useCallback, useSyncExternalStore } from 'react';

export type TopicsFlash = 'created' | 'deleted';

let current: TopicsFlash | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function read(): TopicsFlash | null {
  return current;
}

/** Call right before navigating to `content.topics` (after deleting a topic from its own screens). */
export function postTopicsFlash(flash: TopicsFlash): void {
  current = flash;
  emit();
}

/** The topics list reads the pending message and clears it once it is dismissed or replaced. */
export function useTopicsFlash(): { flash: TopicsFlash | null; clear: () => void } {
  const flash = useSyncExternalStore(subscribe, read, read);
  const clear = useCallback(() => {
    if (current === null) return;
    current = null;
    emit();
  }, []);
  return { flash, clear };
}
