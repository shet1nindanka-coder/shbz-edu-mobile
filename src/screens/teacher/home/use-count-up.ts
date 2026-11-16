import { useEffect, useState } from 'react';
import { useReducedMotion } from 'react-native-reanimated';

import { useTheme } from '@/theme';

import { countUpFrame } from './home-cards';

/**
 * A server statistic "counts up" to its value when it arrives or changes (site: `CountUpValue`, A04):
 * one animation-frame loop per number, 600 ms, ease-out. Under reduced motion the number is just shown.
 */
export function useCountUp(target: number): number {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const duration = theme.motion.duration.countUp;
  // The frame remembers which target it belongs to: a new target starts from zero without an extra render.
  const [frame, setFrame] = useState<{ target: number; value: number } | null>(null);

  useEffect(() => {
    if (reducedMotion) return;
    let handle = 0;
    let start: number | null = null;
    const step = (time: number) => {
      if (start === null) start = time;
      const progress = (time - start) / duration;
      setFrame({ target, value: countUpFrame(target, progress) });
      if (progress < 1) handle = requestAnimationFrame(step);
    };
    handle = requestAnimationFrame(step);
    return () => cancelAnimationFrame(handle);
  }, [target, duration, reducedMotion]);

  if (reducedMotion) return target;
  return frame && frame.target === target ? frame.value : 0;
}
