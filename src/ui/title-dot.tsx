import { type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme';

import { AccentGradient } from './accent-gradient';

export type TitleDotProps = {
  /** 12 next to the display title (default), 10 next to a legacy title, 9 on login. */
  size?: number;
  style?: StyleProp<ViewStyle>;
};

/** The gradient dot that follows a page title (`.shbz-dot`). */
export function TitleDot({ size, style }: TitleDotProps) {
  const theme = useTheme();
  const diameter = size ?? theme.sizes.titleDot;
  return <AccentGradient style={[{ width: diameter, height: diameter, borderRadius: theme.radii.full }, style]} />;
}
