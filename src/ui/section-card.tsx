import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { makeStyles } from '@/theme';

import { Card, type CardProps } from './card';
import { Text } from './text';

export type SectionCardProps = {
  title: string;
  /** Explanation under the title. It is a hint: pass it only when hints are switched on. */
  description?: string;
  /** Right-aligned node on the title row (button, link, counter). */
  action?: ReactNode;
  /** Props of the card below the title (variant, padding…). */
  card?: Omit<CardProps, 'children'>;
  /** Render the children without the card (a list of cards of their own). */
  bare?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
};

/** Page section: title row (20/700, optional hint and action) and, 18 below, a card with the content. */
export function SectionCard({ title, description, action, card, bare = false, style, children }: SectionCardProps) {
  const styles = useStyles();
  return (
    <View style={[styles.section, style]}>
      <View style={styles.header}>
        <View style={styles.titles}>
          <Text variant="sectionTitle" accessibilityRole="header">
            {title}
          </Text>
          {description ? (
            <Text variant="small" color="textMuted">
              {description}
            </Text>
          ) : null}
        </View>
        {action}
      </View>
      {bare ? children : <Card {...card}>{children}</Card>}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  section: { gap: t.space.field },
  header: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: t.space.md },
  titles: { flex: 1, minWidth: 0, gap: 4 },
}));
