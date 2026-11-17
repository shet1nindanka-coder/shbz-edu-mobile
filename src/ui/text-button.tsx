import { type StyleProp, type ViewStyle } from 'react-native';

import { useTheme, type ColorToken, type TextVariant } from '@/theme';

import { PressableScale } from './internal/pressable-scale';
import { usePressGuard, type GuardedPress } from './internal/press-guard';
import { Text } from './text';

export type TextButtonTone = 'accent' | 'danger' | 'soft' | 'muted';

export type TextButtonProps = {
  label: string;
  /**
   * A second press is ignored until the first one has been handled (the next macrotask), or — when the
   * handler returns a promise (`() => mutation.mutateAsync(…)`) — until that promise settles.
   */
  onPress?: GuardedPress;
  /** `accent` ("Сегодня", "Прочитать все") · `danger` ("Очистить") · `soft` (show/hide password) · `muted` (back link). */
  tone?: TextButtonTone;
  /** Typography role; default `link` (13/600). */
  variant?: TextVariant;
  disabled?: boolean;
  accessibilityLabel?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

const TONE: Record<TextButtonTone, ColorToken> = {
  accent: 'accentSolid',
  danger: 'dangerSolid',
  soft: 'textSoft',
  muted: 'textMuted',
};

/** Inline text link button. Feedback is opacity, not scale; the hit area is padded to 44pt. */
export function TextButton({
  label,
  onPress,
  tone = 'accent',
  variant = 'link',
  disabled = false,
  accessibilityLabel,
  testID,
  style,
}: TextButtonProps) {
  const theme = useTheme();
  const guardedPress = usePressGuard(onPress);
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={guardedPress}
      scaleTo={1}
      hitSlop={{ top: 13, bottom: 13, left: 8, right: 8 }}
      testID={testID}
      style={[{ borderRadius: theme.radii.sm }, disabled ? { opacity: 0.45 } : null, style]}
      pressedStyle={{ opacity: 0.6 }}
    >
      <Text variant={variant} color={TONE[tone]} numberOfLines={1}>
        {label}
      </Text>
    </PressableScale>
  );
}
