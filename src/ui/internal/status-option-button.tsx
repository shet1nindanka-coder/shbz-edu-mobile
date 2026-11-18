import { useEffect } from 'react';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { makeStyles, useTheme, type HomeworkNumberStatus } from '@/theme';

import { Text } from '../text';
import { easing } from './motion';
import { PressableScale } from './pressable-scale';

export type StatusOptionButtonProps = {
  label: string;
  /** Accessible name; default: `label`. */
  accessibilityLabel?: string;
  /** Style while active: a traffic-light status, or `neutral` (ink outline). */
  tone: HomeworkNumberStatus | 'neutral';
  active: boolean;
  size: 'lg' | 'md';
  basis: `${number}%`;
  disabled: boolean;
  onPress: () => void;
};

/** One button of `StatusOptionGroup`; plays the "stamp" when it becomes active. */
export function StatusOptionButton({
  label,
  accessibilityLabel,
  tone,
  active,
  size,
  basis,
  disabled,
  onPress,
}: StatusOptionButtonProps) {
  const theme = useTheme();
  const styles = useStyles();
  const reducedMotion = useReducedMotion();
  const stamp = useSharedValue(1);
  const palette = theme.status[active ? tone : 'idle'];

  // The "stamp": only when the option becomes active.
  useEffect(() => {
    if (!active || reducedMotion) return;
    const duration = theme.motion.duration.statusStamp;
    stamp.set(
      withSequence(
        withTiming(0.94, { duration: 0 }),
        withTiming(1.03, { duration: duration * 0.6, easing: easing('spring') }),
        withTiming(1, { duration: duration * 0.4, easing: easing('spring') }),
      ),
    );
  }, [active, reducedMotion, stamp, theme]);

  const stampStyle = useAnimatedStyle(() => ({ transform: [{ scale: stamp.get() }] }));

  return (
    <Animated.View style={[{ flexBasis: basis, flexGrow: 1 }, stampStyle]}>
      <PressableScale
        accessibilityRole="radio"
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityState={{ checked: active, disabled }}
        disabled={disabled}
        onPress={onPress}
        style={[styles.option, { backgroundColor: palette.bg, borderColor: palette.border }]}
      >
        <Text
          variant={size === 'lg' ? 'segment' : 'captionStrong'}
          align="center"
          numberOfLines={2}
          style={{ color: palette.text }}
        >
          {label}
        </Text>
      </PressableScale>
    </Animated.View>
  );
}

const useStyles = makeStyles((t) => ({
  option: {
    flex: 1,
    minHeight: t.sizes.minTouch,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: t.radii.md,
    borderWidth: t.borders.hairline,
  },
}));
