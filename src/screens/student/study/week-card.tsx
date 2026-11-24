import { View } from 'react-native';

import type { StudentStreak } from '@/api/types';
import { format, plural, useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { AccentGradient, Card, Chip, Text } from '@/ui';

import { streakForDay, streakTexts, weekCells } from './streak-model';

export type WeekCardProps = {
  streak: StudentStreak;
  /** The current Moscow day (`mskToday(now)`): a cached streak from an earlier day is moved on to it. */
  today: string;
  /** Height of the tallest bar. Default 44; a tablet panel gives the chart the room it has. */
  barHeight?: number;
  /** Stretch the chart to fill the card (tablet panels are full height). */
  fill?: boolean;
  testID?: string;
};

/**
 * The week of the overview (docs/design/glass-over-paper.md §8, §1a): ONE figure — the problems closed in
 * the last seven days — the streak chip, and one bar per day: the mint gradient for an active day, a grey
 * stub for an empty one. No title and no «сегодня: …» line: the seven weekday letters say it is the week,
 * and each bar tells its own day to a screen reader.
 */
export function WeekCard({ streak: cached, today, barHeight = 44, fill = false, testID }: WeekCardProps) {
  const styles = useStyles();
  const { dict, m, locale } = useI18n();
  const weekly = dict.student.weekly;
  const streak = streakForDay(cached, today);
  const texts = streakTexts(streak, weekly, locale);
  const cells = weekCells(streak, dict.student.weekdaysShort, weekly);
  const max = Math.max(1, ...cells.map((cell) => cell.count));

  return (
    <Card style={[styles.card, fill ? styles.fill : null]} testID={testID}>
      <View style={styles.head}>
        <View
          accessible
          accessibilityRole="header"
          accessibilityLabel={format(m.student.home.weekA11y, { solved: plural(locale, streak.solvedThisWeek, weekly.solvedForms) })}
          style={styles.figure}
        >
          <Text variant="metric" tabular testID="streak-solved-week">
            {streak.solvedThisWeek}
          </Text>
          <Text variant="body" color="textMuted" numberOfLines={1} style={styles.word}>
            {plural(locale, streak.solvedThisWeek, m.student.home.solvedWords)}
          </Text>
        </View>
        {streak.currentStreak > 0 ? (
          <Chip
            tone="streak"
            icon="flame"
            label={plural(locale, streak.currentStreak, weekly.dayForms)}
            accessibilityLabel={texts.headline}
            testID="streak-chip"
          />
        ) : null}
      </View>

      <View style={[styles.chart, fill ? styles.chartFill : null]}>
        {cells.map((cell) => (
          <View key={cell.date} accessible accessibilityRole="image" accessibilityLabel={cell.accessibilityLabel} style={[styles.column, fill ? styles.columnFill : null]}>
            <View style={[styles.barBox, fill ? styles.fill : { height: barHeight }]}>
              {cell.active ? (
                <AccentGradient
                  style={[styles.bar, { height: `${Math.max(18, Math.round((cell.count / max) * 100))}%` }]}
                />
              ) : (
                <View style={[styles.bar, styles.barEmpty]} />
              )}
            </View>
            <Text
              variant="chip"
              color={cell.isToday ? 'textStrong' : 'textMuted'}
              numberOfLines={1}
              accessibilityElementsHidden
              importantForAccessibility="no"
              testID={cell.isToday ? 'streak-week-today' : undefined}
            >
              {cell.label.toLocaleLowerCase()}
            </Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

const useStyles = makeStyles((t) => ({
  card: { gap: t.space.md },
  fill: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: t.space.md },
  figure: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'baseline', gap: t.space.sm },
  word: { flexShrink: 1 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: t.space.sm },
  // A tablet panel gives the chart all the height that is left: the columns stretch, the bars grow from the bottom.
  chartFill: { flex: 1, minHeight: 0, alignItems: 'stretch' },
  columnFill: { justifyContent: 'flex-end' },
  column: { flex: 1, alignItems: 'center', gap: t.space.xs },
  barBox: { alignSelf: 'stretch', justifyContent: 'flex-end' },
  bar: { alignSelf: 'stretch', borderRadius: t.radii.sm },
  barEmpty: { height: t.sizes.progress.sm, backgroundColor: t.colors.soft2 },
}));
