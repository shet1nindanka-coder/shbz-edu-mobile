import { useEffect, useRef } from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';

import { makeStyles } from '@/theme';

import { Text } from './text';

export type CountBadgeProps = {
  count: number;
  /** Above this the badge shows `{max}+`. Default 9, as on the bell. */
  max?: number;
  style?: StyleProp<ViewStyle>;
};

/** Unread counter: red circle with a white number; hidden at 0, pops when the count grows. */
export function CountBadge({ count, max = 9, style }: CountBadgeProps) {
  const styles = useStyles();
  const scale = useSharedValue(1);
  const previous = useRef(count);

  useEffect(() => {
    if (count > previous.current) {
      scale.set(withSequence(withTiming(1.25, { duration: 120 }), withTiming(1, { duration: 120 })));
    }
    previous.current = count;
  }, [count, scale]);

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));

  if (count <= 0) return null;
  return (
    <Animated.View style={[styles.badge, animatedStyle, style]}>
      <Text variant="counter" color="onAccent" tabular numberOfLines={1}>
        {count > max ? `${max}+` : String(count)}
      </Text>
    </Animated.View>
  );
}

const useStyles = makeStyles((t) => ({
  badge: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: t.radii.full,
    backgroundColor: t.colors.dangerSolid,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
