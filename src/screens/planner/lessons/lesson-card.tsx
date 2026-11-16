import { View } from 'react-native';

import type { LessonListItem } from '@/api/types';
import { formatDateTime } from '@/domain/dates';
import { format, plural, useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { Card, Chip, IconButton, Text } from '@/ui';

import { lessonAudience, lessonChips, lessonDateOf } from './lessons-list-logic';

export type LessonCardProps = {
  lesson: LessonListItem;
  onOpen: (lesson: LessonListItem) => void;
  /** Opens the action sheet (handout, delete). */
  onMore: (lesson: LessonListItem) => void;
};

/**
 * One lesson of the list (docs/spec/05-teacher-lessons-plans.md §1.1 item 4): title, the meta line and
 * the chips. A tap opens the board; the secondary actions sit behind "⋯".
 */
export function LessonCard({ lesson, onOpen, onMore }: LessonCardProps) {
  const styles = useStyles();
  const { dict, m, locale } = useI18n();
  const common = dict.planner.common;
  const chips = lessonChips(lesson);
  const audience = lessonAudience(lesson);

  const meta = [
    formatDateTime(lessonDateOf(lesson), locale),
    audience,
    format(common.minutesShort, { n: lesson.durationMinutes }),
    plural(locale, lesson.participantsCount, common.studentForms),
  ]
    .filter((part): part is string => Boolean(part))
    .join(' · ');

  return (
    <Card
      onPress={() => onOpen(lesson)}
      accessibilityLabel={format(m.planner.lessonsList.openLesson, { title: lesson.title })}
      accessibilityHint={meta}
      testID={`lesson-card-${lesson.id}`}
      style={styles.card}
    >
      <View style={styles.top}>
        <View style={styles.texts}>
          {/* One line on the site's wide row; a phone card has the height for two. */}
          <Text variant="cardTitle" numberOfLines={2}>
            {lesson.title}
          </Text>
          <Text variant="caption" color="textMuted" tabular>
            {meta}
          </Text>
        </View>
        <IconButton
          icon="more"
          variant="ghost"
          accessibilityLabel={format(m.planner.lessonsList.moreActions, { title: lesson.title })}
          onPress={() => onMore(lesson)}
          testID={`lesson-more-${lesson.id}`}
          style={styles.more}
        />
      </View>
      <View style={styles.chips}>
        {chips.errors !== null ? <Chip tone="red" label={format(common.errorsCount, { n: chips.errors })} /> : null}
        {chips.selecting ? <Chip tone="yellow" label={format(dict.planner.lessonsList.selectionInProgress, chips.selecting)} /> : null}
        <Chip tone="muted" label={dict.planner.lessonStatus[lesson.status]} />
      </View>
    </Card>
  );
}

const useStyles = makeStyles((t) => ({
  card: { gap: t.space.md },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: t.space.sm },
  texts: { flex: 1, minWidth: 0, gap: t.space.xxs },
  // The glyph hugs the card corner while the touch target stays 44 pt.
  more: { marginTop: -10, marginRight: -10, width: t.sizes.minTouch, height: t.sizes.minTouch },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.xs },
}));
