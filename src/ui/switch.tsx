import { useEffect } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { makeStyles, useTheme } from '@/theme';

import { AccentGradient } from './accent-gradient';
import { absoluteFill } from './internal/layout';
import { easing } from './internal/motion';
import { hitSlopFor, PressableScale } from './internal/pressable-scale';
import { Text } from './text';

export type SwitchProps = {
  value: boolean;
  onValueChange?: (value: boolean) => void;
  /** Title next to the switch (14/600). */
  label?: string;
  /** Sub-line under the title (12, muted). */
  description?: string;
  /** Put the switch at the trailing edge and let the label fill the row (settings lists). */
  trailing?: boolean;
  disabled?: boolean;
  /** Required when there is no `label`. */
  accessibilityLabel?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

/** Switch (`.shbz-switch`): 46 × 26 track, gradient when on, 200 ms knob travel. The whole row toggles. */
export function Switch({
  value,
  onValueChange,
  label,
  description,
  trailing = false,
  disabled = false,
  accessibilityLabel,
  testID,
  style,
}: SwitchProps) {
  const theme = useTheme();
  const styles = useStyles();
  const reducedMotion = useReducedMotion();
  const progress = useSharedValue(value ? 1 : 0);
  const { switchTrack, switchKnobTravel } = theme.sizes;

  useEffect(() => {
    progress.set(
      withTiming(value ? 1 : 0, { duration: reducedMotion ? 0 : theme.motion.duration.slow, easing: easing('inOut') }),
    );
  }, [value, progress, reducedMotion, theme]);

  const knobStyle = useAnimatedStyle(() => ({ transform: [{ translateX: progress.get() * switchKnobTravel }] }));
  const onStyle = useAnimatedStyle(() => ({ opacity: progress.get() }));

  const track = (
    <View style={styles.track}>
      <View style={styles.trackOff} />
      <Animated.View style={[absoluteFill, onStyle]}>
        <AccentGradient style={styles.trackOn} />
      </Animated.View>
      <Animated.View style={[styles.knob, theme.shadows.knob, knobStyle]} />
    </View>
  );
  const hasText = Boolean(label || description);

  return (
    <PressableScale
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={label ? description : undefined}
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={() => onValueChange?.(!value)}
      scaleTo={1}
      hitSlop={hasText ? undefined : hitSlopFor(switchTrack.width, switchTrack.height)}
      testID={testID}
      style={[styles.row, hasText ? styles.rowText : styles.bare, disabled ? styles.disabled : null, style]}
    >
      {trailing ? null : track}
      {hasText ? (
        <View style={styles.texts}>
          {label ? <Text variant="bodyStrong">{label}</Text> : null}
          {description ? <Text variant="caption">{description}</Text> : null}
        </View>
      ) : null}
      {trailing ? track : null}
    </PressableScale>
  );
}

const useStyles = makeStyles((t) => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: t.space.md, borderRadius: t.radii.md },
  rowText: { minHeight: t.sizes.minTouch },
  bare: { alignSelf: 'flex-start' },
  texts: { flex: 1, minWidth: 0, gap: t.space.xxxs },
  track: { width: t.sizes.switchTrack.width, height: t.sizes.switchTrack.height },
  trackOff: {
    ...absoluteFill,
    borderRadius: t.radii.full,
    backgroundColor: t.colors.switchOff,
  },
  trackOn: { flex: 1, borderRadius: t.radii.full },
  knob: {
    position: 'absolute',
    top: (t.sizes.switchTrack.height - t.sizes.switchKnob) / 2,
    left: t.sizes.switchKnobOffset,
    width: t.sizes.switchKnob,
    height: t.sizes.switchKnob,
    borderRadius: t.radii.full,
    backgroundColor: t.colors.switchKnob,
  },
  disabled: { opacity: 0.5 },
}));
