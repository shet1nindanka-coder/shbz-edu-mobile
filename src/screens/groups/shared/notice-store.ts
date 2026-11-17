/**
 * One-shot notices that travel between the two group screens. The site carries them in the query string
 * of a redirect (`?groupDeleted=1`, `?groupCreated=1`); natively the screen that finished the action
 * leaves a key in the app's one-shot mailbox (`@/services/notices`) and the screen that opens next TAKES
 * it (06 §1.1 "Notices → … after the mutation resolves"). Keys, not texts, so the banner follows a
 * language switch.
 *
 * Shown once, to the user who caused it: the key is consumed on delivery, the banner lives in the
 * receiving screen's own state and is dropped when that screen is left, and whatever nobody took is
 * cleared on sign-out — the next account never sees «Группа удалена».
 */
import { useCallback, useEffect, useState } from 'react';

import { useScreenFocused } from '@/navigation';
import { noticeChannel, postOneShotNotice, useOneShotNotice, type NoticeChannel } from '@/services/notices';

export type GroupNoticeKey = 'deleted' | 'created';

/** The groups list: «Группа удалена. Ученики остались на платформе.» */
export const GROUPS_LIST_NOTICE = noticeChannel<'deleted'>('groups.list');

/** The screen of one group: «Группа создана. Добавьте в неё учеников.» */
export function groupNoticeChannel(groupId: string): NoticeChannel<'created'> {
  return noticeChannel<'created'>(`groups.detail:${groupId}`);
}

/** Leaves a notice for the screen of `channel`. */
export function postGroupNotice<K extends GroupNoticeKey>(channel: NoticeChannel<K>, key: K): void {
  postOneShotNotice(channel, key);
}

/**
 * The notice of the calling screen and a function that dismisses it. The key is taken from the mailbox
 * when it arrives; leaving the screen (another tab, a pushed screen, back) drops it, like the site's
 * redirect parameter that is gone after the next navigation.
 */
export function useGroupNotice<K extends GroupNoticeKey>(channel: NoticeChannel<K>): [K | null, () => void] {
  const [key, setKey] = useState<K | null>(null);
  useOneShotNotice(channel, setKey);

  const focused = useScreenFocused();
  useEffect(() => {
    if (!focused) return undefined;
    // Runs when the screen loses focus (and on unmount): the banner has been seen.
    return () => setKey(null);
  }, [focused]);

  const dismiss = useCallback(() => setKey(null), []);
  return [key, dismiss];
}
