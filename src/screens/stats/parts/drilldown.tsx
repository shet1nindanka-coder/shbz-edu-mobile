import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { errorText, qk, retryAfterOf, useApi } from '@/api';
import type { HomeworkNumberStatus } from '@/api/types';
import { RetryWaitLine, useWaitClock, useWaitText } from '@/components/retry-wait';
import { useI18n } from '@/i18n';
import { makeStyles, useTheme } from '@/theme';
import { Card, Select, StatusBar, Text, TextButton } from '@/ui';

import {
  EMPTY_DRILLDOWN_METRICS,
  WHOLE_TOPIC,
  drilldownInsight,
  drilldownMetrics,
  homeworkOptions,
  resolveHomeworkSelection,
  type DrilldownMetrics,
} from '../logic';
import { InsightBox } from './insight-box';
import { PickerField } from './picker-field';
import { ProgressRow } from './progress-row';

export type DrilldownProps = {
  topics: readonly { id: string; title: string }[];
  students: readonly { id: string; name: string }[];
};

const STATUS_CARDS: readonly { status: HomeworkNumberStatus; label: 'green' | 'yellow' | 'red'; count: keyof DrilldownMetrics }[] = [
  { status: 'GREEN', label: 'green', count: 'greenCount' },
  { status: 'YELLOW', label: 'yellow', count: 'yellowCount' },
  { status: 'RED', label: 'red', count: 'redCount' },
];

/**
 * «Срез по теме и ученику» (06 §1.6.a item 6, §3.12, §4.6): one student's statuses in one topic, loaded
 * on demand for the selected pair — the pickers, two shares, the bar by status with the three counts and
 * the sentence «Сейчас». A tablet puts the pickers next to the numbers. The "homework" options are
 * inferred from equal deadlines.
 */
