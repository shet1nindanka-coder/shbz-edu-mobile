import { useEffect, type RefObject } from 'react';

/** The part of a list ref this hook needs (FlashList, FlatList and ScrollView wrappers all have it). */
type ScrollableList = { scrollToOffset: (params: { offset: number; animated?: boolean }) => void };

/**
 * Lets the banner be laid out, and the sheet or dialog that produced it start closing, before the list
 * moves. A scroll requested in the same tick as the banner is lost: the list keeps the visible rows in
 * place when its header grows.
 */
const NOTICE_SCROLL_DELAY_MS = 200;

/**
 * A result banner sits in the list's header and is useless below the fold: every new `notice` (a new
 * object per announcement) brings the list back to its top.
 */
export function useNoticeScroll(listRef: RefObject<ScrollableList | null>, notice: object | null): void {
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => listRef.current?.scrollToOffset({ offset: 0, animated: true }), NOTICE_SCROLL_DELAY_MS);
    return () => clearTimeout(timer);
  }, [listRef, notice]);
}
