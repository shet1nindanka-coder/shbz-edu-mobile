import { Children, cloneElement, isValidElement, type ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

import { makeStyles } from '@/theme';

import { Card } from './card';
import { ListRow, type ListRowProps } from './list-row';

export type ListCardProps = {
  children?: ReactNode;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * A card of rows (`.card.pad-l`): the rows bring the horizontal padding, the card adds 4 above and below
 * (8 on a tablet), and the hairline under the last row is dropped — lines only separate rows.
 */
export function ListCard({ children, testID, style }: ListCardProps) {
  const styles = useStyles();
  const items = Children.toArray(children);
  let last = -1;
  items.forEach((item, index) => {
    if (isValidElement(item)) last = index;
  });
  return (
    <Card padded={false} testID={testID} style={[styles.card, style]}>
      {items.map((item, index) =>
        index === last && isValidElement<ListRowProps>(item) && item.type === ListRow ? cloneElement(item, { divider: false }) : item,
      )}
    </Card>
  );
}

const useStyles = makeStyles((t) => ({
  card: { paddingVertical: t.tablet ? t.space.sm : t.space.xxs },
}));
