import { View } from 'react-native';

import { makeStyles, useTheme } from '@/theme';
import { Text } from '@/ui';

import type { DayMarkTone } from './deadline-model';

export type DayMarksProps = {
  /** One short bar per homework of the day, the most urgent first. */
  marks: readonly DayMarkTone[];
  /** Homeworks that got no bar of their own: «+N» after the bars. */
  more: number;
};

/**
 * The marks under a day number of the calendar: a short bar per homework — red when it is overdue, ink
 * while it is still to hand in, pale once it is done. The row keeps its height on an empty day, so every
 * number of a week stands on one line.
 */
export function DayMarks({ marks, more }: DayMarksProps) {
  const theme = useTheme();
  const styles = useStyles();
  const color: Record<DayMarkTone, string> = { late: theme.status.RED.solid, due: theme.colors.textStrong, done: theme.colors.line2 };
  return (
    <View style={styles.row}>
      {marks.map((tone, index) => (
        <View key={index} style={[styles.bar, { backgroundColor: color[tone] }]} />
      ))}
      {more > 0 ? (
        <Text variant="dock" color="textMuted" tabular numberOfLines={1}>
          +{more}
        </Text>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  row: { height: t.typography.dock.lineHeight, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: t.space.xxxs },
  bar: { width: t.space.md, height: t.space.xxs, borderRadius: t.radii.full },
}));
