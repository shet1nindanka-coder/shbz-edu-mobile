import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { format, plural, useI18n } from '@/i18n';
import { makeStyles, streakColorMeta, streakPalette, useTheme } from '@/theme';
import { Icon, Text } from '@/ui';

import { hexWithAlpha, streakMotionKind } from './streak-model';

export type StreakHeroProps = {
  currentStreak: number;
  /** «3 дня подряд» / «Зажгите первый день». */
  headline: string;
  testID?: string;
};

/** Fractions of the 900 ms run at which the site's keyframes sit. */
const FLAME_STOPS = [0, 0.3, 0.6, 1];
/** The counter's pop lasts 700 of the 900 ms. */
const COUNT_STOPS = [0, 0.27, 0.78, 1];
const SHAKE_STEP_MS = 100;
/** Both glows peak at 40 % of the run and are gone at its end (08 §6.5 A05). */
const GLOW_STOPS = [0, 0.4, 1];

/**
 * Streak hero (08 §5.19): the tier-tinted gradient card with the «Огонёк» kicker, the counter pill and
 * the headline. The only loud animation of the app (08 §6.5 A05) plays when the counter really changes
 * while the screen is open: `ignite` / `grow` pop the flame, the counter and the card and light an orange
 * glow behind the flame and around the card; `drop` shakes the pill. Nothing moves under reduced motion.
 *
 * The glows are separate layers whose opacity is animated: a shadow is the same style on every platform,
 * while an animated shadow (or a `drop-shadow` filter, which iOS lacks) is not.
 */
export function StreakHero({ currentStreak, headline, testID }: StreakHeroProps) {
  const theme = useTheme();
  const styles = useStyles();
  const { locale, dict } = useI18n();
  const weekly = dict.student.weekly;
  const reducedMotion = useReducedMotion();
  const palette = streakPalette(streakColorMeta(currentStreak).tier, theme.colors);

  const pop = useSharedValue(0);
  const shake = useSharedValue(0);
  const previous = useRef(currentStreak);
  const duration = theme.motion.duration.streak;

  useEffect(() => {
    const kind = streakMotionKind(previous.current, currentStreak);
    previous.current = currentStreak;
    if (kind === null || reducedMotion) return;
    if (kind === 'drop') {
      const step = { duration: SHAKE_STEP_MS, easing: Easing.inOut(Easing.quad) };
      shake.set(withSequence(withTiming(-3, step), withTiming(3, step), withTiming(-3, step), withTiming(3, step), withTiming(0, step)));
      return;
    }
    pop.set(0);
    pop.set(withTiming(1, { duration, easing: Easing.linear }));
  }, [currentStreak, reducedMotion, pop, shake, duration]);

  const heroStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(pop.get(), [0, 0.4, 1], [1, 1.015, 1]) }],
  }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: interpolate(pop.get(), GLOW_STOPS, [0, 1, 0]) }));
  const pillStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.get() }] }));
  const flameStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: interpolate(pop.get(), FLAME_STOPS, [1, 1.45, 0.92, 1]) },
      { rotate: `${interpolate(pop.get(), FLAME_STOPS, [0, -8, 5, 0])}deg` },
    ],
  }));
  const countStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(pop.get(), COUNT_STOPS, [0, -3, 0, 0]) },
      { scale: interpolate(pop.get(), COUNT_STOPS, [1, 1.18, 1, 1]) },
    ],
  }));

  return (
    <Animated.View style={heroStyle} testID={testID}>
      <Animated.View pointerEvents="none" style={[styles.heroGlow, glowStyle]} />
      <LinearGradient
        colors={[palette.bgStart, palette.bgEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.hero, { borderColor: palette.border }]}
      >
        <View style={styles.top}>
          <Text variant="kickerSm" style={{ color: palette.text }}>
            {weekly.flame}
          </Text>
          <Animated.View
            accessible
            accessibilityLabel={`${weekly.flame}: ${plural(locale, currentStreak, weekly.dayForms)}`}
            style={[styles.pill, pillStyle]}
          >
            <Animated.View style={[styles.flame, flameStyle]}>
              <Animated.View pointerEvents="none" style={[styles.flameGlow, glowStyle]} />
              <Icon name="flame" size={13} tint={palette.flame} />
            </Animated.View>
            <Animated.View style={countStyle}>
              <Text variant="chip" tabular numberOfLines={1} style={[styles.count, { color: palette.text }]}>
                {format(weekly.daysShort, { n: currentStreak })}
              </Text>
            </Animated.View>
          </Animated.View>
        </View>
        <Text variant="streakHeadline" accessibilityRole="header">
          {headline}
        </Text>
      </LinearGradient>
    </Animated.View>
  );
}

const useStyles = makeStyles((t) => ({
  hero: {
    borderRadius: t.radii.lg,
    borderWidth: t.borders.hairline,
    paddingHorizontal: t.space.lg,
    paddingVertical: t.space.field,
    gap: t.space.md,
  },
  top: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: t.space.md },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space.xs,
    borderRadius: t.radii.sm,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: t.colors.streakPillBg,
  },
  count: { fontFamily: t.fonts.extrabold },
  // The site's `0 8px 30px rgba(242,146,46,.35)` around the card: the layer lies under the gradient, so
  // only its shadow is seen.
  heroGlow: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: t.radii.lg,
    boxShadow: `0 8px 30px ${hexWithAlpha(t.colors.streakFlame, 0.35)}`,
  },
  flame: { alignItems: 'center', justifyContent: 'center' },
  // The site's `drop-shadow(0 0 10px rgba(242,146,46,.85))` of the flame: a halo spreading from a dot
  // behind the icon.
  flameGlow: {
    position: 'absolute',
    width: 5,
    height: 5,
    borderRadius: t.radii.full,
    boxShadow: `0 0 10px 4px ${hexWithAlpha(t.colors.streakFlame, 0.85)}`,
  },
}));
