import { View } from 'react-native';

import { useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { Card, Enter, Text } from '@/ui';

import type { WeekCell } from './streak-model';

export type WeekPanelProps = {
  /** «5 номеров закрыто за последние 7 дней.» */
  summary: string;
  /** Seven cells of the rolling week, oldest first; the last one is today. */
  cells: readonly WeekCell[];
  testID?: string;
};

/**
 * «За неделю» (08 §5.19): seven equal columns. An active day carries an accent bar, an empty one a grey
 * dot — the shape repeats the colour. Today has an accent ring and an underlined label. Not interactive.
 */
export function WeekPanel({ summary, cells, testID }: WeekPanelProps) {
  const styles = useStyles();
  const { dict } = useI18n();
  return (
    <Card variant="panel" padded={16} testID={testID}>
      <Text variant="kickerSm">{dict.student.weekly.week}</Text>
      <Text variant="body" color="label" style={styles.summary}>
        {summary}
      </Text>
      <View style={styles.row}>
        {cells.map((cell, index) => (
          <Enter key={cell.date} index={index} duration={320} offset={6} style={styles.column}>
            <View
              accessible
              accessibilityRole="image"
              accessibilityLabel={cell.accessibilityLabel}
              style={[styles.cell, cell.isToday ? styles.cellToday : null]}
              testID={cell.isToday ? 'streak-week-today' : undefined}
            >
              <View style={cell.active ? styles.bar : styles.dot} />
            </View>
            <Text
              variant="captionBold"
              color={cell.isToday ? 'accentSolid' : 'kicker'}
              numberOfLines={1}
              accessibilityElementsHidden
              importantForAccessibility="no"
              style={cell.isToday ? styles.todayLabel : null}
            >
              {cell.label}
            </Text>
          </Enter>
        ))}
      </View>
    </Card>
  );
}

const useStyles = makeStyles((t) => ({
  summary: { marginTop: t.space.xs },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: t.space.xs, marginTop: t.space.lg },
  column: { flex: 1, alignItems: 'center', gap: t.space.sm },
  cell: {
    alignSelf: 'stretch',
    height: t.sizes.calendarCell,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 8,
    borderRadius: t.radii.md,
    backgroundColor: t.colors.weekCell,
    borderWidth: t.borders.interactive,
    // Invisible until today: the frame has the cell's own colour.
    borderColor: t.colors.weekCell,
  },
  // «Сегодня» differs by the frame of the cell, not only by the colour of its label.
  cellToday: { borderColor: t.colors.accentSolid },
  bar: { width: 20, height: 8, borderRadius: t.radii.full, backgroundColor: t.colors.accentSolid },
  dot: { width: 8, height: 8, borderRadius: t.radii.full, backgroundColor: t.colors.weekDotOff },
  todayLabel: { textDecorationLine: 'underline' },
}));
