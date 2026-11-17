import { useEffect, useRef } from 'react';
import { ScrollView, View, type ScrollViewInstance, type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';

import { makeStyles } from '@/theme';

import { PressableScale } from './internal/pressable-scale';
import { useSlidingIndicator } from './internal/sliding-indicator';
import { Text } from './text';
import { useTextScale } from './use-text-scale';

export type TabOption<T extends string> = {
  value: T;
  /** Lower-case on the site («обзор», «дз»). */
  label: string;
  accessibilityLabel?: string;
  disabled?: boolean;
};

export type TabsProps<T extends string> = {
  options: readonly TabOption<T>[];
  /** Active tab; `null` when the current screen is outside the bar (the pill fades out). */
  value: T | null;
  onChange: (value: T) => void;
  accessibilityLabel?: string;
  /** Stretch the pill to the container and give every tab equal width. */
  fill?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * Tab bar pill (`.shbz-tabbar`): outlined pill with an inverted ink indicator that slides between tabs.
 * When the tabs do not fit, the bar scrolls horizontally.
 */
export function Tabs<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
  fill = false,
  testID,
  style,
}: TabsProps<T>) {
  const styles = useStyles();
  const { minimumFontScale } = useTextScale();
  const activeIndex = options.findIndex((option) => option.value === value);
  const { onItemLayout, indicatorStyle } = useSlidingIndicator(activeIndex);
  const scrollRef = useRef<ScrollViewInstance>(null);
  const spans = useRef<({ x: number; width: number } | undefined)[]>([]);
  const viewport = useRef(0);

  // Keep the active tab in view: center it when the bar scrolls.
  useEffect(() => {
    const span = spans.current[activeIndex];
    if (!span || viewport.current === 0) return;
    scrollRef.current?.scrollTo({ x: Math.max(0, span.x + span.width / 2 - viewport.current / 2), animated: true });
  }, [activeIndex]);

  const bar = (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      style={[styles.bar, fill ? styles.barFill : null]}
    >
      <Animated.View style={[styles.indicator, indicatorStyle]} />
      {options.map((option, index) => {
        const selected = index === activeIndex;
        return (
          <PressableScale
            key={option.value}
            accessibilityRole="tab"
            accessibilityLabel={option.accessibilityLabel ?? option.label}
            accessibilityState={{ selected, disabled: Boolean(option.disabled) }}
            disabled={option.disabled}
            onPress={() => {
              if (!selected) onChange(option.value);
            }}
            onLayout={(event) => {
              spans.current[index] = { x: event.nativeEvent.layout.x, width: event.nativeEvent.layout.width };
              onItemLayout(index)(event);
            }}
            hitSlop={{ top: 3, bottom: 3 }}
            style={[styles.tab, fill ? styles.tabFill : null, option.disabled ? styles.disabled : null]}
            pressedStyle={selected ? null : styles.tabPressed}
          >
            <Text
              variant="tab"
              numberOfLines={1}
              // A `fill` bar shares a fixed row: a label drawn at a large OS font size shrinks instead of
              // being cut. A scrolling bar gives every tab the width of its label.
              adjustsFontSizeToFit={fill}
              minimumFontScale={minimumFontScale}
              color={selected ? 'tabActiveText' : 'tabText'}
            >
              {option.label}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );

  if (fill) return <View style={style}>{bar}</View>;
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
      {bar}
    </ScrollView>
  );
}

const useStyles = makeStyles((t) => ({
  scroll: { flexGrow: 0 },
  scrollContent: { flexGrow: 1 },
  bar: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    gap: t.space.xxs,
    padding: 6,
    borderRadius: t.radii.lg,
    borderWidth: t.borders.interactive,
    borderColor: t.colors.tabBorder,
    backgroundColor: t.colors.cardBg,
  },
  barFill: { alignSelf: 'stretch' },
  indicator: {
    position: 'absolute',
    top: 0,
    left: 0,
    borderRadius: t.radii.md,
    backgroundColor: t.colors.tabActiveBg,
  },
  tab: {
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    paddingHorizontal: 18,
    borderRadius: t.radii.md,
  },
  tabFill: { flexGrow: 1, flexShrink: 1, flexBasis: 'auto', paddingHorizontal: 8 },
  tabPressed: { backgroundColor: t.colors.tabHover },
  disabled: { opacity: 0.45 },
}));
