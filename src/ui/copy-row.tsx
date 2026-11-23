import { useEffect } from 'react';
import { AccessibilityInfo, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { makeStyles, useTheme } from '@/theme';

import { Icon } from './icon';
import { FieldShell } from './internal/field-shell';
import { absoluteFill } from './internal/layout';
import { easing } from './internal/motion';
import { PressableScale } from './internal/pressable-scale';
import { isOverlayCovered } from './overlay-cover';
import { Text } from './text';
import { useCopyFeedback } from './use-copy-feedback';

export type CopyRowProps = {
  /** The text that is shown and copied. */
  value: string;
  /** Text of the pill, `dict.topics.widgets.copy.copied` — «Скопировано». */
  copiedLabel: string;
  /** Screen-reader announcement after copying, `…copy.copiedAria` with the label filled in. */
  copiedAnnouncement?: string;
  /** Accessibility hint, `…copy.title` — «Нажмите, чтобы скопировать». */
  hint?: string;
  /** Label above the row. */
  label?: string;
  /** `field` — read-only field look (soft fill, 1.5px soft border); `plain` — just the row. */
  variant?: 'field' | 'plain';
  /** Monospace value (generated passwords). */
  mono?: boolean;
  /** Called after a successful copy (e.g. to fire a haptic). */
  onCopied?: () => void;
  accessibilityLabel?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * Copy-to-clipboard row (`CopyValue`): the whole row is the target. On copy the background flashes mint
 * for 900 ms and a dark pill rises above the row for 1300 ms.
 */
export function CopyRow({
  value,
  copiedLabel,
  copiedAnnouncement,
  hint,
  label,
  variant = 'field',
  mono = false,
  onCopied,
  accessibilityLabel,
  testID,
  style,
}: CopyRowProps) {
  const theme = useTheme();
  const styles = useStyles();
  const reducedMotion = useReducedMotion();
  // `copied` clears itself after the pill's 1300 ms.
  const { copied: copiedId, copy: copyText } = useCopyFeedback();
  const copied = copiedId !== null;
  const flash = useSharedValue(0);
  const pill = useSharedValue(0);
  const { copyFlash, copyPillIn } = theme.motion.duration;

  // The pill leaves when the "copied" state ends.
  useEffect(() => {
    if (!copied) pill.set(withTiming(0, { duration: reducedMotion ? 0 : copyPillIn }));
  }, [copied, pill, reducedMotion, copyPillIn]);

  const copy = async () => {
    if (!(await copyText('value', value))) return;
    flash.set(1);
    flash.set(withTiming(0, { duration: reducedMotion ? 0 : copyFlash, easing: easing('out') }));
    pill.set(withTiming(1, { duration: reducedMotion ? 0 : copyPillIn, easing: easing('out') }));
    // The copy may resolve after the lock cover came up: nothing of the covered screen is spoken then.
    if (copiedAnnouncement && !isOverlayCovered()) AccessibilityInfo.announceForAccessibility(copiedAnnouncement);
    onCopied?.();
  };

  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.get() }));
  const pillStyle = useAnimatedStyle(() => ({
    opacity: pill.get(),
    transform: [{ translateY: (1 - pill.get()) * 4 }],
  }));

  return (
    <FieldShell label={label} style={style}>
      <View>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel ?? (label ? `${label}: ${value}` : value)}
          accessibilityHint={hint}
          onPress={copy}
          testID={testID}
          style={[styles.row, variant === 'field' ? styles.field : null]}
        >
          <Animated.View style={[absoluteFill, styles.flash, flashStyle]} />
          <Text variant={mono ? 'mono' : 'small'} color="textMuted" numberOfLines={1} selectable={false} style={styles.value}>
            {value}
          </Text>
          <View style={styles.icon}>
            <Icon name={copied ? 'check' : 'copy'} size={16} color={copied ? 'greenText' : 'textStrong'} />
          </View>
        </PressableScale>
        <Animated.View style={[styles.pill, theme.shadows.pill, pillStyle]}>
          <Text variant="captionBold" color="tabActiveText" numberOfLines={1}>
            {copiedLabel}
          </Text>
        </Animated.View>
      </View>
    </FieldShell>
  );
}

const useStyles = makeStyles((t) => ({
  row: {
    minHeight: t.sizes.minTouch,
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space.md,
    borderRadius: t.radii.selectXs,
    overflow: 'hidden',
  },
  field: {
    minHeight: t.sizes.field,
    paddingHorizontal: 16,
    borderRadius: t.radii.md,
    borderWidth: t.borders.interactive,
    borderColor: t.colors.softBorder,
    backgroundColor: t.colors.softBg,
  },
  flash: { backgroundColor: t.colors.accentSoftStrong },
  value: { flex: 1, minWidth: 0 },
  icon: { opacity: 0.55 },
  pill: {
    position: 'absolute',
    right: 8,
    top: -22,
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: t.radii.full,
    backgroundColor: t.colors.tabActiveBg,
    pointerEvents: 'none',
  },
}));
