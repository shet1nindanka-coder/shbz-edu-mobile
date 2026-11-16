import type { ReactNode } from 'react';
import { View, type GestureResponderEvent, type StyleProp, type ViewStyle } from 'react-native';

import { makeStyles } from '@/theme';

import { AccentGradient } from './accent-gradient';
import { Card } from './card';
import { Text } from './text';

export type NavCardStat = { label: string; value: string | number };

export type NavCardProps = {
  /** Tiny uppercase over-title. */
  kicker?: string;
  title: string;
  /** Up to three label/value pairs (value 23/800). */
  stats?: readonly NavCardStat[];
  /** One muted line under the stats (13/600). */
  meta?: string;
  /** Buttons row pinned to the bottom (gap 10). */
  footer?: ReactNode;
  /** Makes the whole card a button. */
  onPress?: (event: GestureResponderEvent) => void;
  accessibilityLabel?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * Navigation card (`ShbzNavCard`): a card with the 5px gradient band on top — the only place where the
 * accent is decoration.
 */
export function NavCard({ kicker, title, stats, meta, footer, onPress, accessibilityLabel, testID, style }: NavCardProps) {
  const styles = useStyles();
  return (
    <Card
      padded={false}
      onPress={onPress}
      accessibilityLabel={accessibilityLabel ?? (onPress ? title : undefined)}
      testID={testID}
      style={style}
    >
      <AccentGradient style={styles.band} />
      <View style={styles.body}>
        <View style={styles.head}>
          {kicker ? <Text variant="cardKicker">{kicker}</Text> : null}
          <Text variant="cardTitle" numberOfLines={2} style={styles.title}>
            {title}
          </Text>
        </View>
        {stats && stats.length > 0 ? (
          <View style={styles.stats}>
            {stats.map((stat) => (
              <View key={stat.label}>
                <Text variant="statLabel">{stat.label}</Text>
                <Text variant="metric" tabular style={styles.statValue}>
                  {stat.value}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
        {meta ? <Text variant="meta">{meta}</Text> : null}
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </View>
    </Card>
  );
}

const useStyles = makeStyles((t) => ({
  // The band follows the card's top corners itself: clipping the card would also clip its shadow on iOS.
  band: {
    height: t.sizes.navCardBand,
    borderTopLeftRadius: t.radii.lg - t.borders.hairline,
    borderTopRightRadius: t.radii.lg - t.borders.hairline,
  },
  body: { padding: t.space.xl, gap: t.space.field },
  head: { gap: 8 },
  // Two lines are always reserved (2.7em on the site) so cards in a list line up.
  title: { minHeight: 46 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 26, rowGap: t.space.md },
  statValue: { marginTop: 2 },
  footer: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
}));
