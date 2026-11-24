import { View } from 'react-native';

import { makeStyles, useTheme } from '@/theme';
import { Card, Text } from '@/ui';

import type { MetricCardModel } from '../logic';

/**
 * A summary figure of the statistics views (`DevMetricCard` on the site; mockup D-stats; text diet §1a): a
 * caption and a big figure. The site's note under the figure is only read out. The figure is red only
 * where the number asks for attention — an overdue or "needs help" count that is not zero.
 */
export function MetricCard({ card, caption }: { card: MetricCardModel; caption?: string }) {
  const styles = useStyles();
  const attention = card.tone === 'red' && card.value !== '0';
  return (
    <Card style={styles.card} testID={`stats-metric-${card.key}`}>
      <View style={styles.body} accessible accessibilityLabel={`${card.label}: ${card.value}. ${card.note}`}>
        <Text variant="small" color="textMuted" numberOfLines={1}>
          {caption ?? card.label}
        </Text>
        <Text variant="metric" color={attention ? 'redText' : 'textStrong'} tabular numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
          {card.value}
        </Text>
      </View>
    </Card>
  );
}

export type MetricGridProps = {
  cards: readonly MetricCardModel[];
  /** Shorter captions by card key, where the site's label is a phrase; the label itself is still read out. */
  captions?: Readonly<Record<string, string>>;
};

/** The cards of a view: two per row on a phone (06 §1.6 "Mobile translation"), all four in one row on a tablet. */
export function MetricGrid({ cards, captions }: MetricGridProps) {
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
            <MetricCard key={card.key} card={card} caption={captions?.[card.key]} />
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