export function Drilldown({ topics, students }: DrilldownProps) {
  const styles = useStyles();
  const theme = useTheme();
  const api = useApi();
  const { locale, dict, m } = useI18n();
  const waitText = useWaitText();
  const t = dict.planner.drilldown;
  // The pair is pinned by id when the lists first arrive, as the site's `useState(topics[0]?.id)`: a refetch
  // that reorders the rows (a topic moved up, a new student sorted first) must not change the slice.
  const [topicId, setTopicId] = useState<string | null>(topics[0]?.id ?? null);
  const [studentId, setStudentId] = useState<string | null>(students[0]?.id ?? null);
  const [homeworkId, setHomeworkId] = useState(WHOLE_TOPIC);

  // A selection that left the lists (a deleted topic or student), or none yet, falls back to the first
  // row, which is then pinned in its turn.
  const topic = topics.find((item) => item.id === topicId) ?? topics[0] ?? null;
  const student = students.find((item) => item.id === studentId) ?? students[0] ?? null;
  if (topic && topic.id !== topicId) setTopicId(topic.id);
  if (student && student.id !== studentId) setStudentId(student.id);

  const slice = useQuery({
    queryKey: qk('groups', 'getStatisticsDrilldown', topic?.id ?? '', student?.id ?? ''),
    queryFn: () => api.groups.getStatisticsDrilldown(topic?.id ?? '', student?.id ?? ''),
    enabled: topic !== null && student !== null,
    // The site asks with `no-store`: the slice is always fetched for the pair on screen.
    staleTime: 0,
    // The previous pair's numbers stay under «Загружаем срез…», as on the site.
    placeholderData: keepPreviousData,
  });

  // `429 rateLimited` names a wait: "try again" is offered only after it.
  const wait = slice.isError ? retryAfterOf(slice.error) : 0;
  // A duration from the failure, not a deadline on the device clock (a clock set back must not lengthen it).
  const errorAt = slice.errorUpdatedAt;
  const waitStart = useMemo(() => (wait > 0 ? { seconds: wait, at: errorAt } : null), [wait, errorAt]);
  const waitSeconds = useWaitClock(waitStart);

  if (topics.length === 0 || students.length === 0) {
    return (
      <Text variant="small" color="textMuted" style={styles.notEnough} testID="stats-drilldown-empty">
        {t.notEnoughData}
      </Text>
    );
  }

  // Offline the request waits for the connection instead of failing: that is an error for the reader,
  // not an endless «Загружаем срез…».
  const stalled = slice.fetchStatus === 'paused' && (slice.isPending || slice.isPlaceholderData || slice.isError);
  const loading = !stalled && (slice.isPending || slice.isPlaceholderData || (slice.isError && slice.isFetching));
  const loadError = stalled ? m.common.errors.network : slice.isError && !slice.isFetching ? errorText(slice.error, t.loadFailed) : null;
  // On a failure the counts fall to zero, as on the site.
  const numbers = stalled || slice.isError ? [] : (slice.data?.numbers ?? []);
  const options = homeworkOptions(numbers, t, locale);
  const selectedHomeworkId = resolveHomeworkSelection(homeworkId, options);
  const selectedHomework = options.find((option) => option.id === selectedHomeworkId) ?? null;
  const metrics = topic && student ? drilldownMetrics(numbers, selectedHomeworkId) : EMPTY_DRILLDOWN_METRICS;
  const insight = drilldownInsight(
    { studentName: student?.name ?? null, hasTopic: topic !== null, loadError, loading, homework: selectedHomework, metrics },
    t,
  );

  return (
    <View style={styles.root} testID="stats-drilldown">
      <View style={styles.pickers}>
        <PickerField
          label={t.topic}
          options={topics.map((item) => ({ value: item.id, label: item.title }))}
          value={topic?.id ?? ''}
          onChange={setTopicId}
          testID="stats-drilldown-topic"
        />
        <PickerField
          label={t.student}
          options={students.map((item) => ({ value: item.id, label: item.name }))}
          value={student?.id ?? ''}
          onChange={setStudentId}
          testID="stats-drilldown-student"
        />
        <Select
          label={t.homework}
          options={[
            { value: WHOLE_TOPIC, label: t.wholeTopic },
            ...options.map((option) => ({ value: option.id, label: `${option.label} · ${option.deadlineLabel}` })),
          ]}
          value={selectedHomeworkId}
          onChange={setHomeworkId}
          placeholder={t.wholeTopic}
          closeLabel={m.common.actions.close}
          size="sm"
          testID="stats-drilldown-homework"
        />
      </View>

      <View style={styles.numbers}>
        <ProgressRow row={{ label: t.solvedInTopic, value: `${metrics.solvedCount} / ${metrics.totalNumbers}`, percent: metrics.solvedPercent }} />
        <ProgressRow row={{ label: t.markedAtAll, value: `${metrics.markedCount} / ${metrics.totalNumbers}`, percent: metrics.markedPercent }} />

        {/* Status data: the one place of the block where the status colours belong. */}
        <StatusBar
          counts={{ green: metrics.greenCount, yellow: metrics.yellowCount, red: metrics.redCount, none: metrics.unmarkedCount }}
          accessibilityLabel={STATUS_CARDS.map((card) => `${t[card.label]}: ${metrics[card.count]}`).join(', ')}
        />
        <View style={styles.statuses}>
          {STATUS_CARDS.map((card) => (
            <Card
              key={card.status}
              style={styles.status}
              accessibilityLabel={`${t[card.label]}: ${metrics[card.count]}`}
              testID={`stats-drilldown-${card.label}`}
            >
              <View style={styles.statusHead}>
                <View style={[styles.dot, { backgroundColor: theme.status[card.status].solid }]} />
                <Text variant="small" color="textMuted" numberOfLines={1} style={styles.statusLabel}>
                  {t[card.label]}
                </Text>
              </View>
              <Text variant="metric" tabular>
                {metrics[card.count]}
              </Text>
            </Card>
          ))}
        </View>

        <InsightBox caption={t.now} text={insight} testID="stats-drilldown-insight" />

        {/* SPEC-GAP: the site has no retry here (changing a select refetches); a phone needs an explicit one. */}
        {loadError ? (
          <View style={styles.retry}>
            <RetryWaitLine seconds={waitSeconds} testID="stats-drilldown-wait" />
            <TextButton
              label={dict.common.retry}
              accessibilityLabel={
                waitSeconds > 0 ? `${dict.common.retry}: ${waitText.time(waitSeconds)}` : dict.common.retry
              }
              onPress={() => void slice.refetch()}
              disabled={waitSeconds > 0}
              testID="stats-drilldown-retry"
            />
          </View>
        ) : null}
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  root: t.tablet ? { flexDirection: 'row', alignItems: 'flex-start', gap: t.space.xl } : { gap: t.space.lg },
  pickers: { gap: t.space.md, ...(t.tablet ? { flex: 2, minWidth: 0 } : null) },
  numbers: { gap: t.space.lg, ...(t.tablet ? { flex: 3, minWidth: 0 } : null) },
  notEnough: { paddingVertical: t.space.lg },
  statuses: { flexDirection: 'row', gap: t.space.sm },
  // Narrow side paddings: three boxes share a 320 pt phone, and «Зелёные» / «Красные» must stay whole.
  status: { flex: 1, minWidth: 0, gap: t.space.xxs, paddingHorizontal: t.space.md },
  statusHead: { flexDirection: 'row', alignItems: 'center', gap: t.space.xs },
  statusLabel: { flexShrink: 1 },
  dot: { width: t.space.sm, height: t.space.sm, borderRadius: t.radii.full },
  retry: { alignItems: 'flex-start', gap: t.space.xs },
}));
