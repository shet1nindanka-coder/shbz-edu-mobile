import { View } from 'react-native';

import type { DeveloperPanelData } from '@/api/types';
import { formatMsk } from '@/domain/dates';
import { format, useI18n } from '@/i18n';
import { Hint } from '@/providers';
import { makeStyles } from '@/theme';
import { Card, ProgressBar, Text } from '@/ui';

import { budgetRows, statTiles, type BudgetRow, type StatTile } from './logic';

/**
 * Status tab (07 §1.9): the seven stat blocks as two-column tiles, then the three real daily AI budgets
 * (90-addendum-3 §10.2). The tile «запусков за 24 часа» is a trailing-24-hour row count; the budgets are
 * the bucket counters that decide a refusal — two different numbers under two different labels.
 */
export function StatusTab({ data }: { data: DeveloperPanelData }) {
  const styles = useStyles();
  const { dict, m, locale } = useI18n();
  const tiles = statTiles(data.stats, data.settings, dict.planner.devPanel.status, m.common.dateTime.msk);
  const budgets = budgetRows(data.aiBudgets);
  const first = budgets[0];

  return (
    <View style={styles.root} testID="panel-status">
      <View style={styles.grid}>
        {tiles.map((tile) => (
          <StatTileCard key={tile.key} tile={tile} />
        ))}
      </View>

      {first ? (
        <Card testID="panel-budgets">
          <View style={styles.budgets}>
            <View style={styles.budgetsHeader}>
              <Text variant="cardTitle" accessibilityRole="header">
                {m.developer.status.budgetsTitle}
              </Text>
              <Hint>
                <Text variant="caption">
                  {format(m.developer.status.budgetsHint, { time: formatMsk(first.resetAt, 'time', locale) ?? '' })}
                </Text>
              </Hint>
            </View>
            {budgets.map((budget) => (
              <BudgetLine key={budget.key} budget={budget} />
            ))}
          </View>
        </Card>
      ) : null}
    </View>
  );
}

function StatTileCard({ tile }: { tile: StatTile }) {
  const styles = useStyles();
  return (
    <Card
      variant="soft"
      padded={16}
      accessibilityLabel={[tile.label, [tile.value, tile.valueSuffix].filter(Boolean).join(' '), tile.hint].filter(Boolean).join(', ')}
      style={tile.wide ? styles.tileWide : styles.tile}
      testID={`panel-stat-${tile.key}`}
    >
      <Text variant="kickerSm">{tile.label}</Text>
      <Text variant={tile.wide ? 'cardTitle' : 'miniStat'} tabular style={styles.tileValue}>
        {tile.value}
        {tile.valueSuffix ? (
          <Text variant="miniStat" tabular color="kicker">
            {` ${tile.valueSuffix}`}
          </Text>
        ) : null}
      </Text>
      {tile.percent !== undefined ? <ProgressBar value={tile.percent} accessibilityLabel={tile.label} style={styles.tileBar} /> : null}
      {tile.hint ? (
        <Text variant="caption" style={styles.tileHint}>
          {tile.hint}
        </Text>
      ) : null}
    </Card>
  );
}

function BudgetLine({ budget }: { budget: BudgetRow }) {
  const styles = useStyles();
  const { m } = useI18n();
  const t = m.developer.status;
  const name = t.budgetScopes[budget.key];
  const used = format(t.budgetUsed, { used: budget.used, limit: budget.limit });
  return (
    <View
      accessible
      accessibilityLabel={format(t.budgetA11y, { name, used: budget.used, limit: budget.limit })}
      style={styles.budget}
      testID={`panel-budget-${budget.key}`}
    >
      <View style={styles.budgetTop}>
        <Text variant="smallStrong" style={styles.budgetName}>
          {name}
        </Text>
        <Text
          variant="smallBold"
          tabular
          numberOfLines={1}
          color={budget.state === 'out' ? 'redText' : budget.state === 'warn' ? 'yellowText' : 'textStrong'}
          style={styles.budgetValue}
        >
          {budget.state === 'out' ? `${used} · ${t.budgetOut}` : used}
        </Text>
      </View>
      <ProgressBar value={budget.percent} />
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  root: { gap: t.space.lg },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.md },
  // Two columns: half of the row minus half of the gap.
  tile: { flexBasis: '46%', flexGrow: 1, minWidth: 140 },
  tileWide: { flexBasis: '100%' },
  tileValue: { marginTop: t.space.xs },
  tileBar: { marginTop: t.space.xs },
  tileHint: { marginTop: t.space.xxs },
  budgets: { gap: t.space.field },
  budgetsHeader: { gap: t.space.xxs },
  budget: { gap: t.space.xs },
  budgetTop: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: t.space.md },
  budgetName: { flexShrink: 1 },
  // The counter stays on one line; a long budget name wraps instead.
  budgetValue: { flexShrink: 0 },
}));
