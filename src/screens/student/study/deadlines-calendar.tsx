import { useMemo, useRef } from 'react';
import { View, type GestureResponderEvent } from 'react-native';

import { formatDayKey, formatMonthLabel } from '@/domain/dates';
import { mskDate } from '@/domain/moscow-time';
import { plural, useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { Card, Enter, IconButton, Text } from '@/ui';

import { CalendarDayCell } from './calendar-day-cell';
import { CalendarLegend } from './calendar-legend';
import { buildCalendarCells, groupByMskDay, type CalendarCell, type CalendarMonth, type DeadlineItem } from './deadline-model';

export type DeadlinesCalendarProps = {
  /** Every homework that has a deadline, done ones included. */
  items: readonly DeadlineItem[];
  month: CalendarMonth;
  /** Moscow day of the server-corrected clock. */
  today: string;
  /** Day whose sheet is open, or null. */
  openDayKey: string | null;
  onChangeMonth: (delta: -1 | 1) => void;
  onOpenDay: (dayKey: string) => void;
};

/** A horizontal drag this long, and clearly more horizontal than vertical, turns the month. */
const SWIPE_DISTANCE = 48;

function chunk<T>(list: readonly T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let index = 0; index < list.length; index += size) rows.push(list.slice(index, index + size));
  return rows;
}

/**
 * Month calendar of homework deadlines (02 S4, 08 §5.20): chevrons and a horizontal swipe turn the month
 * (unbounded both ways), the grid always has 6 × 7 cells from the Monday on or before the 1st, and a
 * marked day opens its sheet. Days are MOSCOW days (02 §4.9).
 */
export function DeadlinesCalendar({ items, month, today, openDayKey, onChangeMonth, onOpenDay }: DeadlinesCalendarProps) {
  const styles = useStyles();
  const { dict, m, locale } = useI18n();
  const t = dict.student.calendar;

  const byDay = useMemo(() => groupByMskDay(items), [items]);
  const rows = useMemo(() => chunk(buildCalendarCells(month, byDay, today), 7), [month, byDay, today]);
  const monthLabel = formatMonthLabel(mskDate({ year: month.year, month: month.month, day: 1 }), locale);

  // Swipe between months with the plain responder props: claimed only for a clearly horizontal drag, so
  // vertical scrolling and taps on days keep working.
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  // Capture phase: the start point is recorded even when a day cell takes the touch; never claimed here.
  const rememberStart = (event: GestureResponderEvent): boolean => {
    touchStart.current = { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY };
    return false;
  };
  const isHorizontalDrag = (event: GestureResponderEvent): boolean => {
    const start = touchStart.current;
    if (!start) return false;
    const dx = event.nativeEvent.pageX - start.x;
    const dy = event.nativeEvent.pageY - start.y;
    return Math.abs(dx) > 16 && Math.abs(dx) > Math.abs(dy) * 2;
  };
  const onSwipeEnd = (event: GestureResponderEvent) => {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start) return;
    const dx = event.nativeEvent.pageX - start.x;
    if (Math.abs(dx) >= SWIPE_DISTANCE) onChangeMonth(dx < 0 ? 1 : -1);
  };

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
    <Card testID="deadlines-calendar">
      <View style={styles.header}>
        <IconButton icon="chevronLeft" accessibilityLabel={dict.topics.widgets.datetime.prevMonth} onPress={() => onChangeMonth(-1)} testID="calendar-prev" />
        <Text variant="calendarMonth" align="center" numberOfLines={1} accessibilityRole="header" accessibilityLiveRegion="polite" style={styles.month} testID="calendar-month">
          {monthLabel}
        </Text>
        <IconButton icon="chevronRight" accessibilityLabel={dict.topics.widgets.datetime.nextMonth} onPress={() => onChangeMonth(1)} testID="calendar-next" />
      </View>

      <View style={styles.weekdays} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {dict.student.weekdaysShort.map((label) => (
          <Text key={label} variant="chip" color="textMuted" align="center" numberOfLines={1} style={styles.weekday}>
            {label.toLocaleLowerCase()}
          </Text>
        ))}
      </View>

      <View onStartShouldSetResponderCapture={rememberStart} onMoveShouldSetResponder={isHorizontalDrag} onResponderRelease={onSwipeEnd}>
        {/* The key replays the entrance when the month changes. */}
        <Enter key={`${month.year}-${month.month}`} duration={180} offset={6} style={styles.grid}>
          {rows.map((row) => (
            <View key={row[0]?.key} style={styles.row}>
              {row.map((cell) => (
                <CalendarDayCell
                  key={cell.key}
                  cell={cell}
                  open={cell.key === openDayKey}
                  accessibilityLabel={cellLabel(cell)}
                  today={today}
                  onPress={(pressed) => onOpenDay(pressed.key)}
                />
              ))}
            </View>
          ))}
        </Enter>
      </View>

      <View style={styles.legend}>
        <CalendarLegend />
      </View>
    </Card>
  );
}

const useStyles = makeStyles((t) => ({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: t.space.md, marginBottom: t.space.field },
  month: { flex: 1 },
  weekdays: { flexDirection: 'row', gap: t.space.xxs, marginBottom: t.space.sm },
  weekday: { flex: 1 },
  grid: { gap: t.space.xxs },
  row: { flexDirection: 'row', gap: t.space.xxs },
  legend: { marginTop: t.space.lg, paddingHorizontal: t.space.xxs },
}));
