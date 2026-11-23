import type { ReactNode } from 'react';
import { View } from 'react-native';

import { ListCard, useInsideSurface } from '@/ui';

/**
 * A list of rows that sits either on the page (a phone screen) or inside a tablet panel. On the page it
 * is the card of rows; inside a panel — already a card — the rows lie flat, because a card in a card
 * would be drawn as a soft box (docs/design/glass-over-paper.md §4: page → card → panel, no third floor).
 */
export function Rows({ children, testID }: { children?: ReactNode; testID?: string }) {
  const inside = useInsideSurface();
  return inside ? <View testID={testID}>{children}</View> : <ListCard testID={testID}>{children}</ListCard>;
}

/**
 * `inset` of a `ListRow` rendered in `Rows`: the card padding on the page (the kit default), none inside
 * a padded panel or sheet.
 */
export function useRowInset(): number | undefined {
  return useInsideSurface() ? 0 : undefined;
}
