import { View } from 'react-native';

import type { LessonListItem } from '@/api/types';
import { formatDateTime } from '@/domain/dates';
import { format, plural, useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { Card, CardPressArea, Chip, IconButton, Text } from '@/ui';

import { lessonAudience, lessonChips, lessonDateOf } from './lessons-list-logic';

export type LessonCardProps = {
  lesson: LessonListItem;
  onOpen: (lesson: LessonListItem) => void;
  /** Opens the action sheet (handout, delete). */
  onMore: (lesson: LessonListItem) => void;
};

/**
 * One lesson of the list (docs/spec/05-teacher-lessons-plans.md §1.1 item 4): title, the meta line and
 * the chips. A tap opens the board; the secondary actions sit behind "⋯". The press area and the "⋯" are
 * siblings, so a screen reader reaches both; the area speaks the chips with the title.
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

  const errorsLabel = chips.errors !== null ? format(common.errorsCount, { n: chips.errors }) : null;
  const selectingLabel = chips.selecting ? format(dict.planner.lessonsList.selectionInProgress, chips.selecting) : null;
  const statusLabel = dict.planner.lessonStatus[lesson.status];

  return (
    <Card testID={`lesson-card-${lesson.id}`}>
      <View style={styles.top}>
        <CardPressArea
          onPress={() => onOpen(lesson)}
          accessibilityLabel={format(m.planner.lessonsList.openLesson, { title: lesson.title })}
          accessibilityParts={[statusLabel, errorsLabel, selectingLabel]}
          accessibilityHint={meta}
          testID={`lesson-open-${lesson.id}`}
          style={styles.main}
        >
          <View style={styles.texts}>
            {/* One line on the site's wide row. A phone card is narrow: «Занятие группы · Логарифмические
                уравнения» needs three lines, and the topic at the end is what tells two lessons apart. */}
            <Text variant="cardTitle" numberOfLines={3}>
              {lesson.title}
            </Text>
            <Text variant="caption" color="textMuted" tabular>
              {meta}
            </Text>
          </View>
          <View style={styles.chips}>
            {errorsLabel !== null ? <Chip tone="red" label={errorsLabel} /> : null}
            {selectingLabel !== null ? <Chip tone="yellow" label={selectingLabel} /> : null}
            <Chip tone="muted" label={statusLabel} />
          </View>
        </CardPressArea>
        <IconButton
          icon="more"
          variant="ghost"
          accessibilityLabel={format(m.planner.lessonsList.moreActions, { title: lesson.title })}
          onPress={() => onMore(lesson)}
          testID={`lesson-more-${lesson.id}`}
          style={styles.more}
        />
      </View>
    </Card>
  );
}

const useStyles = makeStyles((t) => ({
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: t.space.sm },
  main: { flex: 1, minWidth: 0, gap: t.space.md },
  texts: { gap: t.space.xxs },
  // The glyph hugs the card corner while the touch target stays 44 pt.
  more: { marginTop: -10, marginRight: -10, width: t.sizes.minTouch, height: t.sizes.minTouch },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.xs },
}));
