import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

import { makeStyles } from '@/theme';
import { Card, Text } from '@/ui';

export type StatsCardProps = {
  /** Title inside the card (17 / 20): a name or two words — never a line under it. */
  title: string;
  /** The site's full title, when the visible one is a shortened form of it. */
  titleAccessibilityLabel?: string;
  children?: ReactNode;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * A block of the statistics (mockup D-stats): a card titled inside, with a chart or rows under the title.
 * In a row of cards on a tablet it stretches to the height of its neighbours.
 */
export function StatsCard({ title, titleAccessibilityLabel, children, testID, style }: StatsCardProps) {
  const styles = useStyles();
  return (
    <Card testID={testID} style={[styles.card, style]}>
      <Text variant="sectionTitle" accessibilityRole="header" accessibilityLabel={titleAccessibilityLabel}>
        {title}
      </Text>
      {children}
    </Card>
  );
}

const useStyles = makeStyles((t) => ({
  card: { flexGrow: 1, gap: t.space.md },
}));
