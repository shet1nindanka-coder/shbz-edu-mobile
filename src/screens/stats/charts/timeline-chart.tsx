import { useId, useState } from 'react';
import { View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';

import type { TimelineEntry } from '@/api/types';
import { buildProgressTimelineView, buildTimelineChartGeometry, type TimelinePeriod } from '@/domain/progress-timeline';
import { format, useI18n } from '@/i18n';
import { Hint } from '@/providers';
import { makeStyles, useTheme } from '@/theme';
import { Icon, PressableScale, Segmented, Text } from '@/ui';

const PERIODS: readonly TimelinePeriod[] = ['7d', '4w', '8w'];

/** Height of the plot area (the site's phone value). */
const PLOT_HEIGHT = 150;
/** Room for half of the outermost date label, and for the dots at the top and bottom edges. */
const SIDE = 24;
const TOP = 10;
const DOT_RADIUS = 5.5;

export type TimelineChartProps = {
  /** 112 daily entries, oldest first. */
  entries: readonly TimelineEntry[];
  /** Name of the student the timeline is filtered by; null = every student. */
  selectedStudentName: string | null;
};

/**
 * «Динамика прогресса» (06 §1.6.a item 2, §4.5): period switch, the closed / red totals, the trend
 * against the previous window and a line of closed numbers per day or week. The site shows a point's
 * value on hover; here a tap selects the point and the caption under the chart names it.
 */
export function TimelineChart({ entries, selectedStudentName }: TimelineChartProps) {
  const styles = useStyles();
  const theme = useTheme();
  const gradientId = useId();
  const window = useWindowDimensions();
  const { locale, dict, m } = useI18n();
  const t = dict.students.timelineChart;
  const [period, setPeriod] = useState<TimelinePeriod>('7d');
  const [width, setWidth] = useState(0);
  // The selection belongs to one period's points.
  const [selected, setSelected] = useState<{ period: TimelinePeriod; index: number } | null>(null);

  const view = buildProgressTimelineView([...entries], period, dict.students.timeline, locale);
  const chart = buildTimelineChartGeometry(view.points.map((point) => point.closedCount));
  const selectedIndex = selected && selected.period === period && selected.index < view.points.length ? selected.index : null;
  const selectedPoint = selectedIndex === null ? null : view.points[selectedIndex];

  const plotWidth = Math.max(0, width - SIDE * 2);
  const px = (x: number) => SIDE + (x / 100) * plotWidth;
  const py = (y: number) => TOP + (y / 100) * PLOT_HEIGHT;
  const pathOf = (d: string) =>
    // The geometry is in a 0..100 box: scale every coordinate pair into the measured plot.
    d.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (_pair, x: string, y: string) => `${px(Number(x))} ${py(Number(y))}`);

  const trendIcon = view.trend.direction === 'up' ? 'arrowUp' : view.trend.direction === 'down' ? 'arrowDown' : 'forward';
  const pointTitle = (index: number) => {
    const point = view.points[index];
    return format(t.pointTitle, { label: point?.label ?? '', n: point?.closedCount ?? 0 });
  };
  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);
  const columnWidth = chart && chart.points.length > 1 ? plotWidth / (chart.points.length - 1) : plotWidth;

  return (
    <View style={styles.root} testID="stats-timeline">
      <Segmented
        options={PERIODS.map((key) => ({ value: key, label: key === '7d' ? t.period7d : key === '4w' ? t.period4w : t.period8w }))}
        value={period}
        onChange={setPeriod}
        accessibilityLabel={m.stats.chart.periodAria}
        fill
        plain
        testID="stats-timeline-period"
      />

      <View style={styles.totals}>
        <TotalPill label={t.closed} value={view.closedTotal} tone="closed" testID="stats-timeline-closed" />
        <TotalPill label={t.red} value={view.redTotal} tone="red" testID="stats-timeline-red" />
      </View>

      <View style={styles.trend} testID="stats-timeline-trend">
        <Icon name={trendIcon} size={14} color="accentSolid" />
        <Text variant="label" color="textMuted" style={styles.trendLabel}>
          {view.trend.label}
        </Text>
      </View>

      <Hint>
        <Text variant="hint" color="textMuted">
          {selectedStudentName ? format(t.onlyStudent, { name: selectedStudentName }) : t.allStudents}
        </Text>
      </Hint>

      <View style={styles.panel}>
        <Text variant="cardTitle" accessibilityRole="header">
          {view.title}
        </Text>

        {chart ? (
          <View onLayout={onLayout}>
            {width > 0 ? (
              <>
                <View style={styles.plot}>
                  <Svg width={width} height={PLOT_HEIGHT + TOP * 2}>
                    <Defs>
                      <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                        <Stop offset="0" stopColor={theme.colors.accentSolid} stopOpacity={0.26} />
                        <Stop offset="1" stopColor={theme.colors.accentSolid} stopOpacity={0} />
                      </LinearGradient>
                    </Defs>
                    <Line x1={px(0)} y1={py(0)} x2={px(100)} y2={py(0)} stroke={theme.colors.softBorder} strokeWidth={1} />
                    <Line x1={px(0)} y1={py(50)} x2={px(100)} y2={py(50)} stroke={theme.colors.softBorder} strokeWidth={1} />
                    <Line x1={px(0)} y1={py(100)} x2={px(100)} y2={py(100)} stroke={theme.colors.progressTrack} strokeWidth={1} />
                    <Path d={pathOf(chart.area)} fill={`url(#${gradientId})`} />
                    <Path
                      d={pathOf(chart.line)}
                      fill="none"
                      stroke={theme.colors.accentSolid}
                      strokeWidth={2.5}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                    {chart.points.map((point, index) => (
                      <Circle
                        key={`dot-${index}`}
                        cx={px(point.x)}
                        cy={py(point.y)}
                        r={index === selectedIndex ? DOT_RADIUS + 1.5 : DOT_RADIUS}
                        fill={index === selectedIndex ? theme.colors.accentSolid : theme.colors.cardBg}
                        stroke={theme.colors.accentSolid}
                        strokeWidth={2.5}
                      />
                    ))}
                  </Svg>
                  {/* One full-height touch column per point: a dot alone is too small to hit. */}
                  {chart.points.map((point, index) => (
                    <PressableScale
                      key={`hit-${index}`}
                      accessibilityRole="button"
                      accessibilityLabel={pointTitle(index)}
                      accessibilityState={{ selected: index === selectedIndex }}
                      onPress={() => setSelected(index === selectedIndex ? null : { period, index })}
                      scaleTo={1}
                      // Columns tile the plot without overlapping: a tap always selects the nearest point.
                      style={[styles.hit, { left: px(point.x) - columnWidth / 2, width: columnWidth }]}
                      testID={`stats-timeline-point-${index}`}
                    />
                  ))}
                </View>
                <View style={styles.labels} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                  {chart.points.map((point, index) =>
                    window.width >= point.labelFrom ? (
                      <Text
                        key={`label-${index}`}
                        variant="captionStrong"
                        color="textMuted"
                        numberOfLines={1}
                        align="center"
                        style={[styles.label, { left: px(point.x) - LABEL_WIDTH / 2 }]}
                      >
                        {view.points[index]?.label}
                      </Text>
                    ) : null,
                  )}
                </View>
              </>
            ) : (
              <View style={styles.placeholder} />
            )}

            {selectedPoint && selectedIndex !== null ? (
              <Text variant="smallStrong" align="center" accessibilityLiveRegion="polite" testID="stats-timeline-selected">
                {pointTitle(selectedIndex)}
              </Text>
            ) : (
              <Hint>
                <Text variant="hint" color="textMuted" align="center">
                  {m.stats.chart.pointHint}
                </Text>
              </Hint>
            )}
          </View>
        ) : (
          <Text variant="small" color="textMuted" align="center" style={styles.empty} testID="stats-timeline-empty">
            {t.empty}
          </Text>
        )}
      </View>
    </View>
  );
}

