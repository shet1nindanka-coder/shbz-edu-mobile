import { View } from 'react-native';

import { makeStyles, useTheme } from '@/theme';
import { Card, Text } from '@/ui';

import type { MetricCardModel } from '../logic';

/**
 * A summary figure of the statistics views (`DevMetricCard` on the site; mockup D-stats): a caption, a big
 * figure and one muted note. The figure is red only where the number asks for attention — an overdue or
 * "needs help" count that is not zero; every other figure is plain.
 */
export function MetricCard({ card }: { card: MetricCardModel }) {
  const styles = useStyles();
  const attention = card.tone === 'red' && card.value !== '0';
  return (
    <Card style={styles.card} testID={`stats-metric-${card.key}`}>
      <View style={styles.body} accessible accessibilityLabel={`${card.label}: ${card.value}. ${card.note}`}>
        <Text variant="small" color="textMuted" numberOfLines={2}>
          {card.label}
        </Text>
        <Text variant="metric" color={attention ? 'redText' : 'textStrong'} tabular numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
          {card.value}
        </Text>
        <Text variant="small" color="textMuted">
          {card.note}
        </Text>
      </View>
    </Card>
  );
}

/** The cards of a view: two per row on a phone (06 §1.6 "Mobile translation"), all four in one row on a tablet. */
export function MetricGrid({ cards }: { cards: readonly MetricCardModel[] }) {
  const styles = useStyles();
  const theme = useTheme();
  const perRow = theme.tablet ? 4 : 2;
  const rows: MetricCardModel[][] = [];
  for (let index = 0; index < cards.length; index += perRow) rows.push(cards.slice(index, index + perRow));
  return (
    <View style={styles.grid}>
      {rows.map((row) => (
        <View key={row.map((card) => card.key).join('|')} style={styles.row}>
          {row.map((card) => (
            <MetricCard key={card.key} card={card} />
          ))}
        </View>
      ))}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  grid: { gap: t.space.block },
  row: { flexDirection: 'row', alignItems: 'stretch', gap: t.space.block },
  card: { flex: 1, minWidth: 0 },
  body: { gap: t.space.xs },
}));
