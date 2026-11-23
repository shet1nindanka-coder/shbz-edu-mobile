import { View } from 'react-native';

import type { LessonListItem } from '@/api/types';
import { formatDateTime } from '@/domain/dates';
import { format, plural, useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { Text, accessibilityLabelOf } from '@/ui';

import { lessonAudience, lessonChips, lessonDateOf } from './lessons-list-logic';

export type LessonDetailProps = {
  lesson: LessonListItem;
};

/**
 * The selected lesson in the panel next to the list (tablet; layout: mockup `T-lessons`): its title, when
 * and for whom it is, and what the list knows about its state — the AI selection, failed plans, how many
 * results are marked. Only facts of the list item: the sets themselves live on the board.
 */
export function LessonDetail({ lesson }: LessonDetailProps) {
  const styles = useStyles();
  const { dict, m, locale } = useI18n();
  const common = dict.planner.common;
  const chips = lessonChips(lesson);

  const meta = accessibilityLabelOf(
    [
      formatDateTime(lessonDateOf(lesson), locale),
      format(common.minutesShort, { n: lesson.durationMinutes }),
      lessonAudience(lesson),
      plural(locale, lesson.participantsCount, common.studentForms),
    ],
    ' · ',
  );

  return (
    <View style={styles.block} testID={`lesson-detail-${lesson.id}`}>
      <View style={styles.titles}>
        <Text variant="sectionTitle" accessibilityRole="header">
          {lesson.title}
        </Text>
        <Text variant="small" color="textMuted" tabular>
          {meta}
        </Text>
      </View>
      <View style={styles.facts}>
        <Text variant="bodyStrong">{dict.planner.lessonStatus[lesson.status]}</Text>
        {chips.selecting ? (
          <Text variant="small" color="textMuted" tabular>
            {format(dict.planner.lessonsList.selectionInProgress, chips.selecting)}
          </Text>
        ) : null}
        {chips.errors !== null ? (
          <Text variant="small" color="redText" tabular>
            {format(common.errorsCount, { n: chips.errors })}
          </Text>
        ) : null}
        {lesson.resultsTotal > 0 ? (
          <Text variant="small" color="textMuted" tabular>
            {format(m.planner.lessonsList.resultsOf, { done: lesson.resultsMarked, total: lesson.resultsTotal })}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  block: { gap: t.space.lg },
  titles: { gap: t.space.xxs },
  facts: { gap: t.space.xxs },
}));
