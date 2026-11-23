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

/**
 * Page section: a caption (13 / 600, muted — `.sec`) with an optional hint and action, and under it a card
 * with the content. The caption names a block that has no title of its own; a title that belongs INSIDE a
 * card is a `sectionTitle` text there.
 */
export function SectionCard({ title, description, action, card, bare = false, style, children }: SectionCardProps) {
  const styles = useStyles();
  return (
    <View style={[styles.section, style]}>
      <View style={styles.header}>
        <View style={styles.titles}>
          <Text variant="kicker" color="textMuted" accessibilityRole="header">
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
  section: { gap: t.space.sm },
  header: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: t.space.md, paddingHorizontal: t.space.xxs, paddingTop: t.space.xxs },
  titles: { flex: 1, minWidth: 0, gap: t.space.xxxs },
}));
