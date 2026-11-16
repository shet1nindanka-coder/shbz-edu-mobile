import { useEffect, useRef } from 'react';
import type { LayoutChangeEvent, ViewStyle } from 'react-native';
import {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type AnimatedStyle,
} from 'react-native-reanimated';

import { useTheme } from '@/theme';

import { easing } from './motion';

type Box = { x: number; y: number; width: number; height: number };

export type SlidingIndicator = {
  /** `onLayout` for the item at `index`. */
  onItemLayout: (index: number) => (event: LayoutChangeEvent) => void;
  /** Animated style of the absolutely positioned (top 0, left 0) indicator element. */
  indicatorStyle: AnimatedStyle<ViewStyle>;
};

/**
 * Sliding selection indicator of tab bars and segmented controls (spec §6.4). The selected fill is a
 * separate element that moves to the new item: transform + size, 260 ms spring ease. It jumps without
 * animation on first layout and on resize, and fades when nothing is active (`activeIndex < 0`).
 */
export function useSlidingIndicator(activeIndex: number): SlidingIndicator {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const boxes = useRef<(Box | undefined)[]>([]);
  const placed = useRef(false);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const width = useSharedValue(0);
  const height = useSharedValue(0);
  const opacity = useSharedValue(0);
  const { tabSlide, base } = theme.motion.duration;

  const place = (animate: boolean) => {
    const box = boxes.current[activeIndex];
    if (!box) {
      opacity.set(withTiming(0, { duration: reducedMotion ? 0 : base }));
      placed.current = false;
      return;
    }
    // Slide only between two real positions; appearing under a tab is a fade in place.
    const slide = animate && placed.current && !reducedMotion;
    const move = (value: number) =>
      slide ? withTiming(value, { duration: tabSlide, easing: easing('spring') }) : value;
    x.set(move(box.x));
    y.set(move(box.y));
    width.set(move(box.width));
    height.set(move(box.height));
    opacity.set(withTiming(1, { duration: reducedMotion || !animate ? 0 : base }));
    placed.current = true;
  };

  const latestPlace = useRef(place);
  useEffect(() => {
    latestPlace.current = place;
  });

  useEffect(() => {
    latestPlace.current(true);
  }, [activeIndex]);

  const onItemLayout = (index: number) => (event: LayoutChangeEvent) => {
    const { x: left, y: top, width: w, height: h } = event.nativeEvent.layout;
    const previous = boxes.current[index];
    boxes.current[index] = { x: left, y: top, width: w, height: h };
    const changed =
      !previous || previous.x !== left || previous.y !== top || previous.width !== w || previous.height !== h;
    if (index === activeIndex && changed) latestPlace.current(false);
  };

  const indicatorStyle = useAnimatedStyle(() => ({
    opacity: opacity.get(),
    width: width.get(),
    height: height.get(),
    transform: [{ translateX: x.get() }, { translateY: y.get() }],
  }));

  return { onItemLayout, indicatorStyle };
}
