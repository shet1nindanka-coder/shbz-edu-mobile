import { View } from 'react-native';

import { format, useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { Text } from '@/ui';

import type { RankingItem } from '../logic';
import { StatsCard } from './stats-card';

export type RankingCardProps = {
  title: string;
  emptyMessage: string;
  items: readonly RankingItem[];
  testID?: string;
};

/**
 * A ranking of up to five students or topics (`RankingCard` on the site; mockup D-stats «Где чаще всего
 * красное»; text diet §1a): a row is the name and the figure. The place is the row's position; the site's
 * caption («29 решено · 32 отмечено») is only read out. Only the "needs help" lists draw the figure red.
 */
export function RankingCard({ title, emptyMessage, items, testID }: RankingCardProps) {
  const styles = useStyles();
  const { m } = useI18n();

  return (
    <StatsCard title={title} testID={testID}>
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
                <Text variant="bodyStrong" numberOfLines={2} style={styles.name}>
                  {item.title}
                </Text>
                <Text variant="bodyStrong" color={item.tone === 'rose' ? 'redText' : 'textMuted'} tabular>
                  {item.valueLabel}
                </Text>
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
  row: { minHeight: t.sizes.minTouch, flexDirection: 'row', alignItems: 'center', gap: t.space.md, paddingVertical: t.space.sm },
  divider: { borderTopWidth: t.borders.hairline, borderTopColor: t.colors.rowBorder },
  name: { flex: 1, minWidth: 0 },
}));
