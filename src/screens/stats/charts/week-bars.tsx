import { useId, useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { useI18n } from '@/i18n';
import { makeStyles, useTheme } from '@/theme';
import { Text } from '@/ui';

import { slotIndexAt, weekBarTitle, weekBars, weekChartSummary } from '../logic';
import { ChartHitArea, ChartStepper } from './chart-selection';
import { accentStops } from './palette';

/** Height of the tallest column; a non-empty week is drawn at least `MIN_BAR` high. */
const CHART_HEIGHT = 88;
/** Room above the tallest column for its count. */
const COUNT_ROOM = 22;
/** Also the height of the neutral stub that marks an empty week. */
const MIN_BAR = 8;
const MAX_BAR_WIDTH = 40;
const LABEL_WIDTH = 64;
const PLOT_HEIGHT = CHART_HEIGHT + COUNT_ROOM;

export type WeekBarsProps = {
  /** 12 counts, oldest week first. */
  counts: readonly number[];
  /** The Mondays those weeks start on. */
  weekStarts: readonly string[];
  testID?: string;
};

/**
 * «Занятия по неделям» (06 §1.6.b; mockup D-stats): twelve rounded columns in the accent gradient, a
 * neutral stub for an empty week, the count above each non-empty one, the week's Monday under every
 * fourth and the last. The site's hover
 * tooltip becomes a selection: the caption between the arrows names the chosen week (nothing is written
 * there until a week is chosen). A column is 27 pt wide
 * on a phone — too narrow for a touch target of its own — so the whole plot is one target (the week under
 * the finger is selected) and the arrows beside the caption step week by week.
 */
export function WeekBars({ counts, weekStarts, testID }: WeekBarsProps) {
  const styles = useStyles();
  const theme = useTheme();
  const gradientId = useId();
  const accent = accentStops(theme);
  const { locale, dict } = useI18n();
  const t = dict.planner.teacherStats;
  const [width, setWidth] = useState(0);
  // Kept by the week's Monday, not by position: a refetch after a new week began shifts every column.
  const [selectedWeek, setSelectedWeek] = useState<string | null>(null);
  const bars = weekBars(counts, weekStarts, locale);
  const selectedIndex = selectedWeek === null ? -1 : weekStarts.indexOf(selectedWeek);
  const selected = selectedIndex === -1 ? null : selectedIndex;
  const setSelected = (index: number | null) => setSelectedWeek(index === null ? null : (weekStarts[index] ?? null));
  const selectedBar = selected !== null ? bars[selected] : undefined;

  const slot = bars.length > 0 ? width / bars.length : 0;
  const barWidth = Math.min(MAX_BAR_WIDTH, slot * 0.7);
  const columns = bars.map((bar) => {
    const x = slot * bar.index + (slot - barWidth) / 2;
    // An empty week keeps its place on the axis as a stub.
    const height = bar.count > 0 ? Math.max(MIN_BAR, bar.ratio * CHART_HEIGHT) : MIN_BAR;
    return { bar, x, height, y: PLOT_HEIGHT - height, radius: Math.min(theme.radii.sm, barWidth / 2, height / 2), center: x + barWidth / 2 };
  });

  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);
  /** A date is wider than its column: centre it, but keep the outermost ones inside the chart. */
  const labelLeft = (center: number) => Math.min(Math.max(0, center - LABEL_WIDTH / 2), Math.max(0, width - LABEL_WIDTH));

  return (
    <View style={styles.root} testID={testID}>
      <View onLayout={onLayout} style={styles.plot}>
        {width > 0 ? (
          <>
            <Svg width={width} height={PLOT_HEIGHT}>
              <Defs>
                <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={accent.from} />
                  <Stop offset="1" stopColor={accent.to} />
                </LinearGradient>
              </Defs>
              {columns.map(({ bar, x, y, height, radius }) => (
                <Rect
                  key={bar.index}
                  x={x}
                  y={y}
                  width={barWidth}
                  height={height}
                  rx={radius}
                  fill={bar.count > 0 ? `url(#${gradientId})` : theme.colors.soft2}
                  opacity={selected === null || selected === bar.index ? 1 : 0.45}
                />
              ))}
            </Svg>
            {/* The counts repeat the chart's accessible summary: hidden like the axis, never read as bare numbers. */}
            <View style={styles.counts} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden>
              {columns.map(({ bar, height }) =>
                bar.count > 0 ? (
                  <View key={bar.index} style={[styles.column, { left: slot * bar.index, width: slot, paddingBottom: height + theme.space.xxs }]}>
                    <Text variant="chip" color="textStrong" tabular numberOfLines={1}>
                      {bar.count}
                    </Text>
                  </View>
                ) : null,
              )}
            </View>
            <ChartHitArea
              count={bars.length}
              selected={selected}
              onSelect={setSelected}
              indexAt={(x) => slotIndexAt(x, width, bars.length)}
              accessibilityLabel={weekChartSummary(bars, t)}
              accessibilityValue={selectedBar ? weekBarTitle(selectedBar, t, dict.planner.common, locale) : undefined}
              testID={testID ? `${testID}-plot` : undefined}
            />
          </>
        ) : null}
      </View>
      <View style={styles.axis} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {width > 0
          ? columns.map(({ bar, center }) =>
              bar.showLabel ? (
                <Text
                  key={bar.index}
                  variant="chip"
                  color="textMuted"
                  numberOfLines={1}
                  align={bar.index === 0 ? 'left' : bar.index === bars.length - 1 ? 'right' : 'center'}
                  style={[styles.tickLabel, { left: labelLeft(center) }]}
                >
                  {bar.weekLabel}
                </Text>
              ) : null,
            )
          : null}
      </View>
      <ChartStepper count={bars.length} selected={selected} onSelect={setSelected} testID={testID}>
        {selectedBar ? (
          <Text variant="smallStrong" align="center" accessibilityLiveRegion="polite" testID={testID ? `${testID}-selected` : undefined}>
            {weekBarTitle(selectedBar, t, dict.planner.common, locale)}
          </Text>
        ) : null}
      </ChartStepper>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  root: { gap: t.space.xs },
  plot: { height: PLOT_HEIGHT },
  // Not a touch target: the counts sit above their columns, the plot's hit area lies over them.
  column: { position: 'absolute', top: 0, height: PLOT_HEIGHT, alignItems: 'center', justifyContent: 'flex-end', pointerEvents: 'none' },
  counts: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, pointerEvents: 'none' },
  axis: { height: t.typography.chip.lineHeight },
  tickLabel: { position: 'absolute', top: 0, width: LABEL_WIDTH },
}));
