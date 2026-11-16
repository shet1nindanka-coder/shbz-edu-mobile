import { View } from 'react-native';

import { makeStyles, useTheme } from '@/theme';
import { Card, Text } from '@/ui';

import { noteColor } from '../charts/palette';
import type { MetricCardModel } from '../logic';

/** A metric card of the statistics views (`DevMetricCard` on the site): label, big value, toned note. */
export function MetricCard({ card }: { card: MetricCardModel }) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <Card variant="soft" padded={false} style={styles.card} testID={`stats-metric-${card.key}`}>
      {/* Paddings sit on an inner view: on web a card's own `padding: 0` wins over longhand paddings. */}
      <View style={styles.body} accessible accessibilityLabel={`${card.label}: ${card.value}. ${card.note}`}>
        <Text variant="captionStrong" color="kicker" numberOfLines={2}>
          {card.label}
        </Text>
        <Text variant="metric" tabular numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
          {card.value}
        </Text>
        <Text variant="captionStrong" style={{ color: noteColor(card.tone, theme) }}>
          {card.note}
        </Text>
      </View>
    </Card>
  );
}

/** Four cards as a 2×2 grid (06 §1.6 "Mobile translation"). */
export function MetricGrid({ cards }: { cards: readonly MetricCardModel[] }) {
  const styles = useStyles();
  const rows: MetricCardModel[][] = [];
  for (let index = 0; index < cards.length; index += 2) rows.push(cards.slice(index, index + 2));
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
  grid: { gap: t.space.md },
  row: { flexDirection: 'row', alignItems: 'stretch', gap: t.space.md },
  card: { flex: 1, minWidth: 0 },
  body: { paddingVertical: t.space.field, paddingHorizontal: t.space.gutter, gap: t.space.xxs },
}));
