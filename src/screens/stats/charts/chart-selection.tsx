import { type ReactNode } from 'react';
import { Pressable, View, type GestureResponderEvent, type StyleProp, type ViewStyle } from 'react-native';

import { useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { IconButton } from '@/ui';

import { stepChartSelection } from '../logic';

export type ChartHitAreaProps = {
  /** Number of marks (columns, points) on the plot. */
  count: number;
  selected: number | null;
  onSelect: (index: number | null) => void;
  /** The mark nearest to a touch at `x` (in the plot's own coordinates). */
  indexAt: (x: number) => number;
  /** What the chart shows as a whole (announced by a screen reader). */
  accessibilityLabel: string;
  /** Title of the selected mark, if any. */
  accessibilityValue?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * The touch surface of a chart: ONE target as large as the plot. A tap selects the mark nearest to the
 * finger (a second tap on it clears the selection), so nothing depends on hitting a single column or
 * point — on a phone twelve columns are 27 pt wide each, below the 44 pt minimum for a target of its
 * own. A screen reader gets an adjustable element: swipe up / down steps through the marks.
 */
export function ChartHitArea({ count, selected, onSelect, indexAt, accessibilityLabel, accessibilityValue, style, testID }: ChartHitAreaProps) {
  const styles = useStyles();
  const press = (event: GestureResponderEvent) => {
    if (count === 0) return;
    // Native presses carry `locationX` (relative to this view, which has no children); on web the press
    // is a mouse click, whose position inside the target is `offsetX`.
    const native = event.nativeEvent as { locationX?: unknown; offsetX?: unknown };
    const x = typeof native.locationX === 'number' ? native.locationX : native.offsetX;
    if (typeof x !== 'number' || !Number.isFinite(x)) return;
    const index = indexAt(x);
    if (!Number.isInteger(index) || index < 0 || index >= count) return;
    onSelect(index === selected ? null : index);
  };
  return (
    <Pressable
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={accessibilityValue ? { text: accessibilityValue } : undefined}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'increment') onSelect(stepChartSelection(selected, count, 1));
        else if (event.nativeEvent.actionName === 'decrement') onSelect(stepChartSelection(selected, count, -1));
      }}
      onPress={press}
      style={[styles.hit, style]}
      testID={testID}
    />
  );
}

export type ChartStepperProps = {
  count: number;
  selected: number | null;
  onSelect: (index: number | null) => void;
  /** The caption between the arrows: the selected mark's title; nothing while no mark is selected. */
  children?: ReactNode;
  testID?: string;
};

/**
 * The caption row under a chart with "previous / next" buttons: the exact way to a mark that is too
 * narrow to aim at. From nothing selected, "next" starts at the first mark and "previous" at the last.
 */
export function ChartStepper({ count, selected, onSelect, children, testID }: ChartStepperProps) {
  const styles = useStyles();
  const { m } = useI18n();
  return (
    <View style={styles.stepper}>
      <IconButton
        icon="chevronLeft"
        variant="ghost"
        accessibilityLabel={m.stats.chart.previousAria}
        disabled={count === 0 || selected === 0}
        onPress={() => onSelect(stepChartSelection(selected, count, -1))}
        testID={testID ? `${testID}-previous` : undefined}
      />
      <View style={styles.caption}>{children}</View>
      <IconButton
        icon="chevronRight"
        variant="ghost"
        accessibilityLabel={m.stats.chart.nextAria}
        disabled={count === 0 || selected === count - 1}
        onPress={() => onSelect(stepChartSelection(selected, count, 1))}
        testID={testID ? `${testID}-next` : undefined}
      />
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  hit: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: t.space.xs, minHeight: t.sizes.minTouch },
  caption: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center' },
}));
