import { View } from 'react-native';

import { formatDayKey } from '@/domain/dates';
import { useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { BottomSheet, Chip, Text } from '@/ui';

import { DeadlineCard } from './deadline-card';
import type { DeadlineItem } from './deadline-model';

export type DaySheetProps = {
  visible: boolean;
  /** Moscow day key of the day shown; kept until the sheet has left the screen. */
  dayKey: string | null;
  /** Homeworks due that day. */
  items: readonly DeadlineItem[];
  now: number;
  onClose: () => void;
  /** After the exit animation: the owner may forget the day. */
  onClosed: () => void;
  onOpenHomework: (item: DeadlineItem) => void;
};

/**
 * Day sheet of the calendar (02 S4a; the site's popover under the day cell): the soft header with the
 * date and the day's homeworks as compact cards with a chevron. A tap on a card leads to the homework.
 */
export function DaySheet({ visible, dayKey, items, now, onClose, onClosed, onOpenHomework }: DaySheetProps) {
  const styles = useStyles();
  const { dict, m, locale } = useI18n();
  const t = dict.student.calendar;
  return (
    <BottomSheet visible={visible} onClose={onClose} onClosed={onClosed} closeLabel={m.common.actions.close} testID="deadlines-day-sheet">
      <View style={styles.header}>
        <Text variant="cardKicker">{t.popoverKicker}</Text>
        <Text variant="cardTitle" accessibilityRole="header" style={styles.date} testID="day-sheet-date">
          {dayKey ? formatDayKey(dayKey, 'dayMonth', locale) : ''}
        </Text>
      </View>
      {items.length === 0 ? (
        // Cannot happen on opening (only marked days open); it can after a live update removed the homework.
        <Chip label={t.emptyDay} style={styles.empty} />
      ) : (
        <View style={styles.list}>
          {items.map((item) => (
            <DeadlineCard
              key={item.id}
              item={item}
              variant="compact"
              showChevron
              now={now}
              onPress={onOpenHomework}
              testID={`day-sheet-card-${item.id}`}
            />
          ))}
        </View>
      )}
    </BottomSheet>
  );
}

const useStyles = makeStyles((t) => ({
  header: {
    borderRadius: t.radii.md,
    backgroundColor: t.colors.softBg,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: t.space.xxs,
    marginBottom: t.space.md,
  },
  date: { fontFamily: t.fonts.extrabold },
  list: { gap: 8 },
  empty: { alignSelf: 'flex-start' },
}));
