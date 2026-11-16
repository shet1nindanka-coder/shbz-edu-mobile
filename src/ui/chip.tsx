import { View, type StyleProp, type ViewStyle } from 'react-native';

import { makeStyles, useTheme, type Theme } from '@/theme';

import { Icon, type IconName } from './icon';
import { Text } from './text';

export type ChipTone = 'green' | 'yellow' | 'red' | 'muted';

export type ChipProps = {
  label: string;
  /** Status tones are reserved for statuses and direct signals; use `muted` for everything else. */
  tone?: ChipTone;
  /** `row` = 44 high, radius 12 — sits in a row next to buttons. */
  size?: 'sm' | 'row';
  icon?: IconName;
  accessibilityLabel?: string;
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
    default:
      return { bg: t.colors.tabHover, text: t.colors.kicker };
  }
}

/** Borderless chip (`.shbz-chip`, `.shbz-badge-muted`): soft fill + status text, never wraps. */
export function Chip({ label, tone = 'muted', size = 'sm', icon, accessibilityLabel, style }: ChipProps) {
  const theme = useTheme();
  const styles = useStyles();
  const colors = chipColors(tone, theme);
  const row = size === 'row';
  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel ?? label}
      style={[styles.base, row ? styles.row : styles.sm, { backgroundColor: colors.bg }, style]}
    >
      {icon ? <Icon name={icon} size={row ? 16 : 13} tint={colors.text} /> : null}
      <Text
        variant={row ? 'smallStrong' : tone === 'muted' ? 'badgeMuted' : 'chip'}
        numberOfLines={1}
        style={{ color: colors.text }}
      >
        {label}
      </Text>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  base: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6 },
  sm: { paddingVertical: 6, paddingHorizontal: 13, borderRadius: t.radii.sm },
  row: { height: t.sizes.button, paddingHorizontal: 16, borderRadius: t.radii.md, justifyContent: 'center' },
}));
