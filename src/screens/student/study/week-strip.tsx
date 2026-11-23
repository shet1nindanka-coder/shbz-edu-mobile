import { useMemo } from 'react';
import { View } from 'react-native';

import { formatDayKey } from '@/domain/dates';
import { addDaysToDayKey, mskDayKey, mskMonday, parseDayKey } from '@/domain/moscow-time';
import { plural, useI18n } from '@/i18n';
import { makeStyles, useTheme } from '@/theme';
import { Card, Text } from '@/ui';

import { CalendarDayCell } from './calendar-day-cell';
import { groupByMskDay, type CalendarCell, type DeadlineItem } from './deadline-model';

export type WeekStripProps = {
  /** Every homework that has a deadline, done ones included. */
  items: readonly DeadlineItem[];
  /** Server-corrected clock. */
  now: number;
  /** Moscow day of `now`. */
  today: string;
  /** Day whose sheet is open, or null. */
  openDayKey: string | null;
  onOpenDay: (dayKey: string) => void;
};

/**
 * The current week of the deadlines screen (docs/design/glass-over-paper.md §8): «16–22 ноября» and seven
 * day cells, Monday first, each marked with the colour of what is due that day. A marked day opens its
 * sheet. The month is one tap away (the switch in the header); a phone starts with what is near.
 */
export function WeekStrip({ items, now, today, openDayKey, onOpenDay }: WeekStripProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { dict, m, locale } = useI18n();
  const t = dict.student.calendar;

  const cells = useMemo<CalendarCell[]>(() => {
    const byDay = groupByMskDay(items);
    const monday = mskDayKey(mskMonday(now));
    return Array.from({ length: 7 }, (_, index) => {
      const key = addDaysToDayKey(monday, index);
      const dayItems = byDay.get(key) ?? [];
      return {
        key,
        day: parseDayKey(key)?.day ?? 0,
        state: dayItems.length === 0 ? 'plain' : dayItems.some((item) => item.status !== 'DONE') ? 'late' : 'done',
        isToday: key === today,
        items: dayItems,
      };
    });
  }, [items, now, today]);

  const first = cells[0];
  const last = cells[6];
  // «16–22 ноября» inside one month, «30 ноября – 6 декабря» across two.
  const sameMonth = first && last && first.key.slice(0, 7) === last.key.slice(0, 7);
  const range =
    first && last
      ? sameMonth
        ? `${first.day}–${formatDayKey(last.key, 'dayMonth', locale) ?? ''}`
        : `${formatDayKey(first.key, 'dayMonth', locale) ?? ''} – ${formatDayKey(last.key, 'dayMonth', locale) ?? ''}`
      : '';

  const cellLabel = (cell: CalendarCell): string => {
    const parts = [formatDayKey(cell.key, 'dayMonth', locale) ?? String(cell.day)];
    if (cell.isToday) parts.push(t.legendToday);
    if (cell.items.length > 0) {
      parts.push(plural(locale, cell.items.length, m.student.calendar.deadlineForms));
      parts.push(cell.state === 'late' ? t.legendIncomplete : m.student.calendar.allDone);
    }
    return parts.join(', ');
  };

  return (
    <Card style={styles.card} testID="deadlines-week">
      <Text variant="bodyBold" accessibilityRole="header" testID="week-range">
        {range}
      </Text>
      <View>
        <View style={styles.row} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {dict.student.weekdaysShort.map((label) => (
            <Text key={label} variant="chip" color="textMuted" align="center" numberOfLines={1} style={styles.weekday}>
              {label.toLocaleLowerCase()}
            </Text>
          ))}
        </View>
        <View style={[styles.row, styles.cells]}>
          {cells.map((cell) => (
            <CalendarDayCell
              key={cell.key}
              cell={cell}
              open={cell.key === openDayKey}
              accessibilityLabel={cellLabel(cell)}
              today={today}
              height={theme.sizes.calendarCell}
              onPress={(pressed) => onOpenDay(pressed.key)}
            />
          ))}
        </View>
      </View>
    </Card>
  );
}

const useStyles = makeStyles((t) => ({
  card: { gap: t.space.md },
  row: { flexDirection: 'row', gap: t.space.xxs },
  cells: { marginTop: t.space.sm },
  weekday: { flex: 1 },
}));
