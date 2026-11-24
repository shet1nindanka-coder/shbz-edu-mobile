import { View } from 'react-native';

import type { LessonListItem } from '@/api/types';
import { format, useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { Chip, MetricPill, Text, accessibilityLabelOf } from '@/ui';

import { rowDateTime } from '../shared/row-date';
import { lessonChips, lessonDateOf } from './lessons-list-logic';

export type LessonDetailProps = {
  lesson: LessonListItem;
  /** The list's server-corrected clock: the year of the date is left out within the current one. */
  now: number;
};

/**
 * The selected lesson in the panel next to the list (tablet; layout: mockup `T-lessons`): its title, when
 * it is and how long, and what the list knows about its state as figures with a one-word name — students,
 * marked results, the AI selection, failed plans (red). Only facts of the list item: the sets themselves
 * live on the board.
 */
export function LessonDetail({ lesson, now }: LessonDetailProps) {
  const styles = useStyles();
  const { dict, m, locale } = useI18n();
  const common = dict.planner.common;
  const names = m.planner.lessonsList;
  const chips = lessonChips(lesson);
  const doneOf = m.common.numbers.doneOf;

  const meta = accessibilityLabelOf(
    [rowDateTime(lessonDateOf(lesson), now, locale), format(common.minutesShort, { n: lesson.durationMinutes })],
    ' · ',
  );

  return (
    <View style={styles.block} testID={`lesson-detail-${lesson.id}`}>
      <View style={styles.titles}>
        <Text variant="sectionTitle" accessibilityRole="header">
          {lesson.title}
        </Text>
        <View style={styles.meta}>
          <Text variant="small" color="textMuted" tabular>
            {meta}
          </Text>
          {lesson.status === 'ACTIVE' ? <Chip tone="accent" label={dict.planner.lessonStatus.ACTIVE} /> : null}
        </View>
      </View>
      <View style={styles.figures}>
        <MetricPill label={dict.planner.homeworkPlans.createForm.studentsLabel} value={lesson.participantsCount} />
        {lesson.resultsTotal > 0 ? (
          <MetricPill label={names.results} value={format(doneOf, { done: lesson.resultsMarked, total: lesson.resultsTotal })} />
        ) : null}
        {chips.selecting ? <MetricPill label={names.selecting} value={format(doneOf, { done: chips.selecting.ready, total: chips.selecting.total })} /> : null}
        {chips.errors !== null ? <MetricPill label={names.errors} value={chips.errors} tone="danger" /> : null}
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  block: { gap: t.space.lg },
  titles: { gap: t.space.xs },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: t.space.xs },
  figures: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.xs },
}));
