import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useTheme, type RadiusToken } from '@/theme';

import { absoluteFill } from './internal/layout';

export type SkeletonProps = {
  /** Same height as the content it replaces. Default 16. */
  height?: number;
  /** Number or percentage; default stretches to the container. */
  width?: DimensionValue;
  /** Same radius as the content: `full` for text pills (default), `lg` for cards, `md` for fields. */
  radius?: RadiusToken;
  /** Position among sibling skeletons: the shimmer of the 2nd and 3rd is delayed by 150 / 300 ms. */
  index?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * Loading placeholder (`.ui-skeleton`): a block of the content's own geometry with a shimmer band
 * sweeping left → right every 1.2 s. Reduced motion: a static block.
 */
export function Skeleton({ height = 16, width, radius = 'full', index = 0, style }: SkeletonProps) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const sweep = useSharedValue(0);
  const blockWidth = useSharedValue(0);
  const { shimmer, shimmerStagger } = theme.motion.duration;
  const wait = Math.min(Math.max(0, index), 2) * shimmerStagger;

  useEffect(() => {
    if (reducedMotion) return;
    sweep.set(withDelay(wait, withRepeat(withTiming(1, { duration: shimmer, easing: Easing.linear }), -1, false)));
    return () => cancelAnimation(sweep);
  }, [sweep, reducedMotion, shimmer, wait]);

  const bandStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: (sweep.get() * 2 - 1) * blockWidth.get() }],
  }));

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={(event) => blockWidth.set(event.nativeEvent.layout.width)}
      style={[
        {
          height,
          width,
          alignSelf: width === undefined ? 'stretch' : undefined,
          borderRadius: theme.radii[radius],
          backgroundColor: theme.colors.skeleton,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      {reducedMotion ? null : (
        <Animated.View style={[absoluteFill, bandStyle]}>
          <LinearGradient
            colors={[theme.colors.skeletonShineClear, theme.colors.skeletonShine, theme.colors.skeletonShineClear]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={{ flex: 1 }}
          />
        </Animated.View>
      )}
    </View>
  );
}
