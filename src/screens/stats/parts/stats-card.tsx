import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { makeStyles } from '@/theme';
import { Card, Text } from '@/ui';

export type StatsCardProps = {
  /** Title inside the card (17 / 20). */
  title: string;
  /** One muted line under the title: who the block is about. */
  subtitle?: string;
  children?: ReactNode;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * A block of the statistics (mockup D-stats): a card titled inside, with a chart or rows under the title.
 * In a row of cards on a tablet it stretches to the height of its neighbours.
 */
export function StatsCard({ title, subtitle, children, testID, style }: StatsCardProps) {
  const styles = useStyles();
  return (
    <Card testID={testID} style={[styles.card, style]}>
      <View style={styles.head}>
        <Text variant="sectionTitle" accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? (
          <Text variant="small" color="textMuted" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {children}
    </Card>
  );
}

const useStyles = makeStyles((t) => ({
  card: { flexGrow: 1, gap: t.space.md },
  head: { gap: t.space.xxxs },
}));
