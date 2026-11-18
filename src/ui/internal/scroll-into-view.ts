import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import type { LayoutChangeEvent, ScrollViewInstance } from 'react-native';

export type Span = { x: number; width: number };

/** The horizontal offset that centres `span` in a `viewport` wide window (never before the start). */
export function centredScrollOffset(span: Span, viewport: number): number {
  return Math.max(0, span.x + span.width / 2 - viewport / 2);
}

/**
 * Keeps the selected item of a horizontally scrolling bar (`Segmented scrollable`, `Tabs`) in view.
 *
 * WHY: on the first render nothing is measured yet, so an effect on the selected index alone returns early
 * and never runs again — a deep link to a later tab opened with that tab cut off at the edge. The layout
 * callbacks therefore place the selection too, as soon as both its span and the viewport are known: without
 * animation on the first placement (and after a resize), animated when the user picks another item.
 */
export function useScrollIntoView(activeIndex: number, enabled: boolean) {
  const scrollRef = useRef<ScrollViewInstance>(null);
  const spans = useRef<(Span | undefined)[]>([]);
  const viewport = useRef(0);
  const active = useRef(activeIndex);
  useLayoutEffect(() => {
    active.current = activeIndex;
  }, [activeIndex]);

  const place = useCallback(
    (animated: boolean) => {
      if (!enabled) return;
      const span = spans.current[active.current];
      if (!span || viewport.current === 0) return;
      scrollRef.current?.scrollTo({ x: centredScrollOffset(span, viewport.current), animated });
    },
    [enabled],
  );

  // The user (or the owner) picked another item: slide to it.
  useEffect(() => {
    place(true);
  }, [activeIndex, place]);

  const onItemLayout = useCallback(
    (index: number, event: LayoutChangeEvent) => {
      const { x, width } = event.nativeEvent.layout;
      spans.current[index] = { x, width };
      // Every item reports its layout; only the selected one moves the bar.
      if (index === active.current) place(false);
    },
    [place],
  );

  const onViewportLayout = useCallback(
    (event: LayoutChangeEvent) => {
      viewport.current = event.nativeEvent.layout.width;
      place(false);
    },
    [place],
  );

  return { scrollRef, onItemLayout, onViewportLayout };
}
