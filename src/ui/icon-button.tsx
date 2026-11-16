import { View, type GestureResponderEvent, type StyleProp, type ViewStyle } from 'react-native';

import { makeStyles, useTheme } from '@/theme';

import { CountBadge } from './count-badge';
import { Icon, type IconName } from './icon';
import { hitSlopFor, PressableScale } from './internal/pressable-scale';

export type IconButtonVariant = 'circle' | 'ghost' | 'danger' | 'dangerRaised';

export type IconButtonProps = {
  icon: IconName;
  /** Required: an icon button has no visible text. */
  accessibilityLabel: string;
  onPress?: (event: GestureResponderEvent) => void;
  /**
   * `circle` — 40px outlined circle (bell, gear); `ghost` — no outline (back arrow);
   * `danger` — 26px "×" remove; `dangerRaised` — the same over an image.
   */
  variant?: IconButtonVariant;
  /** Highlights a `circle` whose screen is open (the gear on the settings screen). */
  active?: boolean;
  disabled?: boolean;
  /** Unread counter in the top-right corner (hidden at 0, `9+` above 9). */
  badge?: number;
  /** Glyph size override (default 18 for circles, 15 for danger). */
  iconSize?: number;
  /** Raw glyph colour, for a button that sits on a tinted surface (a notice). */
  tint?: string;
  accessibilityHint?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

/** Round icon-only button. The visual is 40 (or 26) px; the touch target is always at least 44. */
export function IconButton({
  icon,
  accessibilityLabel,
  onPress,
  variant = 'circle',
  active = false,
  disabled = false,
  badge,
  iconSize,
  tint,
  accessibilityHint,
  testID,
  style,
}: IconButtonProps) {
  const theme = useTheme();
  const styles = useStyles();
  const c = theme.colors;
  const small = variant === 'danger' || variant === 'dangerRaised';
  const diameter = small ? theme.sizes.dangerIcon : theme.sizes.iconCircle;

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled, selected: active }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={hitSlopFor(diameter, diameter)}
      testID={testID}
      style={[
        styles.base,
        { width: diameter, height: diameter },
        variant === 'circle' ? (active ? styles.circleActive : styles.circle) : null,
        variant === 'dangerRaised' ? [styles.raised, theme.shadows.raisedIcon] : null,
        disabled ? { opacity: variant === 'danger' ? 0.3 : 0.4 } : null,
        style,
      ]}
      pressedStyle={
        small
          ? { backgroundColor: c.redSoft, borderColor: c.dangerOutline }
          : variant === 'circle'
            ? { borderColor: c.outlineHover }
            : { backgroundColor: c.tabHover }
      }
    >
      {({ pressed }) => (
        <>
          <View style={variant === 'danger' && !pressed ? styles.dimmed : null}>
            <Icon
              name={icon}
              size={iconSize ?? (small ? 15 : 18)}
              tint={
                tint ??
                (variant === 'danger'
                  ? c.dangerText
                  : variant === 'dangerRaised'
                    ? pressed
                      ? c.dangerText
                      : c.textMuted
                    : c.textStrong)
              }
            />
          </View>
          {badge ? <CountBadge count={badge} style={styles.badge} /> : null}
        </>
      )}
    </PressableScale>
  );
}

const useStyles = makeStyles((t) => ({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: t.radii.full,
    borderWidth: t.borders.interactive,
    borderColor: 'transparent',
  },
  circle: { backgroundColor: t.colors.cardBg, borderColor: t.colors.outlineBorder },
  circleActive: { backgroundColor: t.colors.tabHover, borderColor: t.colors.textStrong },
  raised: { backgroundColor: t.colors.cardBg, borderColor: t.colors.softBorder },
  // The remove glyph is quiet until touched (opacity 0.55 → 1 on the site).
  dimmed: { opacity: 0.55 },
  badge: { position: 'absolute', top: -5.5, right: -5.5 },
}));
