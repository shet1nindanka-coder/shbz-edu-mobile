import { View } from 'react-native';

import { format, useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { Chip, Text } from '@/ui';

import type { RankingItem } from '../logic';
import { StatsCard } from './stats-card';

export type RankingCardProps = {
  title: string;
  /** What is ranked: «По ученикам», «По темам». */
  subtitle?: string;
  emptyMessage: string;
  items: readonly RankingItem[];
  testID?: string;
};

/**
 * A ranking of up to five students or topics (`RankingCard` on the site; mockup D-stats «Где чаще всего
 * красное»): rows of a card — the place, the title, one caption and the value on the right. The value is a
 * plain figure; only the "needs help" lists mark it red.
 */
export function RankingCard({ title, subtitle, emptyMessage, items, testID }: RankingCardProps) {
  const styles = useStyles();
  const { m } = useI18n();

  return (
    <StatsCard title={title} subtitle={subtitle} testID={testID}>
      {items.length === 0 ? (
        <Text variant="small" color="textMuted" style={styles.empty}>
          {emptyMessage}
        </Text>
      ) : (
        <View>
          {items.map((item, index) => {
            const place = format(m.stats.ranking.placeAria, { n: index + 1 });
            return (
              <View
                key={item.key}
                accessible
                accessibilityLabel={`${place}. ${item.title}. ${item.subtitle}. ${item.valueLabel}`}
                style={[styles.row, index > 0 ? styles.divider : null]}
              >
                <Text variant="small" color="textMuted" tabular style={styles.place}>
                  {index + 1}
                </Text>
                <View style={styles.texts}>
                  <Text variant="bodyStrong" numberOfLines={2}>
                    {item.title}
                  </Text>
                  <Text variant="small" color="textMuted" numberOfLines={2}>
                    {item.subtitle}
                  </Text>
                </View>
                {item.tone === 'rose' ? (
                  <Chip label={item.valueLabel} tone="red" />
                ) : (
                  <Text variant="small" color="textMuted" tabular>
                    {item.valueLabel}
                  </Text>
                )}
              </View>
            );
          })}
        </View>
      )}
    </StatsCard>
  );
}

const useStyles = makeStyles((t) => ({
  empty: { paddingVertical: t.space.sm },
  row: { minHeight: t.sizes.row, flexDirection: 'row', alignItems: 'center', gap: t.space.md, paddingVertical: t.space.sm },
  divider: { borderTopWidth: t.borders.hairline, borderTopColor: t.colors.rowBorder },
  // Wide enough for the place of a five-row list.
  place: { width: t.space.lg, textAlign: 'center' },
  texts: { flex: 1, minWidth: 0, gap: t.space.xxxs },
}));
