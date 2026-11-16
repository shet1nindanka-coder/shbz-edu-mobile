import { View } from 'react-native';

import { format, useI18n } from '@/i18n';
import { makeStyles, useTheme } from '@/theme';
import { Chip, Text } from '@/ui';

import { rankingColor } from '../charts/palette';
import type { RankingItem } from '../logic';

export type RankingCardProps = {
  title: string;
  emptyMessage: string;
  items: readonly RankingItem[];
  testID?: string;
};

/**
 * A ranking of up to five students or topics (`RankingCard` on the site): place, title, subtitle, the
 * value on the right and a bar in the tone of the list.
 */
export function RankingCard({ title, emptyMessage, items, testID }: RankingCardProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { m } = useI18n();

  return (
    <View style={styles.card} testID={testID}>
      <Text variant="cardTitle" accessibilityRole="header">
        {title}
      </Text>
      {items.length === 0 ? (
        <Text variant="small" color="textMuted" align="center" style={styles.empty}>
          {emptyMessage}
        </Text>
      ) : (
        items.map((item, index) => (
          <View key={item.key} style={styles.item}>
            <View style={styles.head}>
              <Chip label={`#${index + 1}`} accessibilityLabel={format(m.stats.ranking.placeAria, { n: index + 1 })} />
              <Text variant="bodyBold" numberOfLines={3} style={styles.title}>
                {item.title}
              </Text>
              <Text variant="smallExtra" tabular>
                {item.valueLabel}
              </Text>
            </View>
            <Text variant="small" color="textMuted">
              {item.subtitle}
            </Text>
            <View
              style={styles.track}
              accessible
              accessibilityRole="progressbar"
              accessibilityLabel={item.title}
              accessibilityValue={{ min: 0, max: 100, now: Math.round(item.progress) }}
            >
              <View style={[styles.fill, { width: `${item.progress}%`, backgroundColor: rankingColor(item.tone, theme) }]} />
            </View>
          </View>
        ))
      )}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  card: { gap: t.space.md },
  empty: { paddingVertical: t.space.lg },
  item: {
    gap: t.space.sm,
    paddingVertical: t.space.gutter,
    paddingHorizontal: t.space.gutter,
    borderRadius: t.radii.lg,
    borderWidth: t.borders.hairline,
    borderColor: t.colors.softBorder,
    backgroundColor: t.colors.softBg,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: t.space.sm },
  title: { flex: 1, minWidth: 0 },
  track: {
    height: t.sizes.progress.sm,
    borderRadius: t.radii.full,
    backgroundColor: t.colors.progressTrack,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: t.radii.full },
}));
