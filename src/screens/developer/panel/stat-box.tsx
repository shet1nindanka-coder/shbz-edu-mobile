import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

import { makeStyles } from '@/theme';
import { Card, Text } from '@/ui';

export type StatBoxProps = {
  /** What the figure counts (13, muted). */
  caption: string;
  value: string;
  /** Muted continuation of the value: «/ 300». */
  valueSuffix?: string;
  /** One muted line under the figure. */
  note?: string;
  /** The value signals a problem: the only case in which the figure is coloured. */
  attention?: boolean;
  /** A date or a size instead of a counter: the card-title size, so it fits its box. */
  compact?: boolean;
  /** Between the figure and the note (a progress bar). */
  children?: ReactNode;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * A plain figure of the panel (docs/design/glass-over-paper.md §1 rule 3; mockup D-stats): a caption, a
 * big number and at most one note — no coloured chip unless the value needs attention. On the page it is
 * a card, inside a card a soft panel (`Card` decides).
 */
export function StatBox({ caption, value, valueSuffix, note, attention = false, compact = false, children, testID, style }: StatBoxProps) {
  const styles = useStyles();
  return (
    <Card
      accessibilityLabel={[caption, [value, valueSuffix].filter(Boolean).join(' '), note].filter(Boolean).join(', ')}
      style={[styles.box, style]}
      testID={testID}
    >
      <Text variant="small" color="textMuted" numberOfLines={2}>
        {caption}
      </Text>
      <Text variant={compact ? 'cardTitle' : 'metric'} color={attention ? 'redText' : 'textStrong'} tabular>
        {value}
        {valueSuffix ? (
          <Text variant="cardTitle" color="textMuted" tabular>
            {` ${valueSuffix}`}
          </Text>
        ) : null}
      </Text>
      {children}
      {note ? (
        <Text variant="small" color="textMuted">
          {note}
        </Text>
      ) : null}
    </Card>
  );
}

const useStyles = makeStyles((t) => ({
  box: { gap: t.space.xs },
}));
