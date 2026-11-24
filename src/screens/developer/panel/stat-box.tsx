import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

import { makeStyles } from '@/theme';
import { Card, Text } from '@/ui';

export type StatBoxProps = {
  /** What the figure counts: one or two words (13, muted). */
  caption: string;
  value: string;
  /** Muted continuation of the value: «/ 300», «39.2 МБ». */
  valueSuffix?: string;
  /** Read by a screen reader instead of the caption and the figure: the site's full name and note. */
  accessibilityLabel?: string;
  /** The value signals a problem: the only case in which the figure is coloured. */
  attention?: boolean;
  /** A date or a size instead of a counter: the card-title size, so it fits its box. */
  compact?: boolean;
  /** Under the figure (a progress bar). */
  children?: ReactNode;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * A plain figure of the panel (docs/design/glass-over-paper.md §1 rule 3, §1a; mockup D-stats): a caption
 * and a big number — no note line, no coloured chip unless the value needs attention. On the page it is a
 * card, inside a card a soft panel (`Card` decides).
 */
export function StatBox({ caption, value, valueSuffix, accessibilityLabel, attention = false, compact = false, children, testID, style }: StatBoxProps) {
  const styles = useStyles();
  return (
    <Card
      accessibilityLabel={accessibilityLabel ?? [caption, [value, valueSuffix].filter(Boolean).join(' ')].join(', ')}
      style={[styles.box, style]}
      testID={testID}
    >
      <Text variant="small" color="textMuted" numberOfLines={1}>
        {caption}
      </Text>
      <Text variant={compact ? 'cardTitle' : 'metric'} color={attention ? 'redText' : 'textStrong'} tabular numberOfLines={1}>
        {value}
        {valueSuffix ? (
          <Text variant={compact ? 'small' : 'cardTitle'} color="textMuted" tabular>
            {` ${valueSuffix}`}
          </Text>
        ) : null}
      </Text>
      {children}
    </Card>
  );
}

const useStyles = makeStyles((t) => ({
  box: { gap: t.space.xs },
}));
