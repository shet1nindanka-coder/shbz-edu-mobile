import { View, type StyleProp, type ViewStyle } from 'react-native';

import { makeStyles, useTheme } from '@/theme';

export type StatusCounts = {
  green: number;
  yellow: number;
  red: number;
  /** Not marked yet. */
  none: number;
};

export type StatusBarProps = {
  counts: StatusCounts;
  /** What the bar shows, for screen readers: «31 решил сам, 6 исправил, 4 нужна помощь, 9 не отмечено». */
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * Progress of a set of numbers by status (`.sb`): one 8-high round bar split into green, yellow, red and
 * the rest, in that order. It replaces a row of status chips: many numbers never widen the screen.
 */
export function StatusBar({ counts, accessibilityLabel, style }: StatusBarProps) {
  const theme = useTheme();
  const styles = useStyles();
  const parts = [
    { key: 'green', value: counts.green, color: theme.status.GREEN.solid },
    { key: 'yellow', value: counts.yellow, color: theme.status.YELLOW.solid },
    { key: 'red', value: counts.red, color: theme.status.RED.solid },
    { key: 'none', value: counts.none, color: 'transparent' },
  ].filter((part) => part.value > 0);
  return (
    <View
      accessible={Boolean(accessibilityLabel)}
      accessibilityRole={accessibilityLabel ? 'image' : undefined}
      accessibilityLabel={accessibilityLabel}
      style={[styles.bar, style]}
    >
      {parts.map((part) => (
        <View key={part.key} style={{ flexGrow: part.value, flexBasis: 0, backgroundColor: part.color }} />
      ))}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  bar: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    gap: t.space.xxxs,
    height: t.sizes.progress.sm,
    borderRadius: t.radii.full,
    backgroundColor: t.colors.soft2,
    overflow: 'hidden',
  },
}));
