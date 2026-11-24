import { View } from 'react-native';

import { formatMsk } from '@/domain/dates';
import { format, useI18n } from '@/i18n';
import { Hint } from '@/providers';
import { makeStyles } from '@/theme';
import { ProgressBar, Text } from '@/ui';

import type { BudgetRow } from './logic';

/**
 * «Бюджеты ИИ» (90-addendum-3 §10.2; text diet §1a): the three bucket counters that really decide a
 * refusal — a name, a bar and «used/limit» each. The counter is plain text; it turns red — without a word —
 * when the budget is used up. When the counters reset is the one hint of the block. The caller puts the
 * block into a card or a panel.
 */
export function BudgetsBlock({ budgets }: { budgets: readonly BudgetRow[] }) {
  const styles = useStyles();
  const { m, locale } = useI18n();
  const t = m.developer.status;
  const first = budgets[0];
  if (!first) return null;

  return (
    <View style={styles.budgets} testID="panel-budgets">
      <View style={styles.header}>
        <Text variant="sectionTitle" accessibilityRole="header">
          {t.budgetsTitle}
        </Text>
        <Hint>
          <Text variant="small" color="textMuted">
            {format(t.budgetsHint, { time: formatMsk(first.resetAt, 'time', locale) ?? '' })}
          </Text>
        </Hint>
      </View>
      {budgets.map((budget) => {
        const name = t.budgetScopes[budget.key];
        const used = format(m.common.numbers.doneOf, { done: budget.used, total: budget.limit });
        return (
          <View
            key={budget.key}
            accessible
            accessibilityLabel={format(t.budgetA11y, { name, used: budget.used, limit: budget.limit })}
            style={styles.budget}
            testID={`panel-budget-${budget.key}`}
          >
            <View style={styles.top}>
              <Text variant="bodyStrong" style={styles.name}>
                {name}
              </Text>
              <Text variant="small" tabular numberOfLines={1} color={budget.state === 'out' ? 'redText' : 'textMuted'} style={styles.value}>
                {used}
              </Text>
            </View>
            <ProgressBar value={budget.percent} />
          </View>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  budgets: { gap: t.space.lg },
  header: { gap: t.space.xxs },
  budget: { gap: t.space.xs },
  top: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: t.space.md },
  name: { flexShrink: 1 },
  // The counter stays on one line; a long budget name wraps instead.
  value: { flexShrink: 0 },
}));
