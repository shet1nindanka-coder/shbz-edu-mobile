import { View, type StyleProp, type ViewStyle } from 'react-native';

import { makeStyles, useTheme, type StatusTone } from '@/theme';

import { Text } from './text';

export type BadgeTone = 'GREEN' | 'YELLOW' | 'RED' | 'none' | 'neutral' | 'count';

export type BadgeProps = {
  label: string;
  /**
   * `GREEN` / `YELLOW` / `RED` — status label: soft fill + status text.
   * `none` — the neutral "not marked" label.
   * `neutral` — ink outline (an active "not reached" result).
   * `count` — neutral counter.
   */
  tone?: BadgeTone;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

/** Small label (`.chip`): 28 high, radius 8, 12 / 600, one line. */
export function Badge({ label, tone = 'none', accessibilityLabel, style }: BadgeProps) {
  const theme = useTheme();
  const styles = useStyles();
  const palette =
    tone === 'count'
      ? { bg: theme.colors.soft2, text: theme.colors.label, border: 'transparent' }
      : theme.status[tone satisfies StatusTone];
  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel ?? label}
      style={[
        styles.base,
        { backgroundColor: palette.bg, borderColor: palette.border },
        style,
      ]}
    >
      <Text
        variant="badge"
        tabular={tone === 'count'}
        numberOfLines={1}
        style={{ color: palette.text }}
      >
        {label}
      </Text>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  base: {
    alignSelf: 'flex-start',
    // Never wider than its row: a long label ends in «…» (`numberOfLines={1}`) instead of overflowing.
    maxWidth: '100%',
    flexShrink: 1,
    minHeight: t.sizes.chip,
    justifyContent: 'center',
    paddingHorizontal: t.space.sm,
    borderRadius: t.radii.sm,
    borderWidth: t.borders.hairline,
  },
}));
