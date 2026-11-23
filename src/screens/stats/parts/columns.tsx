import { Children, type ReactNode } from 'react';
import { View } from 'react-native';

import { makeStyles, useTheme } from '@/theme';

export type ColumnsProps = {
  /** Share of the row each child takes on a tablet, in order; a missing weight is 1. */
  weights?: readonly number[];
  children?: ReactNode;
};

/**
 * Cards side by side on a tablet (docs/design/glass-over-paper.md §1 rule 7: a tablet screen is never half
 * empty), stacked on a phone. The children are cards; in a row they share one height.
 */
export function Columns({ weights, children }: ColumnsProps) {
  const styles = useStyles();
  const theme = useTheme();
  if (!theme.tablet) return <View style={styles.stack}>{children}</View>;
  return (
    <View style={styles.row}>
      {Children.toArray(children).map((child, index) => (
        <View key={index} style={[styles.column, { flex: weights?.[index] ?? 1 }]}>
          {child}
        </View>
      ))}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  stack: { gap: t.space.block },
  row: { flexDirection: 'row', alignItems: 'stretch', gap: t.space.block },
  column: { minWidth: 0 },
}));
