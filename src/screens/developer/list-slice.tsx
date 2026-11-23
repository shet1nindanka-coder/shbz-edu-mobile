import type { ReactNode } from 'react';
import { View } from 'react-native';

import { makeStyles } from '@/theme';

export type ListSliceProps = {
  /** The first row of its card: rounds the top corners. */
  first: boolean;
  /** The last row of its card: rounds the bottom corners. */
  last: boolean;
  /** The whole list already sits in a card (the tablet panel): the cell paints nothing of its own. */
  inCard?: boolean;
  children: ReactNode;
};

/**
 * One row of a virtualised list drawn as a piece of ONE card. The directory and the journal have no upper
 * bound, so their rows are cells of a FlashList and cannot sit inside a `ListCard`; each cell paints the
 * card's fill instead, and the first and the last one carry its corners and its inner padding. The card
 * shadow is left out: a shadow per cell would fall on the neighbouring rows.
 */
export function ListSlice({ first, last, inCard = false, children }: ListSliceProps) {
  const styles = useStyles();
  if (inCard) return <>{children}</>;
  return <View style={[styles.slice, first ? styles.first : null, last ? styles.last : null]}>{children}</View>;
}

const useStyles = makeStyles((t) => ({
  slice: {
    backgroundColor: t.colors.cardBg,
    borderColor: t.colors.cardBorder,
    borderLeftWidth: t.borders.hairline,
    borderRightWidth: t.borders.hairline,
    // A pressed or selected row must not paint over the rounded corners.
    overflow: 'hidden',
  },
  // The paddings are those of `ListCard`.
  first: {
    borderTopWidth: t.borders.hairline,
    borderTopLeftRadius: t.radii.xl,
    borderTopRightRadius: t.radii.xl,
    paddingTop: t.tablet ? t.space.sm : t.space.xxs,
  },
  last: {
    borderBottomWidth: t.borders.hairline,
    borderBottomLeftRadius: t.radii.xl,
    borderBottomRightRadius: t.radii.xl,
    paddingBottom: t.tablet ? t.space.sm : t.space.xxs,
  },
}));
