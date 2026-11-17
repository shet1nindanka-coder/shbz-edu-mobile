import { View } from 'react-native';

import type { ColorToken } from '@/theme';
import { useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { Text } from '@/ui';

import { longestWordLength, summaryLine } from '../logic';

export type SummaryBarProps = { counts: { overdue: number; due: number; total: number } };

/**
 * The site's summary line («Просрочено: 2 · Пора позвонить: 1 · Всего учеников: 7») as three counters
 * that stay pinned above the list (06 §1.4 "Mobile translation"). A counter takes its status colour only
 * when there is something to act on.
 */
export function SummaryBar({ counts }: SummaryBarProps) {
  const styles = useStyles();
  const { dict, m } = useI18n();
  const t = dict.planner.calls;

  return (
    <View style={styles.bar} accessible accessibilityRole="summary" accessibilityLabel={summaryLine(counts, t)} testID="calls-summary">
      <Counter value={counts.overdue} label={t.overdue} color={counts.overdue > 0 ? 'redText' : 'textStrong'} testID="calls-summary-overdue" />
      <Counter value={counts.due} label={t.due} color={counts.due > 0 ? 'yellowText' : 'textStrong'} testID="calls-summary-due" />
      <Counter value={counts.total} label={m.calls.summary.total} color="textStrong" testID="calls-summary-total" />
    </View>
  );
}

function Counter({ value, label, color, testID }: { value: number; label: string; color: ColorToken; testID: string }) {
  const styles = useStyles();
  return (
    // The row is shared in proportion to each label's longest word, so «Просрочено» is never broken
    // inside the word on a narrow phone while «Пора позвонить» and «Всего учеников» wrap at the space.
    <View style={[styles.counter, { flexGrow: longestWordLength(label) }]}>
      <Text variant="miniStat" color={color} tabular testID={testID}>
        {value}
      </Text>
      <Text variant="caption" color="textMuted" numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  // Opaque: rows scroll underneath while the bar is pinned.
  bar: {
    flexDirection: 'row',
    // A narrow gap: at 320 pt every point of width goes to the labels.
    gap: t.space.xs,
    paddingVertical: t.space.sm,
    paddingHorizontal: t.space.gutter,
    backgroundColor: t.colors.pageBg,
  },
  counter: {
    flexBasis: 0,
    flexShrink: 1,
    minWidth: 0,
    gap: 2,
    paddingVertical: t.space.sm,
    paddingHorizontal: t.space.sm,
    borderRadius: t.radii.md,
    borderWidth: t.borders.hairline,
    borderColor: t.colors.softBorder,
    backgroundColor: t.colors.softBg,
  },
}));
