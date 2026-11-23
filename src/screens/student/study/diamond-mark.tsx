import { View } from 'react-native';

import { useTheme } from '@/theme';

export type DiamondMarkProps = {
  /**
   * `done` — every homework of the day is done (green); `due` — something is still to do and the day has
   * not passed (yellow); `late` — something is unfinished and the day has passed (red).
   */
  tone: 'done' | 'due' | 'late';
};

/** The mark of a day with deadlines (`.ev`): a 4-high round bar in the status colour; also used in the legend. */
export function DiamondMark({ tone }: DiamondMarkProps) {
  const theme = useTheme();
  const color = tone === 'late' ? theme.status.RED.solid : tone === 'due' ? theme.status.YELLOW.solid : theme.status.GREEN.solid;
  return <View style={{ width: theme.sizes.icon.md, height: theme.space.xxs, borderRadius: theme.radii.full, backgroundColor: color }} />;
}
