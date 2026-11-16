import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme';

import { AccentGradient } from '../accent-gradient';
import { absoluteFill } from './layout';

export type InputFrameProps = {
  focused: boolean;
  disabled?: boolean;
  /** Fixed height (single-line fields). */
  height?: number;
  /** Minimum height (multi-line fields). */
  minHeight?: number;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
};

/**
 * `.shbz-input` frame: 1.5px border, radius 12. On focus the border is replaced by a 1.5px gradient
 * border with no ring and no size change: the border is the frame's own background showing through a
 * 1.5px padding, and the gradient slides under it while focused.
 */
export function InputFrame({ focused, disabled = false, height, minHeight, style, children }: InputFrameProps) {
  const theme = useTheme();
  const width = theme.borders.interactive;
  return (
    <View
      style={[
        {
          height,
          minHeight,
          padding: width,
          borderRadius: theme.radii.md,
          backgroundColor: focused ? 'transparent' : theme.colors.inputBorder,
          opacity: disabled ? 0.55 : 1,
        },
        style,
      ]}
    >
      {focused ? <AccentGradient style={[absoluteFill, { borderRadius: theme.radii.md }]} /> : null}
      <View
        style={{
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          borderRadius: theme.radii.md - width,
          backgroundColor: theme.colors.inputBg,
          overflow: 'hidden',
        }}
      >
        {children}
      </View>
    </View>
  );
}
