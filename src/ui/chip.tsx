import { View, type StyleProp, type ViewStyle } from 'react-native';

import { makeStyles, useTheme, type Theme } from '@/theme';

import { Icon, type IconName } from './icon';
import { Text } from './text';

export type ChipTone = 'green' | 'yellow' | 'red' | 'muted' | 'streak' | 'accent';

export type ChipProps = {
  label: string;
  /**
   * A coloured chip only where attention is needed («просрочено», «нужна помощь»). A neutral fact
   * («37 из 50») is plain grey text, not a chip. `streak` is the «огонёк» counter, `accent` a numbered step.
   */
  tone?: ChipTone;
  /** `sm` = 28 high, radius 8 (default); `row` = 44 high, radius 12 — sits in a row next to buttons. */
  size?: 'sm' | 'row';
  icon?: IconName;
  accessibilityLabel?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

export function chipColors(tone: ChipTone, t: Theme): { bg: string; text: string } {
  switch (tone) {
    case 'green':
      return { bg: t.colors.greenSoft, text: t.colors.greenText };
    case 'yellow':
      return { bg: t.colors.yellowSoft, text: t.colors.yellowText };
    case 'red':
      return { bg: t.colors.redSoft, text: t.colors.redText };
    case 'streak':
      return { bg: t.colors.streakBgStart, text: t.colors.streakText };
    case 'accent':
      return { bg: t.gradients.accentMid, text: t.colors.onAccent };
    default:
      return { bg: t.colors.soft2, text: t.colors.label };
  }
}

/** Borderless chip (`.chip`): 28 high, radius 8, 12 / 600, soft fill + status text; never wraps — a label longer than the row is cut with «…». */
export function Chip({ label, tone = 'muted', size = 'sm', icon, accessibilityLabel, testID, style }: ChipProps) {
  const theme = useTheme();
  const styles = useStyles();
  const colors = chipColors(tone, theme);
  const row = size === 'row';
  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel ?? label}
      testID={testID}
      style={[styles.base, row ? styles.row : styles.sm, { backgroundColor: colors.bg }, style]}
    >
      {icon ? <Icon name={icon} size={16} tint={tone === 'streak' ? theme.colors.streakFlame : colors.text} /> : null}
      <Text
        variant={row ? 'smallStrong' : 'chip'}
        numberOfLines={1}
        style={[styles.label, { color: colors.text }]}
      >
        {label}
      </Text>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  // Never wider than its row: a long label (a 60-character journal action) ends in «…» inside the row
  // instead of running past the screen edge. The icon keeps its size; only the label gives way.
  base: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: t.space.xxs, maxWidth: '100%', flexShrink: 1 },
  label: { flexShrink: 1, minWidth: 0 },
  sm: { minHeight: t.sizes.chip, paddingHorizontal: t.space.sm, borderRadius: t.radii.sm, justifyContent: 'center' },
  row: { height: t.sizes.button, paddingHorizontal: t.space.lg, gap: t.space.sm, borderRadius: t.radii.md, justifyContent: 'center' },
}));
