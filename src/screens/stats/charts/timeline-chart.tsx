import { useId, useState } from 'react';
import { View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';

import type { TimelineEntry } from '@/api/types';
import { buildProgressTimelineView, buildTimelineChartGeometry, type TimelinePeriod } from '@/domain/progress-timeline';
import { format, useI18n } from '@/i18n';
import { makeStyles, useTheme } from '@/theme';
import { Card, Icon, Segmented, Text, type IconName } from '@/ui';

import { nearestPointIndex } from '../logic';
import { ChartHitArea, ChartStepper } from './chart-selection';
import { accentStops } from './palette';

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
};

/**
 * «Динамика прогресса» (06 §1.6.a item 2, §4.5; mockup D-stats; text diet §1a): period switch, the closed /
 * red totals as plain figures — the trend against the previous window is an arrow next to «Закрыто», its
 * sentence is read out — and a line of closed numbers per day or week in the accent gradient. The site
 * shows a point's value on hover; here the whole plot is one touch target (a tap selects the nearest
 * point), the arrows under it step point by point, and the caption between them names the selected one.
 */
export function TimelineChart({ entries }: TimelineChartProps) {
  const styles = useStyles();
  const theme = useTheme();
  const gradientId = useId();
  const accent = accentStops(theme);
  const window = useWindowDimensions();
  const { locale, dict, m } = useI18n();
  const t = dict.students.timelineChart;
  const [period, setPeriod] = useState<TimelinePeriod>('7d');
  const [width, setWidth] = useState(0);
  // The selection belongs to one period's points and is kept by the point's key (its day or week), not by
  // position: a refetch after midnight shifts every point of the period.
  const [selected, setSelected] = useState<{ period: TimelinePeriod; key: string } | null>(null);

  const view = buildProgressTimelineView([...entries], period, dict.students.timeline, locale);
  const chart = buildTimelineChartGeometry(view.points.map((point) => point.closedCount));
  const keptIndex = selected && selected.period === period ? view.points.findIndex((point) => point.key === selected.key) : -1;
  const selectedIndex = keptIndex === -1 ? null : keptIndex;
  const selectedPoint = selectedIndex === null ? null : view.points[selectedIndex];

  const plotWidth = Math.max(0, width - SIDE * 2);
  const px = (x: number) => SIDE + (x / 100) * plotWidth;
  const py = (y: number) => TOP + (y / 100) * PLOT_HEIGHT;
  const pathOf = (d: string) =>
    // The geometry is in a 0..100 box: scale every coordinate pair into the measured plot.
    d.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (_pair, x: string, y: string) => `${px(Number(x))} ${py(Number(y))}`);

  const trendIcon: IconName | undefined = view.trend.direction === 'up' ? 'arrowUp' : view.trend.direction === 'down' ? 'arrowDown' : undefined;
  const pointTitle = (index: number) => {
    const point = view.points[index];
    return format(t.pointTitle, { label: point?.label ?? '', n: point?.closedCount ?? 0 });
  };
  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);
  const select = (index: number | null) => {
    const point = index === null ? undefined : view.points[index];
    setSelected(point ? { period, key: point.key } : null);
  };

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
        <TotalBox label={t.closed} value={view.closedTotal} icon={trendIcon} spoken={view.trend.label} testID="stats-timeline-closed" />
        <TotalBox label={t.red} value={view.redTotal} attention testID="stats-timeline-red" />
      </View>

      <View>
        {chart ? (
          <View onLayout={onLayout}>
            {width > 0 ? (
              <>
                <View style={styles.plot}>
                  <Svg width={width} height={PLOT_HEIGHT + TOP * 2}>
                    <Defs>
                      <LinearGradient id={`${gradientId}-area`} x1="0" y1="0" x2="0" y2="1">
                        <Stop offset="0" stopColor={accent.to} stopOpacity={0.26} />
                        <Stop offset="1" stopColor={accent.to} stopOpacity={0} />
                      </LinearGradient>
                      {/* In plot coordinates: a flat line has no bounding box for the gradient to span. */}
                      <LinearGradient id={`${gradientId}-line`} gradientUnits="userSpaceOnUse" x1={px(0)} y1="0" x2={px(100)} y2="0">
                        <Stop offset="0" stopColor={accent.from} />
                        <Stop offset="1" stopColor={accent.to} />
                      </LinearGradient>
                    </Defs>
                    <Line x1={px(0)} y1={py(0)} x2={px(100)} y2={py(0)} stroke={theme.colors.line} strokeWidth={1} />
                    <Line x1={px(0)} y1={py(50)} x2={px(100)} y2={py(50)} stroke={theme.colors.line} strokeWidth={1} />
                    <Line x1={px(0)} y1={py(100)} x2={px(100)} y2={py(100)} stroke={theme.colors.line2} strokeWidth={1} />
                    <Path d={pathOf(chart.area)} fill={`url(#${gradientId}-area)`} />
                    <Path
                      d={pathOf(chart.line)}
                      fill="none"
                      stroke={`url(#${gradientId}-line)`}
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
                        fill={index === selectedIndex ? accent.to : theme.colors.cardBg}
                        stroke={accent.to}
                        strokeWidth={2.5}
                      />
                    ))}
                  </Svg>
                  {/* One touch target for the whole plot: a dot — or a column between two of eight — is too
                      small to aim at. */}
                  <ChartHitArea
                    count={chart.points.length}
                    selected={selectedIndex}
                    onSelect={select}
                    indexAt={(x) => nearestPointIndex(x, SIDE, plotWidth, chart.points.length)}
                    accessibilityLabel={view.title}
                    accessibilityValue={selectedIndex !== null ? pointTitle(selectedIndex) : undefined}
                    testID="stats-timeline-plot"
                  />
                </View>
                <View style={styles.labels} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                  {chart.points.map((point, index) =>
                    window.width >= point.labelFrom ? (
                      <Text
                        key={`label-${index}`}
                        variant="chip"
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

            <ChartStepper count={chart.points.length} selected={selectedIndex} onSelect={select} testID="stats-timeline">
              {selectedPoint && selectedIndex !== null ? (
                <Text variant="smallStrong" align="center" accessibilityLiveRegion="polite" testID="stats-timeline-selected">
                  {pointTitle(selectedIndex)}
                </Text>
              ) : null}
            </ChartStepper>
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

type TotalBoxProps = {
  label: string;
  value: number;
  attention?: boolean;
  /** A glyph after the figure: which way it moved against the previous window. */
  icon?: IconName;
  /** What the glyph means, for a screen reader («+25 закрыто (+179%) к прошлой неделе»). */
  spoken?: string;
  testID: string;
};

/** «Закрыто» / «Красных» of the period: a plain figure in a soft box; the red count is coloured only when there is one. */
function TotalBox({ label, value, attention = false, icon, spoken, testID }: TotalBoxProps) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <Card style={styles.total} accessibilityLabel={[`${label} ${value}`, spoken].filter(Boolean).join('. ')} testID={testID}>
      <Text variant="small" color="textMuted" numberOfLines={1}>
        {/* The site writes «Закрыто: 12» in one line; a caption above its figure needs no colon. */}
        {label.replace(/:\s*$/, '')}
      </Text>
      <View style={styles.totalValue}>
        <Text variant="cardTitle" color={attention && value > 0 ? 'redText' : 'textStrong'} tabular>
          {value}
        </Text>
        {icon ? <Icon name={icon} size={theme.sizes.icon.sm} color="textMuted" /> : null}
      </View>
    </Card>
  );
}

const useStyles = makeStyles((t) => {
  // One line of the date labels under the plot.
  const labelLine = t.typography.chip.lineHeight ?? t.space.lg;
  return {
    root: { gap: t.space.md },
    totals: { flexDirection: 'row', gap: t.space.sm },
    total: { flex: 1, minWidth: 0, gap: t.space.xxxs },
    totalValue: { flexDirection: 'row', alignItems: 'center', gap: t.space.xs },
    plot: { height: PLOT_HEIGHT + TOP * 2 },
    labels: { height: labelLine, marginBottom: t.space.sm },
    label: { position: 'absolute', top: 0, width: LABEL_WIDTH },
    placeholder: { height: PLOT_HEIGHT + TOP * 2 + labelLine },
    empty: { paddingVertical: t.space.lg },
  };
});
