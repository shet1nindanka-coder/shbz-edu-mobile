import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';

import { makeStyles, useTheme } from '@/theme';

import { PressableScale } from './internal/pressable-scale';
import { useSlidingIndicator } from './internal/sliding-indicator';
import { Text } from './text';

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
  /** Use `shortLabel`s. */
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
  role = 'radio',
  disabled = false,
  testID,
  style,
}: SegmentedProps<T>) {
  const theme = useTheme();
  const styles = useStyles();
  const activeIndex = options.findIndex((option) => option.value === value);
  const { onItemLayout, indicatorStyle } = useSlidingIndicator(activeIndex);

  return (
    <View
      accessibilityRole={role === 'tab' ? 'tablist' : 'radiogroup'}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      style={[styles.track, fill ? styles.trackFill : styles.trackInline, disabled ? styles.disabled : null, style]}
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
            onLayout={onItemLayout(index)}
            hitSlop={{ top: 5, bottom: 5 }}
            style={[styles.segment, fill ? styles.segmentFill : null, option.disabled ? styles.disabled : null]}
          >
            <Text
              variant="segment"
              numberOfLines={1}
              color={selected ? (plain ? 'textStrong' : 'accentSolid') : 'segText'}
            >
              {compact && option.shortLabel ? option.shortLabel : option.label}
            </Text>
          </PressableScale>
        );
      })}
    </View>
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
  disabled: { opacity: 0.55 },
}));
