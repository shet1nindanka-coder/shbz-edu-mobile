import { useEffect } from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useTheme, type ColorToken } from '@/theme';

export type SpinnerProps = {
  /** Diameter: 14 inline in buttons, 20 in cards, 22 over an uploading file. */
  size?: number;
  color?: ColorToken;
  /** Raw colour (e.g. the label colour of the button it sits in). Wins over `color`. */
  tint?: string;
  /** Ring thickness; default 2 (2.5 for sizes ≥ 22). */
  thickness?: number;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

/** `.shbz-spinner`: a ring with a transparent top, rotating linearly (0.7 s per turn). */
export function Spinner({ size, color = 'accentSolid', tint, thickness, accessibilityLabel, style }: SpinnerProps) {
  const theme = useTheme();
  const diameter = size ?? theme.sizes.spinner;
  const ring = thickness ?? (diameter >= 22 ? 2.5 : 2);
  const resolved = tint ?? theme.colors[color];
  const rotation = useSharedValue(0);
  const duration = theme.motion.duration.spinner;

  useEffect(() => {
    rotation.set(withRepeat(withTiming(360, { duration, easing: Easing.linear }), -1, false));
    return () => cancelAnimation(rotation);
  }, [rotation, duration]);

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.get()}deg` }] }));

  return (
    <Animated.View
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityElementsHidden={!accessibilityLabel}
      importantForAccessibility={accessibilityLabel ? 'yes' : 'no-hide-descendants'}
      style={[
        {
          width: diameter,
          height: diameter,
          borderRadius: theme.radii.full,
          borderWidth: ring,
          borderColor: resolved,
          borderTopColor: 'transparent',
        },
        animatedStyle,
        style,
      ]}
    />
  );
}
