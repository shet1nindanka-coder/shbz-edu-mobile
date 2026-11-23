import { View, type StyleProp, type ViewStyle } from 'react-native';

import { initialsOf, useTheme } from '@/theme';

import { AccentGradient } from './accent-gradient';
import { Text } from './text';

export type AvatarProps = {
  /** Full name; the avatar shows the first letters of its first two words (`?` when empty). */
  name: string;
  /**
   * `accent` — the mint gradient: the signed-in user (header 44, profile 52) and the person a screen is
   * about. `neutral` — grey, 36: people in a list. Default `accent`.
   */
  tone?: 'accent' | 'neutral';
  /** Diameter: 36 (lists), 44 (header) or 52 (profile). Default 44, or 36 for `neutral`. */
  size?: number;
  style?: StyleProp<ViewStyle>;
};

/** Initials in a circle (`.av` / `.sa`). Decorative: the name is shown next to it. */
export function Avatar({ name, tone = 'accent', size, style }: AvatarProps) {
  const theme = useTheme();
  const diameter = size ?? (tone === 'neutral' ? theme.sizes.avatarSm : theme.sizes.avatar);
  const box = { width: diameter, height: diameter, borderRadius: theme.radii.full, alignItems: 'center', justifyContent: 'center' } as const;
  const large = diameter >= theme.sizes.avatarLg;
  if (tone === 'neutral') {
    return (
      <View style={[box, { backgroundColor: theme.colors.soft2 }, style]}>
        <Text variant={diameter > theme.sizes.avatarSm ? 'avatar' : 'avatarSm'} color="textStrong" accessibilityElementsHidden importantForAccessibility="no">
          {initialsOf(name)}
        </Text>
      </View>
    );
  }
  return (
    <AccentGradient diagonal style={[box, style]}>
      <Text
        variant={diameter <= theme.sizes.avatarSm ? 'avatarSm' : 'avatar'}
        color="onAccent"
        accessibilityElementsHidden
        importantForAccessibility="no"
        style={large ? { fontSize: theme.typography.cardTitle.fontSize, lineHeight: theme.typography.cardTitle.lineHeight } : null}
      >
        {initialsOf(name)}
      </Text>
    </AccentGradient>
  );
}
