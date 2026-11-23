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
import { InsightBox } from '../parts/insight-box';
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
 * View «Прогресс учеников» (06 §1.6.a; layout: mockup D-stats): the summary figures, then cards — the
 * progress timeline, how the issued homework is solved, the rankings by student and by topic, and the
 * per-student slice of one topic. A tablet puts the cards two in a row.
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

  return (
    <View style={styles.view} testID="stats-view-teacher">
      <MetricGrid cards={progressMetricCards(homework, t)} />

      <Columns weights={[3, 2]}>
        <StatsCard title={t.progressDynamics}>
          <PickerField
            label={dict.students.timelineFilter.label}
            options={[
              { value: ALL_STUDENTS, label: dict.students.timelineFilter.all },
              ...overview.students.map((student) => ({ value: student.id, label: student.name })),
            ]}
            value={timelineStudent?.id ?? ALL_STUDENTS}
            onChange={(value) => onTimelineStudentChange(value === ALL_STUDENTS ? undefined : value)}
            disabled={filterPending}
            testID="stats-timeline-student"
          />
          <TimelineChart entries={data.timeline} selectedStudentName={timelineStudent?.name ?? null} />
        </StatsCard>

        <StatsCard title={t.howIssuedSolved}>
          <DonutChart
            segments={segments}
            total={homework.issuedNumbersTotal}
            centerValue={`${issuedSolvedPercent(homework)}%`}
            centerLabel={t.solved}
            accessibilityLabel={segments
              .map((segment) => format(m.stats.chart.segmentValue, { label: segment.label, value: segment.value, percent: segment.percent }))
              .join(', ')}
          />
          <View>
            {segments.map((segment, index) => (
              <LegendRow key={segment.key} segment={segment} divider={index > 0} />
            ))}
          </View>
          <InsightBox kicker={t.keyInsight} text={issuedInsight(homework, t)} testID="stats-issued-insight" />
        </StatsCard>
      </Columns>

      <Columns>
        <RankingCard
          title={t.mostEngaged}
          subtitle={t.byStudents}
          emptyMessage={t.mostEngagedEmpty}
          items={students.engaged}
          testID="stats-ranking-engaged"
        />
        <RankingCard title={t.needReview} subtitle={t.byStudents} emptyMessage={t.needReviewEmpty} items={students.review} testID="stats-ranking-review" />
      </Columns>

      <Columns>
        <RankingCard title={t.bestMastery} subtitle={t.byTopics} emptyMessage={t.bestMasteryEmpty} items={topics.mastery} testID="stats-ranking-mastery" />
        <RankingCard title={t.helpOften} subtitle={t.byTopics} emptyMessage={t.helpOftenEmpty} items={topics.help} testID="stats-ranking-help" />
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

/** A segment of the donut as a row: the status dot, the name with its note, and «value · percent» as a plain fact. */
function LegendRow({ segment, divider }: { segment: DistributionSegment; divider: boolean }) {
  const styles = useStyles();
  const theme = useTheme();
  const { m } = useI18n();
  return (
    <View
      style={[styles.legendRow, divider ? styles.divider : null]}
      accessible
      accessibilityLabel={`${format(m.stats.chart.segmentValue, { label: segment.label, value: segment.value, percent: segment.percent })}. ${segment.note}`}
      testID={`stats-segment-${segment.key}`}
    >
      <View style={[styles.dot, { backgroundColor: segmentColor(segment.key, theme) }]} />
      <View style={styles.legendText}>
        <Text variant="bodyStrong">{segment.label}</Text>
        <Text variant="small" color="textMuted">
          {segment.note}
        </Text>
      </View>
      <Text variant="small" color="textMuted" tabular>
        {`${segment.value} · ${segment.percent}%`}
      </Text>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  view: { gap: t.space.block },
  legendRow: { minHeight: t.sizes.row, flexDirection: 'row', alignItems: 'center', gap: t.space.md, paddingVertical: t.space.sm },
  divider: { borderTopWidth: t.borders.hairline, borderTopColor: t.colors.rowBorder },
  dot: { width: t.space.md, height: t.space.md, borderRadius: t.radii.full },
  legendText: { flex: 1, minWidth: 0, gap: t.space.xxxs },
}));
