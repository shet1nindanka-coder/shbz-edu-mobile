import type { LessonListItem } from '@/api/types';
import { formatClockTime } from '@/domain/dates';
import { format, useI18n } from '@/i18n';
import { useTheme } from '@/theme';
import { Chip, ListRow, Spinner, accessibilityLabelOf } from '@/ui';

import { rowDateTime } from '../shared/row-date';
import { lessonAudience, lessonChips, lessonDateOf } from './lessons-list-logic';

export type LessonRowProps = {
  lesson: LessonListItem;
  /** The row sits in «Сегодня»: the caption starts with the time instead of the whole date. */
  today: boolean;
  /** The list's server-corrected clock: the year of the date is left out within the current one. */
  now: number;
  /** The lesson the panel next to the list shows (tablet). */
  selected?: boolean;
  divider?: boolean;
  onPress: (lesson: LessonListItem) => void;
};

/**
 * One lesson of the list (docs/spec/05-teacher-lessons-plans.md §1.1 item 4; layout: docs/design/
 * glass-over-paper.md §1 rules 2 – 3, §1a): the title, ONE caption — when and for whom («17 ноя, 12:00 ·
 * 8А») — and one mark on the right, only when there is something to notice: the count of failed plans in
 * red, «Идёт» for the lesson that is going on, a spinner while the AI still selects. The words behind the
 * marks («ошибок: 2», «подбор идёт 1 / 3») are the row's accessible name. The whole row is pressed; the
 * lesson's actions live on its board.
 */
export function LessonRow({ lesson, today, now, selected = false, divider, onPress }: LessonRowProps) {
  const { dict, m, locale } = useI18n();
  const theme = useTheme();
  const common = dict.planner.common;
  const chips = lessonChips(lesson);

  // An unscheduled lesson is listed by its creation time: that is a date, never «сегодня в 14:32».
  const when = today && lesson.startsAt ? formatClockTime(lesson.startsAt, locale) : rowDateTime(lessonDateOf(lesson), now, locale);
  const caption = accessibilityLabelOf([when, lessonAudience(lesson)], ' · ');
  const errors = chips.errors !== null ? format(common.errorsCount, { n: chips.errors }) : null;
  const selecting = chips.selecting ? format(dict.planner.lessonsList.selectionInProgress, chips.selecting) : null;
  const active = lesson.status === 'ACTIVE' ? dict.planner.lessonStatus.ACTIVE : null;

  const right =
    chips.errors !== null ? (
      <Chip tone="red" icon="alert" label={String(chips.errors)} />
    ) : active ? (
      <Chip tone="accent" label={active} />
    ) : chips.selecting ? (
      <Spinner size={theme.sizes.icon.sm} color="accentSolid" />
    ) : undefined;

  return (
    <ListRow
      title={lesson.title}
      // «Занятие группы · Логарифмические уравнения»: the topic at the end tells two lessons apart.
      titleLines={2}
      subtitle={caption}
      right={right}
      selected={selected}
      divider={divider}
      onPress={() => onPress(lesson)}
      accessibilityLabel={accessibilityLabelOf([format(m.planner.lessonsList.openLesson, { title: lesson.title }), caption, active, selecting, errors])}
      testID={`lesson-open-${lesson.id}`}
    />
  );
}
