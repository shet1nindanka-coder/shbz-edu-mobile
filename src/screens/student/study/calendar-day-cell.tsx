import { View } from 'react-native';

import { makeStyles, useTheme } from '@/theme';
import { PressableScale, Text } from '@/ui';

import type { CalendarCell } from './deadline-model';
import { DiamondMark } from './diamond-mark';

export type CalendarDayCellProps = {
  cell: CalendarCell;
  /** The day whose sheet is open: drawn with the outer ring. */
  open: boolean;
  accessibilityLabel: string;
  onPress: (cell: CalendarCell) => void;
  /** Moscow day of "now": an unfinished day before it is overdue (red), from it on — still due (yellow). */
  today: string;
  /** Cell height; default 48 (the month grid). The week strip uses 52. */
  height?: number;
};

/** Height of a day cell on a phone (the site's 64 shrinks to the 44–48 pt range, 02 S4). */
export const CALENDAR_CELL_HEIGHT = 48;

/**
 * One day of the month grid (08 §5.20). Only a day of the displayed month that has deadlines is a button;
 * a day of a neighbouring month is never marked, even when something is due on it.
 */
export function CalendarDayCell({ cell, open, accessibilityLabel, onPress, today, height }: CalendarDayCellProps) {
  const theme = useTheme();
  const styles = useStyles();
  const { colors } = theme;
  const marked = cell.state === 'done' || cell.state === 'late';
  const fill = [
    cell.state === 'out' ? { backgroundColor: colors.calOutBg } : { backgroundColor: cell.isToday ? colors.cardBg : colors.calCellBg },
    height === undefined ? null : { height },
  ];
  const tone = cell.state === 'done' ? 'done' : cell.key < today ? 'late' : 'due';

  const content = (
    <>
      <Text variant="smallStrong" tabular color={cell.state === 'out' ? 'calOutText' : 'textStrong'}>
        {cell.day}
      </Text>
      {marked ? <DiamondMark tone={tone} /> : null}
      {cell.isToday ? <View style={styles.todayRing} /> : null}
      {open ? <View style={styles.openRing} /> : null}
    </>
  );

  if (!marked) {
    return (
      <View
        accessible
        accessibilityLabel={accessibilityLabel}
        accessibilityElementsHidden={cell.state === 'out'}
        importantForAccessibility={cell.state === 'out' ? 'no-hide-descendants' : 'yes'}
        style={[styles.cell, fill]}
      >
        {content}
      </View>
    );
  }
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ expanded: open }}
      onPress={() => onPress(cell)}
      // The cell is narrower than 44 pt on small phones; the gap between cells is shared as hit area.
      hitSlop={2}
      testID={`calendar-day-${cell.key}`}
      style={[styles.cell, fill]}
    >
      {content}
    </PressableScale>
  );
}

const useStyles = makeStyles((t) => ({
  cell: {
    flex: 1,
    height: CALENDAR_CELL_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    gap: t.space.xxs,
    borderRadius: t.radii.md,
  },
  // Today: a 2 px ring INSIDE the cell.
  todayRing: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: t.radii.md,
    borderWidth: t.borders.strong,
    borderColor: t.colors.calRing,
    pointerEvents: 'none',
  },
  // The open day: a 3 px ring OUTSIDE the cell.
  openRing: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: t.radii.md,
    borderWidth: t.borders.strong,
    borderColor: t.colors.accentSolid,
    pointerEvents: 'none',
  },
}));
