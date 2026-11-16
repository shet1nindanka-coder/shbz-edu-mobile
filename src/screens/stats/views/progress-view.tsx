import { View } from 'react-native';

import type { StatisticsProgressResponse } from '@/api/types';
import { format, useI18n } from '@/i18n';
import { makeStyles, useTheme } from '@/theme';
import { SectionCard, Text } from '@/ui';

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
import { Drilldown } from '../parts/drilldown';
import { InsightBox } from '../parts/insight-box';
import { MetricGrid } from '../parts/metric-card';
import { PickerField } from '../parts/picker-field';
import { RankingCard } from '../parts/ranking-card';

/** Value of «Все ученики» in the timeline filter. */
const ALL_STUDENTS = '';

export type ProgressViewProps = {
  data: StatisticsProgressResponse;
  /** The timeline filter is being applied: the select waits for the new timeline. */
  filterPending: boolean;
  onTimelineStudentChange: (studentId: string | undefined) => void;
};

/**
 * View «Прогресс учеников» (06 §1.6.a): how the issued homework is solved, the progress timeline, the
 * rankings by student and by topic, and the per-student slice of one topic.
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

      <SectionCard title={t.progressDynamics}>
        <View style={styles.stack}>
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
        </View>
      </SectionCard>

      <SectionCard title={t.howIssuedSolved}>
        <View style={styles.stack}>
          <DonutChart
            segments={segments}
            total={homework.issuedNumbersTotal}
            centerValue={`${issuedSolvedPercent(homework)}%`}
            centerLabel={t.solved}
            accessibilityLabel={segments
              .map((segment) => format(m.stats.chart.segmentValue, { label: segment.label, value: segment.value, percent: segment.percent }))
              .join(', ')}
          />
          <View style={styles.legend}>
            {segments.map((segment) => (
              <LegendRow key={segment.key} segment={segment} />
            ))}
          </View>
          <InsightBox kicker={t.keyInsight} text={issuedInsight(homework, t)} testID="stats-issued-insight" />
        </View>
      </SectionCard>

      <SectionCard title={t.byStudents}>
        <View style={styles.rankings}>
          <RankingCard title={t.mostEngaged} emptyMessage={t.mostEngagedEmpty} items={students.engaged} testID="stats-ranking-engaged" />
          <RankingCard title={t.needReview} emptyMessage={t.needReviewEmpty} items={students.review} testID="stats-ranking-review" />
        </View>
      </SectionCard>

      <SectionCard title={t.byTopics}>
        <View style={styles.rankings}>
          <RankingCard title={t.bestMastery} emptyMessage={t.bestMasteryEmpty} items={topics.mastery} testID="stats-ranking-mastery" />
          <RankingCard title={t.helpOften} emptyMessage={t.helpOftenEmpty} items={topics.help} testID="stats-ranking-help" />
        </View>
      </SectionCard>

      <SectionCard title={t.drilldownTitle}>
        <Drilldown
          topics={overview.topics.map((topic) => ({ id: topic.id, title: topic.title }))}
          students={overview.students.map((student) => ({ id: student.id, name: student.name }))}
        />
      </SectionCard>
    </View>
  );
}

function LegendRow({ segment }: { segment: DistributionSegment }) {
  const styles = useStyles();
  const theme = useTheme();
  const { m } = useI18n();
  return (
    <View
      style={styles.legendRow}
      accessible
      accessibilityLabel={`${format(m.stats.chart.segmentValue, { label: segment.label, value: segment.value, percent: segment.percent })}. ${segment.note}`}
      testID={`stats-segment-${segment.key}`}
    >
      <View style={[styles.dot, { backgroundColor: segmentColor(segment.key, theme) }]} />
      <View style={styles.legendText}>
        <Text variant="smallBold">{segment.label}</Text>
        <Text variant="caption" color="textMuted">
          {segment.note}
        </Text>
      </View>
      <View style={styles.legendValue}>
        <Text variant="smallExtra" tabular>
          {segment.value}
        </Text>
        <Text variant="caption" color="textMuted" tabular>
          {`${segment.percent}%`}
        </Text>
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  view: { gap: t.space.sectionGap - t.space.md },
  stack: { gap: t.space.field },
  rankings: { gap: t.space.xl },
  legend: { gap: t.space.sm },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space.md,
    paddingVertical: t.space.md,
    paddingHorizontal: t.space.gutter,
    borderRadius: t.radii.lg,
    borderWidth: t.borders.hairline,
    borderColor: t.colors.softBorder,
    backgroundColor: t.colors.softBg,
  },
  dot: { width: 12, height: 12, borderRadius: t.radii.full },
  legendText: { flex: 1, minWidth: 0 },
  legendValue: { alignItems: 'flex-end' },
}));
