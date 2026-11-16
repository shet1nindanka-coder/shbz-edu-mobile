import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

import { useTheme } from '@/theme';

export type AccentGradientProps = {
  /** 135° variant (avatar); default is the 90° brand gradient. */
  diagonal?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
};

/**
 * The brand gradient ("Мятный рассвет") as a view. It is the only accent of the design: primary button,
 * progress fill, title dot, nav-card band, focused input border, switch "on", avatar.
 */
export function AccentGradient({ diagonal = false, style, children }: AccentGradientProps) {
  const { gradients } = useTheme();
  const gradient = diagonal ? gradients.accentDiag : gradients.accent;
  return (
    <LinearGradient colors={gradient.colors} start={gradient.start} end={gradient.end} style={style}>
      {children}
    </LinearGradient>
  );
}
