import { useI18n } from '@/i18n';
import { BottomSheet, Text } from '@/ui';

import { DayHomeworks } from './day-homeworks';
import { dayTitle, type DeadlineItem } from './deadline-model';

export type DaySheetProps = {
  visible: boolean;
  /** Moscow day key of the day shown; it stays the picked day after the sheet is closed. */
  dayKey: string | null;
  /** Homeworks due that day. */
  items: readonly DeadlineItem[];
  now: number;
  onClose: () => void;
  onOpenHomework: (item: DeadlineItem) => void;
};

/**
 * A day of the calendar unfolded (02 S4a; the site's popover under the day cell): a sheet titled with the
 * date — «среда, 26 ноября» — and the day's homeworks as rows. A row leads to its homework.
 */
export function DaySheet({ visible, dayKey, items, now, onClose, onOpenHomework }: DaySheetProps) {
  const { dict, m, locale } = useI18n();
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      closeLabel={m.common.actions.close}
      title={dayKey ? dayTitle(dayKey, m.student.calendar.weekdays, locale) : undefined}
      testID="deadlines-day-sheet"
    >
      {items.length === 0 ? (
        // Cannot happen on opening (only a day with homeworks opens); it can after a live update removed the homework.
        <Text variant="body" color="textMuted">
          {dict.student.calendar.emptyDay}
        </Text>
      ) : (
        <DayHomeworks items={items} now={now} onOpenHomework={onOpenHomework} inset={0} />
      )}
    </BottomSheet>
  );
}
