import type { ViewStyle } from 'react-native';

import { makeStyles, useTheme } from '@/theme';

export type PanelRow = { inset: number; style: ViewStyle; divider: boolean };

/**
 * Props of a `ListRow` inside a tablet list panel (`.row.sel` of the mockups): the row keeps a small
 * margin from the panel's edges, so the soft fill of the selected one is a rounded tile and not a band
 * cut by the card. The texts stay on the card's padding. The selected tile has no hairline under it — a
 * line would bend around its corners.
 */
export function usePanelRow(): (selected: boolean, divider: boolean) => PanelRow {
  const theme = useTheme();
  const styles = useStyles();
  return (selected, divider) => ({
    inset: theme.space.card - theme.space.sm,
    style: selected ? styles.selected : styles.row,
    divider: divider && !selected,
  });
}

const useStyles = makeStyles((t) => ({
  row: { marginHorizontal: t.space.sm },
  selected: { marginHorizontal: t.space.sm, borderRadius: t.radii.md },
}));
