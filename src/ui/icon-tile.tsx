import { View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme';

import { AccentGradient } from './accent-gradient';
import { Icon, type IconName } from './icon';

export type IconTileProps = {
  icon: IconName;
  /** `accent` — the mint gradient (the one thing a screen is about); `quiet` — neutral. Default `accent`. */
  tone?: 'accent' | 'quiet';
  style?: StyleProp<ViewStyle>;
};

/** Icon tile (`.it`): 44 square, radius 12, a 24 icon — the leading mark of the main card of a screen. */
export function IconTile({ icon, tone = 'accent', style }: IconTileProps) {
  const theme = useTheme();
  const box = {
    width: theme.sizes.tile,
    height: theme.sizes.tile,
    borderRadius: theme.radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  } as const;
  if (tone === 'quiet') {
    return (
      <View style={[box, { backgroundColor: theme.colors.soft2 }, style]}>
        <Icon name={icon} size={theme.sizes.icon.lg} color="label" />
      </View>
    );
  }
  return (
    <AccentGradient diagonal style={[box, style]}>
      <Icon name={icon} size={theme.sizes.icon.lg} color="onAccent" />
    </AccentGradient>
  );
}
