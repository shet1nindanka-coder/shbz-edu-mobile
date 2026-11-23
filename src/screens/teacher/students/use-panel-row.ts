import { makeStyles, useTheme } from '@/theme';

/**
 * Props of a `ListRow` inside a tablet list panel (`.row.sel` of the mockups): the row keeps a small
 * margin from the panel's edges, so the soft fill of the selected one is a rounded tile and not a band
 * cut by the card. The texts stay on the card's padding.
 */
export function usePanelRow() {
  const theme = useTheme();
  const styles = useStyles();
  return { inset: theme.space.card - theme.space.sm, style: styles.row };
}

const useStyles = makeStyles((t) => ({
  row: { marginHorizontal: t.space.sm, borderRadius: t.radii.md },
}));
