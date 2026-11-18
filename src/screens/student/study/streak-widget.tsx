import { useWindowDimensions, View } from 'react-native';

import type { StudentStreak } from '@/api/types';
import { useI18n } from '@/i18n';
import { Hint } from '@/providers';
import { makeStyles } from '@/theme';
import { Card, Text, widthForText } from '@/ui';

import { StreakHero } from './streak-hero';
import { streakForDay, streakTexts, weekCells } from './streak-model';
import { WeekPanel } from './week-panel';

export type StreakWidgetProps = {
  streak: StudentStreak;
  /** The current Moscow day (`mskToday(now)`): a cached streak from an earlier day is moved on to it. */
  today: string;
  testID?: string;
};

/** Below this window width the two small panels stack (02 S1 "Phone translation"). */
const STACK_BELOW_WIDTH = 360;

/**
 * The full «Огонёк и ритм» widget of the overview (02 S1 block 3): streak hero, «Сегодня сделано» and
 * «Следующая цель» panels, and the rolling week. On a phone the three parts sit directly on the page —
 * the site's wrapping card would only cost width.
 */
export function StreakWidget({ streak: cached, today, testID }: StreakWidgetProps) {
  const styles = useStyles();
  const window = useWindowDimensions();
  const { dict, locale } = useI18n();
  const weekly = dict.student.weekly;
  const streak = streakForDay(cached, today);
  const texts = streakTexts(streak, weekly, locale);
  const cells = weekCells(streak, dict.student.weekdaysShort, weekly);
  // The panels hold text: at a larger OS font size they need the room of a wider phone.
  const stacked = window.width < widthForText(STACK_BELOW_WIDTH, window.fontScale);

  return (
    <View style={styles.root} testID={testID}>
      <StreakHero currentStreak={streak.currentStreak} headline={texts.headline} testID="streak-hero" />
      <View style={stacked ? styles.panelsStacked : styles.panels}>
        <Card variant="soft" padded={16} style={stacked ? null : styles.panel}>
          <Text variant="kickerSm">{weekly.todayDone}</Text>
          <Text variant="miniStat" style={styles.value} testID="streak-solved-today">
            {texts.solvedToday}
          </Text>
        </Card>
        <Card variant="soft" padded={16} style={stacked ? null : styles.panel}>
          <Text variant="kickerSm">{weekly.nextGoal}</Text>
          <Text variant="miniStat" style={styles.value} testID="streak-next-goal">
            {texts.goalTitle}
          </Text>
          {texts.goalHint ? (
            <Hint>
              <Text variant="caption" color="textMuted" style={styles.hint}>
                {texts.goalHint}
              </Text>
            </Hint>
          ) : null}
        </Card>
      </View>
      <WeekPanel summary={texts.weekSummary} cells={cells} testID="streak-week" />
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  root: { gap: t.space.md },
  panels: { flexDirection: 'row', alignItems: 'stretch', gap: t.space.md },
  panelsStacked: { gap: t.space.md },
  panel: { flex: 1 },
  value: { marginTop: t.space.xs },
  hint: { marginTop: t.space.xxs },
}));
