import { View } from 'react-native';

import { useTheme } from '@/theme';

export type DiamondMarkProps = {
  /** `done` — amber (every homework of the day is done); `late` — red (something is unfinished). */
  tone: 'done' | 'late';
};

/** The 9 × 9 rotated square that marks a day with deadlines (08 §5.20); also used in the legend. */
export function DiamondMark({ tone }: DiamondMarkProps) {
  const theme = useTheme();
  return (
    <View
      style={{
        width: 9,
        height: 9,
        borderRadius: theme.radii.mark,
        transform: [{ rotate: '45deg' }],
        backgroundColor: tone === 'late' ? theme.colors.calLateMark : theme.colors.calOkMark,
      }}
    />
  );
}
