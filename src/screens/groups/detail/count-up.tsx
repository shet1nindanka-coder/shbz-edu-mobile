import { useEffect, useState } from 'react';
import { useReducedMotion } from 'react-native-reanimated';

import type { ColorToken } from '@/theme';
import { Text, type TextProps } from '@/ui';

/** Duration of the site's `CountUpValue` (06 §5 "Client timers"). */
const COUNT_UP_MS = 600;

export type CountUpProps = {
  value: number;
  variant?: TextProps['variant'];
  color?: ColorToken;
};

/**
 * A number that counts up to its value in 600 ms with an ease-out curve, like the site's statistics
 * numbers. Under "reduce motion" it is plain text. Screen readers always get the final value.
 */
export function CountUp({ value, variant = 'cardTitle', color }: CountUpProps) {
  const reducedMotion = useReducedMotion();
  // Progress belongs to the value it was measured for: a new value starts again from zero.
  const [run, setRun] = useState({ target: value, progress: 0 });

  useEffect(() => {
    if (reducedMotion || value === 0) return;
    let frame = 0;
    const startedAt = Date.now();
    const tick = () => {
      const progress = Math.min(1, (Date.now() - startedAt) / COUNT_UP_MS);
      setRun({ target: value, progress });
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, reducedMotion]);

  const progress = reducedMotion ? 1 : run.target === value ? run.progress : 0;
  // easeOutCubic
  const shown = Math.round(value * (1 - Math.pow(1 - progress, 3)));

  return (
    <Text variant={variant} color={color} tabular accessibilityLabel={String(value)}>
      {shown}
    </Text>
  );
}
