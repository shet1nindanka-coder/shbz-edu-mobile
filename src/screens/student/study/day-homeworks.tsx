import { deadlineCaption } from '@/domain/deadline-caption';
import { formatClockTime } from '@/domain/dates';
import { format, useI18n } from '@/i18n';
import { ListRow, Text } from '@/ui';

import { markToneOf, type DeadlineItem } from './deadline-model';

export type DayHomeworksProps = {
  /** Homeworks due on one day. */
  items: readonly DeadlineItem[];
  /** The server-corrected clock, for «просрочено». */
  now: number;
  onOpenHomework: (item: DeadlineItem) => void;
  /** Horizontal padding of the rows; 0 inside an already padded sheet. */
  inset?: number;
};

/**
 * The homeworks of one calendar day as rows (the day sheet on a phone, the right panel on a tablet): the
 * title, one caption — the hour it is due, «выполнено», or «просрочено …» in red — and «1/3» on the right,
 * red only when the homework is overdue. The day itself is the title above the rows. A row opens its homework.
 */
export function DayHomeworks({ items, now, onOpenHomework, inset }: DayHomeworksProps) {
  const { m, locale } = useI18n();
  return (
    <>
      {items.map((item, index) => {
        const tone = markToneOf(item, now);
        const caption = tone === 'due' ? formatClockTime(item.deadlineAt, locale) : deadlineCaption(item.deadlineAt, tone === 'done', now, locale, m.common.deadline).text;
        const done = format(m.common.numbers.doneOf, { done: item.solvedNumbers, total: item.totalNumbers });
        return (
          <ListRow
            key={item.id}
            title={item.label}
            titleLines={2}
            subtitle={caption}
            subtitleTone={tone === 'late' ? 'attention' : 'muted'}
            right={
              <Text variant="small" color={tone === 'late' ? 'redText' : 'textMuted'} tabular numberOfLines={1}>
                {done}
              </Text>
            }
            inset={inset}
            divider={index < items.length - 1}
            onPress={() => onOpenHomework(item)}
            accessibilityLabel={format(m.studentWork.list.rowA11y, { title: item.label, caption, done })}
            testID={`day-sheet-card-${item.id}`}
          />
        );
      })}
    </>
  );
}
