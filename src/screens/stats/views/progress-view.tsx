import { View } from 'react-native';

import type { StatisticsProgressResponse } from '@/api/types';
import { format, useI18n } from '@/i18n';
import { makeStyles, useTheme } from '@/theme';
import { Text } from '@/ui';

import { DonutChart } from '../charts/donut-chart';
import { segmentColor } from '../charts/palette';
import { TimelineChart } from '../charts/timeline-chart';
import {
  issuedInsight,
  issuedSegments,
  issuedSolvedPercent,
  progressMetricCards,
  studentRankings,
  topicRankings,
  type DistributionSegment,
} from '../logic';
import { Columns } from '../parts/columns';
import { Drilldown } from '../parts/drilldown';
import { MetricGrid } from '../parts/metric-card';
import { PickerField } from '../parts/picker-field';
import { RankingCard } from '../parts/ranking-card';
import { StatsCard } from '../parts/stats-card';

/** Value of «Все ученики» in the timeline filter. */
const ALL_STUDENTS = '';

export type ProgressViewProps = {
  data: StatisticsProgressResponse;
  /** The timeline filter is being applied: the select waits for the new timeline. */
  filterPending: boolean;
  onTimelineStudentChange: (studentId: string | undefined) => void;
};

/**
 * View «Прогресс учеников» (06 §1.6.a; layout: mockup D-stats; text diet §1a): the summary figures, then
 * cards — the progress timeline, how the issued homework is solved, the rankings by student and by topic,
 * and the per-student slice of one topic. A card is a short title and its chart or rows: the site's notes,
 * legend descriptions and «Ключевой вывод» are read out by a screen reader, not drawn. A tablet puts the
 * cards two in a row.
 */
export function ProgressView({ data, filterPending, onTimelineStudentChange }: ProgressViewProps) {
  const styles = useStyles();
  const { dict, m } = useI18n();
  const t = dict.planner.statistics;
  const { overview, homework } = data;

  const timelineStudent = overview.students.find((student) => student.id === data.timelineStudentId) ?? null;
  const segments = issuedSegments(homework, t);
  const students = studentRankings(overview, t);
  const topics = topicRankings(overview, t);
  const segmentsSpoken = segments
    .map((segment) => format(m.stats.chart.segmentValue, { label: segment.label, value: segment.value, percent: segment.percent }))
    .join(', ');

  return (
    <View style={styles.view} testID="stats-view-teacher">
      <MetricGrid cards={progressMetricCards(homework, t)} captions={{ solvedOfIssued: m.stats.short.solved }} />

      <Columns weights={[3, 2]}>
        <StatsCard title={t.progressDynamics}>
          <PickerField
            label={dict.students.timelineFilter.aria}
            options={[
              { value: ALL_STUDENTS, label: dict.students.timelineFilter.all },
              ...overview.students.map((student) => ({ value: student.id, label: student.name })),
            ]}
            value={timelineStudent?.id ?? ALL_STUDENTS}
            onChange={(value) => onTimelineStudentChange(value === ALL_STUDENTS ? undefined : value)}
            disabled={filterPending}
            testID="stats-timeline-student"
          />
          <TimelineChart entries={data.timeline} />
        </StatsCard>

        <StatsCard title={m.stats.short.issued} titleAccessibilityLabel={t.howIssuedSolved}>
          <DonutChart
            segments={segments}
            total={homework.issuedNumbersTotal}
            centerValue={`${issuedSolvedPercent(homework)}%`}
            centerLabel={t.solved}
            // The conclusion the site prints under the chart is said with it.
            accessibilityLabel={`${segmentsSpoken}. ${issuedInsight(homework, t)}`}
          />
          <View style={styles.legend}>
            {segments.map((segment) => (
              <LegendItem key={segment.key} segment={segment} />
            ))}
          </View>
        </StatsCard>
      </Columns>

      <Columns>
        <RankingCard title={t.mostEngaged} emptyMessage={t.mostEngagedEmpty} items={students.engaged} testID="stats-ranking-engaged" />
        <RankingCard title={t.needReview} emptyMessage={t.needReviewEmpty} items={students.review} testID="stats-ranking-review" />
      </Columns>

      <Columns>
        <RankingCard title={t.bestMastery} emptyMessage={t.bestMasteryEmpty} items={topics.mastery} testID="stats-ranking-mastery" />
        <RankingCard title={t.helpOften} emptyMessage={t.helpOftenEmpty} items={topics.help} testID="stats-ranking-help" />
      </Columns>

      <StatsCard title={t.drilldownTitle}>
        <Drilldown
          topics={overview.topics.map((topic) => ({ id: topic.id, title: topic.title }))}
          students={overview.students.map((student) => ({ id: student.id, name: student.name }))}
        />
      </StatsCard>
    </View>
  );
}

/**
 * A segment of the donut in the legend: the status dot, one word and the count. The site's description
 * («Уверенно решены») and the share are read out, not drawn.
 */
function LegendItem({ segment }: { segment: DistributionSegment }) {
  const styles = useStyles();
  const theme = useTheme();
  const { m } = useI18n();
  return (
    <View
      style={styles.legendItem}
      accessible
      accessibilityLabel={`${format(m.stats.chart.segmentValue, { label: segment.label, value: segment.value, percent: segment.percent })}. ${segment.note}`}
      testID={`stats-segment-${segment.key}`}
    >
      <View style={[styles.dot, { backgroundColor: segmentColor(segment.key, theme) }]} />
      <Text variant="small" color="textMuted" numberOfLines={1} style={styles.legendLabel}>
        {segment.label}
      </Text>
      <Text variant="bodyStrong" tabular>
        {segment.value}
      </Text>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  view: { gap: t.space.block },
  // Two columns of «dot · word · count»: the four statuses take two short lines under the donut.
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: t.space.xl, rowGap: t.space.xs },
  legendItem: { flexBasis: '40%', flexGrow: 1, minWidth: 0, minHeight: t.sizes.control.xs, flexDirection: 'row', alignItems: 'center', gap: t.space.sm },
  legendLabel: { flex: 1, minWidth: 0 },
  dot: { width: t.space.sm, height: t.space.sm, borderRadius: t.radii.full },
}));
