import { Easing, type EasingFunctionFactory } from 'react-native-reanimated';

import { motion, type EasingToken } from '@/theme';

const cache = new Map<EasingToken, EasingFunctionFactory>();

/** Reanimated easing for a motion token (`motion.easing.*` are CSS cubic-bezier control points). */
export function easing(token: EasingToken): EasingFunctionFactory {
  let fn = cache.get(token);
  if (!fn) {
    const [x1, y1, x2, y2] = motion.easing[token];
    fn = Easing.bezier(x1, y1, x2, y2);
    cache.set(token, fn);
  }
  return fn;
}
