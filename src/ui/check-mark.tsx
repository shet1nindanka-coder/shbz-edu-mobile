import { useEffect } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { makeStyles, useTheme } from '@/theme';

import { easing } from './internal/motion';

export type CheckMarkProps = {
  checked: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * The non-interactive checkbox glyph (`.shbz-check-mark`): 22px box, radius 7; the white tick pops in
 * with an overshoot. Use it inside rows and cards that toggle as a whole.
 */
export function CheckMark({ checked, disabled = false, style }: CheckMarkProps) {
  const theme = useTheme();
  const styles = useStyles();
  const reducedMotion = useReducedMotion();
  const progress = useSharedValue(checked ? 1 : 0);

  useEffect(() => {
    progress.set(
      checked && !reducedMotion
        ? withTiming(1, { duration: theme.motion.duration.checkPop, easing: easing('overshoot') })
        : withTiming(checked ? 1 : 0, { duration: reducedMotion ? 0 : theme.motion.duration.fast }),
    );
  }, [checked, progress, reducedMotion, theme]);

  const tickStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, progress.get()),
    transform: [{ scale: 0.4 + 0.6 * progress.get() }],
  }));

  return (
    <View style={[styles.box, checked ? styles.boxChecked : null, disabled ? styles.disabled : null, style]}>
      <Animated.View style={tickStyle}>
        <Svg width={13} height={13} viewBox="0 0 12 12">
          <Path
            d="M2.2 6.4 4.9 9 9.8 3.4"
            stroke={theme.colors.onAccent}
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </Svg>
      </Animated.View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  box: {
    width: t.sizes.checkbox,
    height: t.sizes.checkbox,
    borderRadius: t.radii.checkbox,
    borderWidth: t.borders.strong,
    borderColor: t.colors.inputBorder,
    backgroundColor: t.colors.inputBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxChecked: { borderColor: t.colors.accentSolid, backgroundColor: t.colors.accentSolid },
  disabled: { opacity: 0.5 },
}));
