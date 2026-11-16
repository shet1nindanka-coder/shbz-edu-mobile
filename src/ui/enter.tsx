import { useEffect, type ReactNode } from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '@/theme';

import { easing } from './internal/motion';

export type EnterProps = {
  /** Position in the cascade: the delay is `index × 45 ms`, capped at index 6. */
  index?: number;
  /** Extra delay (a nested cascade adds 120 ms). */
  delay?: number;
  /** Duration; default 240 ms (260 for empty states, 180 under tabs). */
  duration?: number;
  /** Vertical travel; default 10. */
  offset?: number;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
};

/**
 * Entry animation of the site's `.ui-enter` cascade: opacity 0 → 1 and translateY 10 → 0. Under reduced
 * motion the content is simply shown.
 */
export function Enter({ index = 0, delay = 0, duration, offset = 10, style, children }: EnterProps) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const progress = useSharedValue(reducedMotion ? 1 : 0);
  const { enter, enterStagger, enterMaxIndex } = theme.motion.duration;
  const wait = delay + Math.min(Math.max(0, index), enterMaxIndex) * enterStagger;
  const length = duration ?? enter;

  useEffect(() => {
    progress.set(withDelay(wait, withTiming(1, { duration: length, easing: easing('spring') })));
  }, [progress, wait, length]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.get(),
    transform: [{ translateY: (1 - progress.get()) * offset }],
  }));

  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
}
