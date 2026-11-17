import { View, type StyleProp, type ViewStyle } from 'react-native';

import { makeStyles, useTheme, type TextVariant, type Theme } from '@/theme';

import { AccentGradient } from './accent-gradient';
import { Icon, type IconName } from './icon';
import { absoluteFill } from './internal/layout';
import { hitSlopFor, PressableScale } from './internal/pressable-scale';
import { usePressGuard, type GuardedPress } from './internal/press-guard';
import { Spinner } from './spinner';
import { Text } from './text';

export type ButtonVariant = 'primary' | 'outline' | 'dark' | 'danger' | 'dangerSolid' | 'tonal';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'field';

export type ButtonProps = {
  label: string;
  /**
   * A second press is ignored until the first one has been handled (the next macrotask), or — when the
   * handler returns a promise (`() => mutation.mutateAsync(…)`) — until that promise settles.
   */
  onPress?: GuardedPress;
  /** Default `primary`. Never place two gradient (primary) buttons next to each other. */
  variant?: ButtonVariant;
  /** `sm` 36 · `md` 44 (default) · `lg` 48 · `field` 52 (pairs with an input). */
  size?: ButtonSize;
  /** Shows the inline spinner and blocks presses. Pass the pending text as `label` ("Входим…"). */
  loading?: boolean;
  disabled?: boolean;
  leftIcon?: IconName;
  rightIcon?: IconName;
  /**
   * Stretch to the container width. Without it the parent decides: in a column the button stretches like
   * any flex child (set `alignItems` on the parent or `alignSelf` via `style` to keep it compact); in a
   * row it takes its content width.
   */
  fullWidth?: boolean;
  /**
   * Let a long label take a second line instead of being cut («Разморозить зависшие проверки» in a card
   * on a narrow phone or with a large OS font). The button grows by the extra line; default is one line.
   */
  wrapLabel?: boolean;
  /** Defaults to `label`. */
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

type VariantSpec = {
  bg: string;
  border: string;
  text: string;
  pressedBg?: string;
  pressedBorder?: string;
  paddingX: number;
  strong: boolean;
  disabledOpacity: number;
};

function variantSpec(variant: ButtonVariant, t: Theme): VariantSpec {
  const c = t.colors;
  switch (variant) {
    case 'outline':
      return {
        bg: c.cardBg,
        border: c.outlineBorder,
        text: c.tabText,
        pressedBorder: c.outlineHover,
        paddingX: 16,
        strong: false,
        disabledOpacity: 0.6,
      };
    case 'dark':
      return { bg: c.tabActiveBg, border: 'transparent', text: c.tabActiveText, paddingX: 22, strong: true, disabledOpacity: 0.45 };
    case 'danger':
      return {
        bg: c.cardBg,
        border: c.dangerOutline,
        text: c.dangerSolid,
        pressedBg: c.redSoft,
        paddingX: 20,
        strong: false,
        disabledOpacity: 0.45,
      };
    case 'dangerSolid':
      return { bg: c.dangerSolid, border: 'transparent', text: c.onAccent, paddingX: 20, strong: true, disabledOpacity: 0.45 };
    case 'tonal':
      return {
        bg: c.accentSoft,
        border: 'transparent',
        text: c.greenText,
        pressedBg: c.accentSoftStrong,
        paddingX: 16,
        strong: false,
        disabledOpacity: 0.45,
      };
    default:
      return { bg: 'transparent', border: 'transparent', text: c.onAccent, paddingX: 22, strong: true, disabledOpacity: 1 };
  }
}

function labelVariant(size: ButtonSize, strong: boolean): TextVariant {
  if (size === 'sm') return 'buttonSm';
  if (size === 'lg' || size === 'field') return strong ? 'buttonLg' : 'buttonLgSoft';
  return strong ? 'button' : 'buttonSoft';
}

/**
 * Action button (`.shbz-btn-*`): 44 high, radius 12, one line. Press feedback is the system scale
 * (0.97 in 60 ms). A disabled primary button turns neutral grey instead of fading.
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  leftIcon,
  rightIcon,
  fullWidth = false,
  wrapLabel = false,
  accessibilityLabel,
  accessibilityHint,
  testID,
  style,
}: ButtonProps) {
  const theme = useTheme();
  const guardedPress = usePressGuard(onPress);
  const styles = useStyles();
  const spec = variantSpec(variant, theme);
  const inactive = disabled || loading;
  const isPrimary = variant === 'primary';
  const height =
    size === 'sm'
      ? theme.sizes.buttonSm
      : size === 'lg'
        ? theme.sizes.buttonLg
        : size === 'field'
          ? theme.sizes.field
          : theme.sizes.button;
  const paddingX = size === 'sm' ? 14 : size === 'lg' || size === 'field' ? 24 : spec.paddingX;
  const textColor = isPrimary && inactive ? theme.colors.segText : spec.text;
  const iconSize = size === 'sm' ? 14 : 16;

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={guardedPress}
      hitSlop={hitSlopFor(theme.sizes.minTouch, height)}
      testID={testID}
      style={[
        styles.base,
        {
          minHeight: height,
          paddingHorizontal: paddingX,
          backgroundColor: isPrimary ? (inactive ? theme.colors.segBg : 'transparent') : spec.bg,
          borderColor: spec.border,
        },
        isPrimary && !inactive ? theme.shadows.accentGlow : null,
        !isPrimary && inactive ? { opacity: spec.disabledOpacity } : null,
        fullWidth ? styles.fullWidth : null,
        wrapLabel ? styles.wrapping : null,
        style,
      ]}
      pressedStyle={{
        ...(spec.pressedBg ? { backgroundColor: spec.pressedBg } : null),
        ...(spec.pressedBorder ? { borderColor: spec.pressedBorder } : null),
      }}
    >
      {isPrimary && !inactive ? <AccentGradient style={styles.fill} /> : null}
      {loading ? <Spinner tint={textColor} /> : leftIcon ? <Icon name={leftIcon} size={iconSize} tint={textColor} /> : null}
      <View style={styles.labelWrap}>
        <Text
          variant={labelVariant(size, spec.strong)}
          numberOfLines={wrapLabel ? 2 : 1}
          align={wrapLabel ? 'center' : undefined}
          style={{ color: textColor }}
        >
          {label}
        </Text>
      </View>
      {rightIcon ? <Icon name={rightIcon} size={iconSize} tint={textColor} /> : null}
    </PressableScale>
  );
}

const useStyles = makeStyles((t) => ({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: t.space.xs,
    borderRadius: t.radii.md,
    borderWidth: t.borders.interactive,
  },
  fullWidth: { alignSelf: 'stretch' },
  // The gradient covers the (transparent) 1.5px border too, like `background: gradient` on the site.
  fill: {
    ...absoluteFill,
    margin: -t.borders.interactive,
    borderRadius: t.radii.md,
  },
  labelWrap: { flexShrink: 1, minWidth: 0 },
  // Two lines need air above and below; a one-line label is centred in the fixed height as before.
  wrapping: { paddingVertical: t.space.xs },
}));
