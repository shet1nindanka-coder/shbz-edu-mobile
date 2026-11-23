import { Children, cloneElement, isValidElement, type ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

import { makeStyles } from '@/theme';

import { View } from 'react-native';

import { Card, useInsideSurface } from './card';
import { ListRow, type ListRowProps } from './list-row';

export type ListCardProps = {
  children?: ReactNode;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * A card of rows (`.card.pad-l`): the rows bring the horizontal padding, the card adds 4 above and below
 * (8 on a tablet), and the hairline under the last row is dropped — lines only separate rows.
 *
 * Inside a card, a panel or a sheet the rows lie flat: a card in a card would be a third floor (page →
 * card → panel, nothing deeper). Give such rows `inset={useRowInset()}` when their container is padded.
 */
export function ListCard({ children, testID, style }: ListCardProps) {
  const styles = useStyles();
  const items = Children.toArray(children);
  let last = -1;
  items.forEach((item, index) => {
    if (isValidElement(item)) last = index;
  });
  const inside = useInsideSurface();
  const rows = items.map((item, index) =>
    index === last && isValidElement<ListRowProps>(item) && item.type === ListRow ? cloneElement(item, { divider: false }) : item,
  );
  if (inside) {
    return (
      <View testID={testID} style={style}>
        {rows}
      </View>
    );
  }
  return (
    <Card padded={false} testID={testID} style={[styles.card, style]}>
      {rows}
    </Card>
  );
}

/**
 * `inset` of a `ListRow` whose list may sit on the page or inside a padded panel / sheet: the card padding
 * on the page (the default), none inside a surface that already pads its content.
 */
export function useRowInset(): number | undefined {
  return useInsideSurface() ? 0 : undefined;
}

const useStyles = makeStyles((t) => ({
  card: { paddingVertical: t.tablet ? t.space.sm : t.space.xxs },
}));
