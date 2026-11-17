// One-shot message for the topics list, posted by a screen that leaves for it (the site passes
// `?deleted=1` / `?created=1` in the redirect; the app has no query string between screens). It waits in
// the shared one-shot store (`@/services/notices`): the list takes it into its own state when it shows it,
// and whatever nobody took is dropped on sign-out — a teacher who signs in next never sees the developer's
// «Тема успешно удалена».
import { noticeChannel, postOneShotNotice, useOneShotNotice } from '@/services/notices';

export type TopicsFlash = 'created' | 'deleted';

const CHANNEL = noticeChannel<TopicsFlash>('content.topics');

/** Call right before navigating to `content.topics` (after deleting a topic from its own screens). */
export function postTopicsFlash(flash: TopicsFlash): void {
  postOneShotNotice(CHANNEL, flash);
}

/** The topics list: `onFlash` gets a message left for it — on mount and whenever one is posted. */
export function useTopicsFlash(onFlash: (flash: TopicsFlash) => void): void {
  useOneShotNotice(CHANNEL, onFlash);
}

/** How long the screens of a topic deleted here are treated as "on their way out". */
const LEAVING_MS = 10_000;
let leaving: { topicId: string; until: number } | null = null;

/**
 * A topic was deleted from one of its own screens: leaves «Тема успешно удалена» for the list and marks
 * the topic as leaving. Call right before navigating to `content.topics`.
 */
export function postTopicDeleted(topicId: string): void {
  leaving = { topicId, until: Date.now() + LEAVING_MS };
  postTopicsFlash('deleted');
}

/**
 * The topic was deleted on this device a moment ago and its screens are being closed. A screen of that
 * topic that is still mounted under the one that deleted it (the topic under its editor) answers the 404
 * of its last refetch by staying as it is for the length of the transition, not by flashing "not found".
 */
export function isTopicLeaving(topicId: string): boolean {
  return leaving !== null && leaving.topicId === topicId && Date.now() < leaving.until;
}
