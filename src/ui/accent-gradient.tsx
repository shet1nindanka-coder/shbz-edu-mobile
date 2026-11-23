import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

import { useTheme } from '@/theme';

export type AccentGradientProps = {
  /** 135° variant (avatar, icon tile); default is the 120° accent gradient. */
  diagonal?: boolean;
  /** 90° variant (progress fill). */
  flat?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
};

/**
 * The mint gradient (#5ac8ea → #36e0a4) as a view. It is the only accent of the design and is reserved
 * for the main action and for progress: primary button, progress fill, switch "on", avatar, icon tile.
 */
export function AccentGradient({ diagonal = false, flat = false, style, children }: AccentGradientProps) {
  const { gradients } = useTheme();
  const gradient = diagonal ? gradients.accentDiag : flat ? gradients.accentFlat : gradients.accent;
  return (
    <LinearGradient colors={gradient.colors} start={gradient.start} end={gradient.end} style={style}>
      {children}
    </LinearGradient>
  );
}
