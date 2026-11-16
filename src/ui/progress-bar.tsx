import { useEffect } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { makeStyles, useTheme } from '@/theme';

import { AccentGradient } from './accent-gradient';
import { easing } from './internal/motion';

export type ProgressBarProps = {
  /** 0–100; clamped. */
  value: number;
  /** Track height: `sm` 8 (default) · `md` 10 · `lg` 12. */
  size?: 'sm' | 'md' | 'lg';
  /** What the bar measures, for screen readers. */
  accessibilityLabel?: string;
  /** `linear` follows a real upload percentage (220 ms); default is the 420 ms spring ease. */
  transition?: 'spring' | 'linear';
  style?: StyleProp<ViewStyle>;
};

/** `completionPercent(done, total)` of the site: rounded percent, 0 when there is nothing to do. */
export function completionPercent(done: number, total: number): number {
  return total ? Math.round((done / total) * 100) : 0;
}

/** Progress bar (`.shbz-progress-track` / `-fill`): gradient fill growing on a soft track. */
export function ProgressBar({ value, size = 'sm', accessibilityLabel, transition = 'spring', style }: ProgressBarProps) {
  const theme = useTheme();
  const styles = useStyles();
  const reducedMotion = useReducedMotion();
  const clamped = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  const progress = useSharedValue(clamped);

  useEffect(() => {
    progress.set(
      withTiming(clamped, {
        duration: reducedMotion ? 0 : transition === 'linear' ? 220 : theme.motion.duration.progress,
        easing: easing(transition === 'linear' ? 'standard' : 'spring'),
      }),
    );
  }, [clamped, progress, reducedMotion, transition, theme]);

  const fillStyle = useAnimatedStyle(() => ({ width: `${progress.get()}%` }));

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped) }}
      style={[styles.track, { height: theme.sizes.progress[size] }, style]}
    >
      <Animated.View style={[styles.fillWrap, fillStyle]}>
        <AccentGradient style={styles.fill} />
      </Animated.View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  track: {
    alignSelf: 'stretch',
    borderRadius: t.radii.full,
    backgroundColor: t.colors.progressTrack,
    overflow: 'hidden',
  },
  fillWrap: { height: '100%', borderRadius: t.radii.full, overflow: 'hidden' },
  fill: { flex: 1 },
}));
