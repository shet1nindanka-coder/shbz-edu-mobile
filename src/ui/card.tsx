import { createContext, use, type ReactNode } from 'react';
import { View, type GestureResponderEvent, type StyleProp, type ViewStyle } from 'react-native';

import { makeStyles, useTheme } from '@/theme';

import { accessibilityLabelOf, type AccessibilityPart } from './a11y';
import { absoluteFill } from './internal/layout';
import { PressableScale } from './internal/pressable-scale';

export type CardVariant = 'card' | 'surface' | 'soft' | 'panel' | 'outline';

/**
 * How deep the current subtree sits: 0 = on the page, 1 = inside a card (or a sheet). The design has two
 * floors only — page → card → soft panel — so a `Card` decides its look from the depth, not from where
 * the screen author thought it would be used.
 */
const SurfaceDepthContext = createContext(0);

/** True inside a card or a sheet: the next surface must be a soft panel. */
export function useInsideSurface(): boolean {
  return use(SurfaceDepthContext) > 0;
}

/** Marks its subtree as sitting on a card-coloured surface (a bottom sheet, a dialog). */
export function SurfaceScope({ children }: { children: ReactNode }) {
  return <SurfaceDepthContext value={1}>{children}</SurfaceDepthContext>;
}

export type CardProps = {
  /**
   * Kept for the callers; the look follows the nesting, not the variant:
   * - on the page every variant is THE card — white, no border, soft shadow, radius 24;
   * - inside a card or a sheet every variant is a soft panel — soft fill, radius 16, no shadow.
   * Two floors only: page → card → soft panel. Never nest a third level.
   */
  variant?: CardVariant;
  /** Inner padding: `true` = 16 (24 for a card on a tablet), a number, or `false` for none. Default `true`. */
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
  const nested = use(SurfaceDepthContext) > 0;
  const padding = padded === true ? (nested ? theme.space.lg : theme.space.card) : padded || 0;
  const composed: StyleProp<ViewStyle> = [
    nested ? styles.panel : styles.card,
    nested ? null : theme.shadows.card,
    dashed ? styles.dashed : null,
    // No `padding: 0`: on web a shorthand written here would beat the `paddingVertical` of the caller's style.
    padding ? { padding } : null,
    style,
  ];
  const ring = selected ? <View style={[styles.ring, nested ? styles.ringPanel : null]} /> : null;
  // `variant` no longer selects a look; it is read so the prop stays part of the API.
  void variant;
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
        <SurfaceDepthContext value={1}>{children}</SurfaceDepthContext>
        {ring}
      </PressableScale>
    );
  }
  return (
    <View accessibilityLabel={label} testID={testID} style={composed}>
      <SurfaceDepthContext value={1}>{children}</SurfaceDepthContext>
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
  // The card: white on the grey page, no border (a faint edge in the dark theme), soft shadow.
  card: {
    borderRadius: t.radii.xl,
    borderWidth: t.borders.hairline,
    borderColor: t.colors.cardBorder,
    backgroundColor: t.colors.cardBg,
  },
  // A panel inside a card: soft fill, nothing else.
  panel: {
    borderRadius: t.radii.lg,
    borderWidth: t.borders.interactive,
    borderColor: 'transparent',
    backgroundColor: t.colors.softBg,
  },
  // An invitation / empty slot: dashed outline (`.note`, `.drop`).
  dashed: { borderStyle: 'dashed', borderWidth: t.borders.interactive, borderColor: t.colors.line2 },
  ring: {
    ...absoluteFill,
    margin: -t.borders.hairline,
    borderRadius: t.radii.xl,
    borderWidth: t.borders.strong,
    borderColor: t.colors.textStrong,
    pointerEvents: 'none',
  },
  ringPanel: { margin: -t.borders.interactive, borderRadius: t.radii.lg },
  disabled: { opacity: 0.55 },
}));
