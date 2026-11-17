import type { ReactNode } from 'react';
import { View, type GestureResponderEvent, type StyleProp, type ViewStyle } from 'react-native';

import { makeStyles, useTheme } from '@/theme';

import { accessibilityLabelOf, type AccessibilityPart } from './a11y';
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
  /**
   * Makes the whole card a button with the system press feedback. A pressable card is ONE element for
   * screen readers: nothing inside it is read or focusable on its own (iOS hides every descendant). So
   * - never nest a control (button, menu, switch, link) in it: use a plain `Card` with a `CardPressArea`
   *   around the main block and the controls next to it;
   * - put every visible signal (status, badges, counts, meta) into `accessibilityParts` / the hint.
   */
  onPress?: (event: GestureResponderEvent) => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  /**
   * Pieces of the spoken name after `accessibilityLabel`, in reading order (`accessibilityLabelOf`): the
   * status label, the badges, the meta line of a pressable card. Empty pieces are skipped.
   */
  accessibilityParts?: readonly AccessibilityPart[];
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
  accessibilityParts,
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
  const label = accessibilityParts ? accessibilityLabelOf([accessibilityLabel, ...accessibilityParts]) : accessibilityLabel;

  if (onPress) {
    return (
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={label}
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
    <View accessibilityLabel={label} testID={testID} style={composed}>
      {children}
      {ring}
    </View>
  );
}

export type CardPressAreaProps = {
  onPress: (event: GestureResponderEvent) => void;
  /** The action and its object: «Открыть урок 12 ноября». */
  accessibilityLabel: string;
  /** What the eye reads inside the area (status, badges, meta), spoken after the label. */
  accessibilityParts?: readonly AccessibilityPart[];
  accessibilityHint?: string;
  disabled?: boolean;
  selected?: boolean;
  /** `aria-expanded` of a header that folds its card open. */
  expanded?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
};

/**
 * The main press target of a card that also holds controls of its own (a «⋯» menu, buttons, a switch).
 * The card stays a plain `Card`; this area wraps only the block that opens / folds it, and the controls are
 * its siblings, so VoiceOver and TalkBack reach each of them:
 *
 *   <Card>
 *     <View style={row}>
 *       <CardPressArea onPress={open} accessibilityLabel={title} accessibilityParts={[status, meta]} style={{ flex: 1 }}>
 *         <Text>{title}</Text><Chip label={status} /><Text>{meta}</Text>
 *       </CardPressArea>
 *       <IconButton icon="more" accessibilityLabel={actionsLabel} onPress={openMenu} />
 *     </View>
 *     <Button label={open} … />
 *   </Card>
 *
 * Its own content is not read separately (it is one element): every visible piece goes into
 * `accessibilityParts`. No scale-down on press — the card around it does not move.
 */
export function CardPressArea({
  onPress,
  accessibilityLabel,
  accessibilityParts,
  accessibilityHint,
  disabled = false,
  selected,
  expanded,
  testID,
  style,
  children,
}: CardPressAreaProps) {
  const styles = useStyles();
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabelOf([accessibilityLabel, ...(accessibilityParts ?? [])])}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled, selected, expanded }}
      disabled={disabled}
      onPress={onPress}
      scaleTo={1}
      testID={testID}
      style={[style, disabled ? styles.disabled : null]}
    >
      {children}
    </PressableScale>
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
