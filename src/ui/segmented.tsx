import { useEffect, useRef } from 'react';
import { ScrollView, View, type ScrollViewInstance, type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';

import { makeStyles, useTheme } from '@/theme';

import { PressableScale } from './internal/pressable-scale';
import { useSlidingIndicator } from './internal/sliding-indicator';
import { Text } from './text';
import { useTextScale } from './use-text-scale';

export type SegmentedOption<T extends string> = {
  value: T;
  label: string;
  /** Shorter label used when `compact` is set (very narrow screens). */
  shortLabel?: string;
  /** Defaults to `label`. */
  accessibilityLabel?: string;
  disabled?: boolean;
};

export type SegmentedProps<T extends string> = {
  options: readonly SegmentedOption<T>[];
  /** Selected value; `null` = nothing selected (the indicator fades out). */
  value: T | null;
  onChange: (value: T) => void;
  /** Accessible name of the group. */
  accessibilityLabel?: string;
  /** Full width with equal segments (`--fill`): settings blocks, in-page tabs on phones. */
  fill?: boolean;
  /** Selected label in the strong text colour instead of the accent (`--plain`): in-page navigation. */
  plain?: boolean;
  /**
   * Labels are never cut: segments keep the width of their label and, when they do not fit the row
   * (a narrow phone, a large OS font), the bar scrolls sideways with the selected segment kept in view.
   * While they fit, the bar looks like `fill`. For in-page tabs, whose labels come from the dictionary.
   */
  scrollable?: boolean;
  /**
   * Use `shortLabel`s. Decide it from the room the labels need at the CURRENT text size, not from the
   * window alone: `compact={width < widthForText(360, fontScale)}`. Fixed-width labels that still do not
   * fit shrink back towards the default size instead of being cut (`adjustsFontSizeToFit`, native).
   */
  compact?: boolean;
  /** `radio` for a setting (default), `tab` when the control switches the content below. */
  role?: 'radio' | 'tab';
  disabled?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * Segmented control (`.shbz-seg`): grey track, white selected segment that slides to the new option
 * (260 ms). Applies immediately — there is no save button next to it.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
  fill = false,
  plain = false,
  compact = false,
  scrollable = false,
  role = 'radio',
  disabled = false,
  testID,
  style,
}: SegmentedProps<T>) {
  const theme = useTheme();
  const styles = useStyles();
  const { minimumFontScale } = useTextScale();
  const activeIndex = options.findIndex((option) => option.value === value);
  const { onItemLayout, indicatorStyle } = useSlidingIndicator(activeIndex);
  const scrollRef = useRef<ScrollViewInstance>(null);
  const spans = useRef<({ x: number; width: number } | undefined)[]>([]);
  const viewport = useRef(0);

  // Scrollable bar: keep the selected segment in view (centred when the bar is wider than the row).
  useEffect(() => {
    if (!scrollable) return;
    const span = spans.current[activeIndex];
    if (!span || viewport.current === 0) return;
    scrollRef.current?.scrollTo({ x: Math.max(0, span.x + span.width / 2 - viewport.current / 2), animated: true });
  }, [activeIndex, scrollable]);

  const track = (
    <View
      accessibilityRole={role === 'tab' ? 'tablist' : 'radiogroup'}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      style={[
        styles.track,
        scrollable ? styles.trackScrollable : fill ? styles.trackFill : styles.trackInline,
        disabled ? styles.disabled : null,
        scrollable ? null : style,
      ]}
    >
      <Animated.View style={[styles.indicator, theme.shadows.segment, indicatorStyle]} />
      {options.map((option, index) => {
        const selected = index === activeIndex;
        const inactive = disabled || Boolean(option.disabled);
        return (
          <PressableScale
            key={option.value}
            accessibilityRole={role}
            accessibilityLabel={option.accessibilityLabel ?? option.label}
            accessibilityState={role === 'tab' ? { selected, disabled: inactive } : { checked: selected, disabled: inactive }}
            disabled={inactive}
            onPress={() => {
              if (!selected) onChange(option.value);
            }}
            onLayout={(event) => {
              spans.current[index] = { x: event.nativeEvent.layout.x, width: event.nativeEvent.layout.width };
              onItemLayout(index)(event);
            }}
            hitSlop={{ top: 5, bottom: 5 }}
            style={[
              styles.segment,
              scrollable ? styles.segmentScrollable : fill ? styles.segmentFill : null,
              option.disabled ? styles.disabled : null,
            ]}
          >
            <Text
              variant="segment"
              numberOfLines={1}
              // A segment of a scrollable bar is as wide as its label; the others share a fixed row and
              // would cut a label drawn at a large OS font size («Системн…»): it shrinks instead.
              adjustsFontSizeToFit={!scrollable}
              minimumFontScale={minimumFontScale}
              color={selected ? (plain ? 'textStrong' : 'accentSolid') : 'segText'}
            >
              {compact && option.shortLabel ? option.shortLabel : option.label}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );

  if (!scrollable) return track;
  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      onLayout={(event) => {
        viewport.current = event.nativeEvent.layout.width;
      }}
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      style={[styles.scroll, style]}
      contentContainerStyle={styles.scrollContent}
    >
      {track}
    </ScrollView>
  );
}

const useStyles = makeStyles((t) => ({
  track: {
    flexDirection: 'row',
    gap: t.space.xxs,
    padding: 5,
    borderRadius: t.radii.md,
    backgroundColor: t.colors.segBg,
  },
  trackInline: { alignSelf: 'flex-start' },
  trackFill: { alignSelf: 'stretch' },
  // Inside the horizontal scroller: at least as wide as the row, wider when the labels need it.
  scroll: { flexGrow: 0 },
  scrollContent: { flexGrow: 1 },
  trackScrollable: { flexGrow: 1 },
  indicator: {
    position: 'absolute',
    top: 0,
    left: 0,
    borderRadius: t.radii.seg,
    backgroundColor: t.colors.segActiveBg,
  },
  segment: {
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: t.radii.seg,
  },
  // Equal growth from the label's own width: a long label is not truncated while short ones have room.
  segmentFill: { flexGrow: 1, flexShrink: 1, flexBasis: 'auto', paddingHorizontal: 6 },
  // Never narrower than the label; spare room is shared equally, as in `fill`.
  segmentScrollable: { flexGrow: 1, flexShrink: 0, flexBasis: 'auto', paddingHorizontal: 4 },
  disabled: { opacity: 0.55 },
}));
