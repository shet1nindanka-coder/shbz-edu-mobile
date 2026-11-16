import type { ReactNode } from 'react';
import { View, type GestureResponderEvent, type StyleProp, type ViewStyle } from 'react-native';

import { makeStyles, useTheme } from '@/theme';

import { absoluteFill } from './internal/layout';
import { PressableScale } from './internal/pressable-scale';

export type CardVariant = 'card' | 'surface' | 'soft' | 'panel' | 'outline';

export type CardProps = {
  /**
   * `card` — `.shbz-card`: white, hairline, the wide soft shadow (default).
   * `surface` — the legacy surface: same, lighter shadow (state shells, file cards).
   * `soft` — nested soft panel: tone + hairline, no shadow.
   * `panel` — week/calendar panel tone, no shadow.
   * `outline` — card fill with a soft hairline and no shadow (number cards).
   * Two floors only: page → card → soft panel. Never nest a third level.
   */
  variant?: CardVariant;
  /** Inner padding: `true` = 18 (20 for soft panels), a number, or `false` for none. Default `true`. */
  padded?: boolean | number;
  /** Dashed hairline: an invitation / empty state. Becomes solid once there is content. */
  dashed?: boolean;
  /** 2px accent ring (selected number card). */
  selected?: boolean;
  /** Makes the whole card a button with the system press feedback. */
  onPress?: (event: GestureResponderEvent) => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
};

/** Surface container. Shadows separate a card from the page; they never mean "pressable". */
export function Card({
  variant = 'card',
  padded = true,
  dashed = false,
  selected = false,
  onPress,
  disabled = false,
  accessibilityLabel,
  accessibilityHint,
  testID,
  style,
  children,
}: CardProps) {
  const theme = useTheme();
  const styles = useStyles();
  const padding =
    padded === true ? (variant === 'soft' || variant === 'panel' ? theme.space.lg : theme.space.card) : padded || 0;
  const composed: StyleProp<ViewStyle> = [
    styles.base,
    styles[variant],
    variant === 'card' ? theme.shadows.card : variant === 'surface' ? theme.shadows.surface : null,
    dashed ? styles.dashed : null,
    { padding },
    style,
  ];
  const ring = selected ? <View style={styles.ring} /> : null;

  if (onPress) {
    return (
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled, selected }}
        disabled={disabled}
        onPress={onPress}
        testID={testID}
        style={[composed, disabled ? styles.disabled : null]}
      >
        {children}
        {ring}
      </PressableScale>
    );
  }
  return (
    <View accessibilityLabel={accessibilityLabel} testID={testID} style={composed}>
      {children}
      {ring}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  base: { borderRadius: t.radii.lg, borderWidth: t.borders.hairline },
  card: { backgroundColor: t.colors.cardBg, borderColor: t.colors.cardBorder },
  surface: { backgroundColor: t.colors.cardBg, borderColor: t.colors.cardBorder },
  soft: { backgroundColor: t.colors.softBg, borderColor: t.colors.softBorder },
  panel: { backgroundColor: t.colors.panelBg, borderColor: t.colors.softBorder },
  outline: { backgroundColor: t.colors.cardBg, borderColor: t.colors.softBorder },
  dashed: { borderStyle: 'dashed' },
  ring: {
    ...absoluteFill,
    margin: -t.borders.hairline,
    borderRadius: t.radii.lg,
    borderWidth: t.borders.strong,
    borderColor: t.colors.accentSolid,
    pointerEvents: 'none',
  },
  disabled: { opacity: 0.55 },
}));
