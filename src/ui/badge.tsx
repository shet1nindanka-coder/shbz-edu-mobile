import { View, type StyleProp, type ViewStyle } from 'react-native';

import { makeStyles, useTheme, type StatusTone } from '@/theme';

import { Text } from './text';

export type BadgeTone = 'GREEN' | 'YELLOW' | 'RED' | 'none' | 'neutral' | 'count';

export type BadgeProps = {
  label: string;
  /**
   * `GREEN` / `YELLOW` / `RED` — bordered status surface (radius 12, 12/500).
   * `none` — the borderless "not marked" badge (radius 8, 12/600).
   * `neutral` — ink outline (an active "not reached" result).
   * `count` — soft hairline counter chip.
   */
  tone?: BadgeTone;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

/** Small label (`Badge`): 28 high, one line. */
export function Badge({ label, tone = 'none', accessibilityLabel, style }: BadgeProps) {
  const theme = useTheme();
  const styles = useStyles();
  const palette =
    tone === 'count'
      ? { bg: theme.colors.softBg, text: theme.colors.textMuted, border: theme.colors.softBorder }
      : theme.status[tone satisfies StatusTone];
  const soft = tone === 'none';
  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel ?? label}
      style={[
        styles.base,
        soft ? styles.soft : styles.bordered,
        { backgroundColor: palette.bg, borderColor: palette.border },
        style,
      ]}
    >
      <Text
        variant={soft ? 'badgeStrong' : 'badge'}
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
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderWidth: t.borders.hairline,
  },
  bordered: { borderRadius: t.radii.md },
  soft: { borderRadius: t.radii.sm },
}));
