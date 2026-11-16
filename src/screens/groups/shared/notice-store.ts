/**
 * One-shot notices that travel between the two group screens. The site carries them in the query string
 * of a redirect (`?groupDeleted=1`, `?groupCreated=1`); natively the screen that finished the action
 * leaves a key here and the screen that opens next shows it (06 §1.1 "Notices → … after the mutation
 * resolves"). Keys, not texts, so the banner follows a language switch.
 */
import { useCallback, useSyncExternalStore } from 'react';

export type GroupNoticeKey = 'deleted' | 'created';

/** `"list"` for the groups list, a group id for that group's screen. */
type Scope = string;

const notices = new Map<Scope, GroupNoticeKey>();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const LIST_SCOPE = 'list';

/** Leaves a notice for the screen of `scope` (shown until dismissed or replaced). */
export function postGroupNotice(scope: Scope, key: GroupNoticeKey): void {
  notices.set(scope, key);
  emit();
}

export function clearGroupNotice(scope: Scope): void {
  if (notices.delete(scope)) emit();
}

/** The pending notice of `scope` and a function that dismisses it. */
export function useGroupNotice(scope: Scope): [GroupNoticeKey | null, () => void] {
  const getSnapshot = useCallback(() => notices.get(scope) ?? null, [scope]);
  const key = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const clear = useCallback(() => clearGroupNotice(scope), [scope]);
  return [key, clear];
}
