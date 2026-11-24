import { View } from 'react-native';

import { makeStyles, type Theme } from '@/theme';
import { PressableScale, Text } from '@/ui';

import { DayMarks } from './day-marks';
import type { CalendarCell } from './deadline-model';

export type CalendarDayCellProps = {
  cell: CalendarCell;
  /** The picked day: its number stands on a soft disc. */
  selected: boolean;
  /** The whole day in words — the date, «сегодня», how many homeworks and their state. */
  accessibilityLabel: string;
  onPress: (cell: CalendarCell) => void;
};

/**
 * One day of the month grid, in the proportions of the iPhone calendar: the number at the top of a tall
 * cell and, under it, the marks of the day's homeworks. Today's number is ringed with the accent, the
 * picked day stands on a soft disc. Every day of the displayed month is pressed as a whole; a day of a
 * neighbouring month is dimmed, never marked and never pressed, even when something is due on it.
 */
export function CalendarDayCell({ cell, selected, accessibilityLabel, onPress }: CalendarDayCellProps) {
  const styles = useStyles();

  if (!cell.inMonth) {
    return (
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.cell}>
        <View style={[styles.day, styles.dimmed]}>
          <Text variant="bodyStrong" tabular color="textMuted">
            {cell.day}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected }}
      onPress={() => onPress(cell)}
      scaleTo={1}
      pressedStyle={styles.pressed}
      testID={`calendar-day-${cell.key}`}
      style={styles.cell}
    >
      <View style={[styles.day, selected ? styles.selected : null, cell.isToday ? styles.today : null]}>
        <Text variant={cell.isToday ? 'bodyBold' : 'bodyStrong'} tabular color={cell.isToday ? 'accentSolid' : 'textStrong'}>
          {cell.day}
        </Text>
      </View>
      <DayMarks marks={cell.marks} more={cell.more} />
    </PressableScale>
  );
}

/** What a cell needs at least: the number's disc, the marks and the air around them. */
export function calendarCellMinHeight(t: Theme): number {
  return t.space.xxs * 3 + t.sizes.control.sm + (t.typography.dock.lineHeight ?? 0);
}

const useStyles = makeStyles((t) => ({
  // The cell takes its share of the week row and the whole height the row has; the content stays at the top.
  cell: { flex: 1, minWidth: 0, alignItems: 'center', gap: t.space.xxs, paddingVertical: t.space.xxs },
  day: {
    width: t.sizes.control.sm,
    height: t.sizes.control.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: t.radii.full,
    borderWidth: t.borders.strong,
    borderColor: 'transparent',
  },
  today: { borderColor: t.colors.accentSolid },
  selected: { backgroundColor: t.colors.soft2 },
  dimmed: { opacity: 0.4 },
  pressed: { opacity: 0.6 },
}));
