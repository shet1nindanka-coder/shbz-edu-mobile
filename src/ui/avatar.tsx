import { type StyleProp, type ViewStyle } from 'react-native';

import { initialsOf, useTheme } from '@/theme';

import { AccentGradient } from './accent-gradient';
import { Text } from './text';

export type AvatarProps = {
  /** Full name; the avatar shows the first letters of its first two words (`?` when empty). */
  name: string;
  /** Diameter; default 42. */
  size?: number;
  style?: StyleProp<ViewStyle>;
};

/** Initials on the diagonal brand gradient (`.shbz-avatar`). Decorative: the name is shown next to it. */
export function Avatar({ name, size, style }: AvatarProps) {
  const theme = useTheme();
  const diameter = size ?? theme.sizes.avatar;
  const fontSize = Math.round((diameter / theme.sizes.avatar) * theme.typography.avatar.fontSize);
  return (
    <AccentGradient
      diagonal
      style={[
        {
          width: diameter,
          height: diameter,
          borderRadius: theme.radii.full,
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      <Text
        variant="avatar"
        color="onAccent"
        accessibilityElementsHidden
        importantForAccessibility="no"
        style={{ fontSize, lineHeight: Math.round(fontSize * 1.3) }}
      >
        {initialsOf(name)}
      </Text>
    </AccentGradient>
  );
}
