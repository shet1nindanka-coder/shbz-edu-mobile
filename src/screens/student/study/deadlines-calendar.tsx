import { useMemo, useRef } from 'react';
import { View, type GestureResponderEvent } from 'react-native';

import { formatDayKey, formatMonthLabel } from '@/domain/dates';
import { mskDate } from '@/domain/moscow-time';
import { plural, useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { Card, Enter, IconButton, Text } from '@/ui';

import { CalendarDayCell, calendarCellMinHeight } from './calendar-day-cell';
import { buildCalendarCells, groupByMskDay, monthTitle, type CalendarCell, type CalendarMonth, type DeadlineItem } from './deadline-model';

export type DeadlinesCalendarProps = {
  /** Every homework that has a deadline, done ones included. */
  items: readonly DeadlineItem[];
  month: CalendarMonth;
  /** The server-corrected clock: today's ring and which homeworks are overdue. */
  now: number;
  /** The picked day, or null. */
  selectedDayKey: string | null;
  onChangeMonth: (delta: -1 | 1) => void;
  /** A day of the displayed month was pressed; `dayItems` are its homeworks (none on a free day). */
  onSelectDay: (dayKey: string, dayItems: readonly DeadlineItem[]) => void;
  /** Draw the month without a card of its own: inside a tablet panel. */
  bare?: boolean;
};

/** A horizontal drag this long, and clearly more horizontal than vertical, turns the month. */
const SWIPE_DISTANCE = 48;

function chunk<T>(list: readonly T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let index = 0; index < list.length; index += size) rows.push(list.slice(index, index + size));
  return rows;
}

/**
 * The month of homework deadlines (02 S4; the owner: «один календарь, на котором всё отмечено», like the
 * month view of the iPhone calendar). It takes all the height it is given: the month name with the two
 * arrows, the weekday letters and six week rows that share what is left. Every homework is a mark under
 * its day — there is no list and no legend; a day is pressed to see its homeworks. Arrows and a
 * horizontal swipe turn the month (unbounded both ways); days are MOSCOW days (02 §4.9).
 */
export function DeadlinesCalendar({ items, month, now, selectedDayKey, onChangeMonth, onSelectDay, bare = false }: DeadlinesCalendarProps) {
  const styles = useStyles();
  const { dict, m, locale } = useI18n();
  const t = dict.student.calendar;

  const byDay = useMemo(() => groupByMskDay(items), [items]);
  const rows = useMemo(() => chunk(buildCalendarCells(month, byDay, now), 7), [month, byDay, now]);

  // Swipe between months with the plain responder props: claimed only for a clearly horizontal drag, so
  // pulling the page down and taps on days keep working.
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

  // The marks have no legend: a screen reader hears what they mean with the day.
  const cellLabel = (cell: CalendarCell): string => {
    const parts = [formatDayKey(cell.key, 'dayMonth', locale) ?? String(cell.day)];
    if (cell.isToday) parts.push(t.legendToday);
    if (cell.items.length > 0) {
      // The marks are sorted, the most urgent first: the first one is the state of the day.
      const worst = cell.marks[0];
      parts.push(plural(locale, cell.items.length, m.student.calendar.deadlineForms));
      parts.push(worst === 'late' ? dict.student.deadlineList.overdueBadge : worst === 'due' ? t.legendIncomplete : m.student.calendar.allDone);
    }
    return parts.join(', ');
  };

  const content = (
    <>
      <View style={[styles.header, bare ? null : styles.inset]}>
        <Text
          variant="calendarMonth"
          numberOfLines={1}
          accessibilityRole="header"
          accessibilityLabel={formatMonthLabel(mskDate({ year: month.year, month: month.month, day: 1 }), locale)}
          accessibilityLiveRegion="polite"
          style={styles.month}
          testID="calendar-month"
        >
          {monthTitle(month, now, locale)}
        </Text>
        <IconButton icon="chevronLeft" variant="ghost" accessibilityLabel={dict.topics.widgets.datetime.prevMonth} onPress={() => onChangeMonth(-1)} testID="calendar-prev" />
        <IconButton icon="chevronRight" variant="ghost" accessibilityLabel={dict.topics.widgets.datetime.nextMonth} onPress={() => onChangeMonth(1)} testID="calendar-next" />
      </View>

      <View style={styles.weekdays} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {dict.student.weekdaysShort.map((label) => (
          <Text key={label} variant="chip" color="textMuted" align="center" numberOfLines={1} style={styles.weekday}>
            {label.toLocaleLowerCase()}
          </Text>
        ))}
      </View>

      <View style={styles.grid} onStartShouldSetResponderCapture={rememberStart} onMoveShouldSetResponder={isHorizontalDrag} onResponderRelease={onSwipeEnd}>
        {/* The key replays the entrance when the month changes. */}
        <Enter key={`${month.year}-${month.month}`} duration={180} offset={6} style={styles.grid}>
          {rows.map((row) => (
            <View key={row[0]?.key} style={styles.row}>
              {row.map((cell) => (
                <CalendarDayCell
                  key={cell.key}
                  cell={cell}
                  selected={cell.key === selectedDayKey}
                  accessibilityLabel={cellLabel(cell)}
                  onPress={(pressed) => onSelectDay(pressed.key, pressed.items)}
                />
              ))}
            </View>
          ))}
        </Enter>
      </View>
    </>
  );
  return bare ? (
    <View testID="deadlines-calendar" style={styles.frame}>
      {content}
    </View>
  ) : (
    <Card padded={false} testID="deadlines-calendar" style={[styles.frame, styles.card]}>
      {content}
    </Card>
  );
}

const useStyles = makeStyles((t) => ({
  // The month fills its place: the screen down to the dock on a phone, the panel on a tablet.
  frame: { flex: 1, minHeight: 0 },
  // The week lines run closer to the card's edge than its text, as in a calendar.
  card: { paddingHorizontal: t.space.sm, paddingTop: t.space.sm, paddingBottom: t.space.xxs },
  header: { flexDirection: 'row', alignItems: 'center', minHeight: t.sizes.minTouch },
  inset: { paddingLeft: t.space.sm },
  month: { flex: 1, minWidth: 0 },
  weekdays: { flexDirection: 'row', paddingVertical: t.space.xxs },
  weekday: { flex: 1 },
  grid: { flex: 1, minHeight: 0 },
  // Six rows share the height; a short window keeps every row tall enough for its marks and scrolls.
  row: {
    flex: 1,
    flexDirection: 'row',
    minHeight: calendarCellMinHeight(t),
    borderTopWidth: t.borders.hairline,
    borderTopColor: t.colors.line,
  },
}));