const LABEL_WIDTH = 72;

function TotalPill({ label, value, tone, testID }: { label: string; value: number; tone: 'closed' | 'red'; testID: string }) {
  const styles = useStyles();
  const theme = useTheme();
  const mark = tone === 'closed' ? theme.colors.accentSolid : theme.colors.dangerSolid;
  return (
    <View
      style={[styles.pill, { backgroundColor: tone === 'closed' ? theme.colors.greenSoft : theme.colors.redSoft }]}
      accessible
      accessibilityLabel={`${label} ${value}`}
      testID={testID}
    >
      <View style={[styles.pillDot, { backgroundColor: mark }]} />
      <Text variant="label" color="label">
        {label}
      </Text>
      <Text variant="smallExtra" tabular style={{ color: mark }}>
        {value}
      </Text>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  root: { gap: t.space.md },
  totals: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.sm },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space.xs,
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: t.radii.md,
  },
  pillDot: { width: 9, height: 9, borderRadius: t.radii.full },
  trend: { flexDirection: 'row', alignItems: 'center', gap: t.space.xs },
  trendLabel: { flex: 1, minWidth: 0 },
  panel: {
    gap: t.space.md,
    paddingVertical: t.space.gutter,
    borderRadius: t.radii.lg,
    borderWidth: t.borders.hairline,
    borderColor: t.colors.softBorder,
    backgroundColor: t.colors.panelBg,
    paddingHorizontal: t.space.gutter,
  },
  plot: { height: PLOT_HEIGHT + TOP * 2 },
  hit: { position: 'absolute', top: 0, bottom: 0 },
  labels: { height: 18, marginBottom: t.space.sm },
  label: { position: 'absolute', top: 0, width: LABEL_WIDTH },
  placeholder: { height: PLOT_HEIGHT + TOP * 2 + 18 },
  empty: { paddingVertical: t.space.headerGap },
}));
