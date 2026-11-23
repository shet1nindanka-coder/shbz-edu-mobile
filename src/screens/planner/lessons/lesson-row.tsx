import type { LessonListItem } from '@/api/types';
import { formatClockTime, formatDateTime } from '@/domain/dates';
import { format, useI18n } from '@/i18n';
import { Chip, ListRow, accessibilityLabelOf } from '@/ui';

import { lessonAudience, lessonChips, lessonDateOf } from './lessons-list-logic';

export type LessonRowProps = {
  lesson: LessonListItem;
  /** The row sits in «Сегодня»: the caption starts with the time instead of the whole date. */
  today: boolean;
  /** The lesson the panel next to the list shows (tablet). */
  selected?: boolean;
  divider?: boolean;
  onPress: (lesson: LessonListItem) => void;
};

/**
 * One lesson of the list (docs/spec/05-teacher-lessons-plans.md §1.1 item 4; layout: docs/design/
 * glass-over-paper.md §1 rules 2 – 3): the title, ONE caption — when and for whom, plus the running AI
 * selection — and a label only when the lesson needs the teacher: plans that failed, or a lesson that is
 * going on right now. The whole row is pressed; the lesson's actions live on its board.
 */
export function LessonRow({ lesson, today, selected = false, divider, onPress }: LessonRowProps) {
  const { dict, m, locale } = useI18n();
  const common = dict.planner.common;
  const chips = lessonChips(lesson);

  // An unscheduled lesson is listed by its creation time: that is a date, never «сегодня в 14:32».
  const when = today && lesson.startsAt ? formatClockTime(lesson.startsAt, locale) : formatDateTime(lessonDateOf(lesson), locale);
  const selecting = chips.selecting ? format(dict.planner.lessonsList.selectionInProgress, chips.selecting) : null;
  const caption = accessibilityLabelOf([when, lessonAudience(lesson), selecting], ' · ');

  const attention =
    chips.errors !== null
      ? ({ tone: 'red', label: format(common.errorsCount, { n: chips.errors }) } as const)
      : lesson.status === 'ACTIVE'
        ? ({ tone: 'accent', label: dict.planner.lessonStatus.ACTIVE } as const)
        : null;

  return (
    <ListRow
      title={lesson.title}
      // «Занятие группы · Логарифмические уравнения»: the topic at the end tells two lessons apart.
      titleLines={2}
      subtitle={caption}
      right={attention ? <Chip tone={attention.tone} label={attention.label} /> : undefined}
      selected={selected}
      divider={divider}
      onPress={() => onPress(lesson)}
      accessibilityLabel={accessibilityLabelOf([format(m.planner.lessonsList.openLesson, { title: lesson.title }), caption, attention?.label])}
      testID={`lesson-open-${lesson.id}`}
    />
  );
}
