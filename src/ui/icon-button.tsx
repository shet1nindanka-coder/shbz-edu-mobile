import { StyleSheet, View, type GestureResponderEvent, type StyleProp, type ViewStyle } from 'react-native';

import { makeStyles, useTheme } from '@/theme';

import { CountBadge } from './count-badge';
import { Glass } from './glass';
import { Icon, type IconName } from './icon';
import { hitSlopFor, PressableScale } from './internal/pressable-scale';

export type IconButtonVariant = 'circle' | 'glass' | 'ghost' | 'danger' | 'dangerRaised';

export type IconButtonProps = {
  icon: IconName;
  /** Required: an icon button has no visible text. */
  accessibilityLabel: string;
  onPress?: (event: GestureResponderEvent) => void;
  /**
   * `circle` — the 44 outlined mark (`.st`: white, radius 12) for buttons inside content: close, «⋯», arrows;
   * `glass` — the 44 round glass button of the screen header (search, bell); navigation only;
   * `ghost` — no outline; `danger` — 24px "×" remove; `dangerRaised` — the same over an image.
   */
  variant?: IconButtonVariant;
  /** Highlights a `circle` whose screen is open (the gear on the settings screen). */
  active?: boolean;
  disabled?: boolean;
  /** Unread counter in the top-right corner (hidden at 0, `9+` above 9). */
  badge?: number;
  /** Glyph size override (default 20; 16 for danger). */
  iconSize?: number;
  /** Raw glyph colour, for a button that sits on a tinted surface (a notice). */
  tint?: string;
  accessibilityHint?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

/** Icon-only button. The visual is 44 (24 for the remove cross); the touch target is always at least 44. */
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
  // A caller may shrink the visual through `style` (the 28pt close button of a notice): the touch target
  // must be grown from the size actually rendered, not from the default diameter.
  const override = StyleSheet.flatten(style);
  const width = typeof override?.width === 'number' ? override.width : diameter;
  const height = typeof override?.height === 'number' ? override.height : diameter;

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled, selected: active }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={hitSlopFor(width, height)}
      testID={testID}
      style={[
        styles.base,
        { width: diameter, height: diameter },
        variant === 'circle' ? (active ? styles.circleActive : styles.circle) : null,
        variant === 'glass' ? styles.glass : null,
        variant === 'dangerRaised' ? [styles.raised, theme.shadows.raisedIcon] : null,
        disabled ? { opacity: variant === 'danger' ? 0.3 : 0.4 } : null,
        style,
      ]}
      pressedStyle={
        small
          ? { backgroundColor: c.redSoft, borderColor: c.dangerOutline }
          : variant === 'circle'
            ? { borderColor: c.outlineHover }
            : variant === 'glass'
              ? { opacity: 0.7 }
              : { backgroundColor: c.tabHover }
      }
    >
      {({ pressed }) => (
        <>
          {variant === 'glass' ? <Glass style={styles.glassFill} /> : null}
          <View style={variant === 'danger' && !pressed ? styles.dimmed : null}>
            <Icon
              name={icon}
              size={iconSize ?? (small ? theme.sizes.icon.sm : theme.sizes.icon.md)}
              tint={
                tint ??
                (variant === 'danger'
                  ? c.dangerText
                  : variant === 'dangerRaised'
                    ? pressed
                      ? c.dangerText
                      : c.textMuted
                    : variant === 'circle' && !active
                      ? c.textMuted
                      : variant === 'glass'
                        ? c.label
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
  circle: { borderRadius: t.radii.md, backgroundColor: t.colors.cardBg, borderColor: t.colors.line2 },
  circleActive: { borderRadius: t.radii.md, backgroundColor: t.colors.soft2, borderColor: t.colors.textStrong },
  glass: { borderWidth: 0 },
  glassFill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  raised: { backgroundColor: t.colors.cardBg, borderColor: t.colors.line2 },
  // The remove glyph is quiet until touched (opacity 0.55 → 1 on the site).
  dimmed: { opacity: 0.55 },
  badge: { position: 'absolute', top: -t.space.xxs, right: -t.space.xxs },
}));
