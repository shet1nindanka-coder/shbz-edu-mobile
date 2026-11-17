// One-shot notices handed from the screen that finished an action to the screen that opens next.
//
// The site carries them in the query string of a redirect (`?deleted=1`, `?studentDeleted=1`,
// `?groupCreated=1`). Here the receiving screen is usually a tab root whose route params are fixed, so
// the key waits in memory instead. Three rules keep it from showing up where it does not belong:
//   - a notice is TAKEN, not read: the screen that shows it moves it into its own state, so it cannot
//     appear a second time (after a remount, on another screen of the same kind);
//   - keys, not texts, so the banner follows a language switch;
//   - everything still waiting is dropped on sign-out — the next account must not see the previous one's
//     «Тема успешно удалена».
// Pure module (no React): the hook lives in `use-one-shot-notice.ts`.

/** A named mailbox for the keys `K`. Create one constant per receiving screen with `noticeChannel`. */
export type NoticeChannel<K extends string> = {
  readonly name: string;
  /** Type marker only; never set. */
  readonly keys?: K;
};

const pending = new Map<string, string>();
const listeners = new Map<string, Set<() => void>>();

export function noticeChannel<K extends string>(name: string): NoticeChannel<K> {
  return { name };
}

/** Leaves `key` for the screen of `channel`; a mounted receiver takes it at once. A newer key replaces an untaken one. */
export function postOneShotNotice<K extends string>(channel: NoticeChannel<K>, key: K): void {
  pending.set(channel.name, key);
  // A copy: a receiver may unsubscribe while it is being called.
  for (const listener of [...(listeners.get(channel.name) ?? [])]) listener();
}

/** Removes and returns the waiting key of `channel`, or `null`. */
export function takeOneShotNotice<K extends string>(channel: NoticeChannel<K>): K | null {
  const key = pending.get(channel.name);
  if (key === undefined) return null;
  pending.delete(channel.name);
  return key as K;
}

/** Calls `listener` whenever a key is posted to `channel`. Returns the unsubscribe function. */
export function subscribeOneShotNotice<K extends string>(channel: NoticeChannel<K>, listener: () => void): () => void {
  const set = listeners.get(channel.name) ?? new Set<() => void>();
  listeners.set(channel.name, set);
  set.add(listener);
  return () => {
    set.delete(listener);
    if (set.size === 0) listeners.delete(channel.name);
  };
}

/** Drops every notice nobody took. Called on sign-out. */
export function clearOneShotNotices(): void {
  pending.clear();
}
