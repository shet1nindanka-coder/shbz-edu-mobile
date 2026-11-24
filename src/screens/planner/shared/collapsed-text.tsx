import { useState } from 'react';

import { makeStyles, useTheme } from '@/theme';
import { Icon, PressableScale, Text } from '@/ui';

export type CollapsedTextProps = {
  /** What the AI wrote: the summary of a plan, the reason of one number. */
  text: string;
  testID?: string;
};

/**
 * A sentence of the AI folded to its first line (docs/design/glass-over-paper.md §1a "No sentences on a
 * screen"): the sets and the statements are what a board is opened for, the AI's reasoning is read on
 * demand — a tap unfolds it, another one folds it back. A screen reader hears the whole text either way.
 */
export function CollapsedText({ text, testID }: CollapsedTextProps) {
  const styles = useStyles();
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={text}
      accessibilityState={{ expanded: open }}
      onPress={() => setOpen((current) => !current)}
      scaleTo={1}
      // One line of 13 pt text: the touch target is grown to the 44 pt minimum.
      hitSlop={{ top: theme.space.md, bottom: theme.space.md }}
      testID={testID}
      style={styles.row}
    >
      <Text variant="small" color="textMuted" numberOfLines={open ? undefined : 1} style={styles.text}>
        {text}
      </Text>
      <Icon name={open ? 'chevronUp' : 'chevronDown'} size={theme.sizes.icon.sm} color="textMuted" />
    </PressableScale>
  );
}

const useStyles = makeStyles((t) => ({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: t.space.xs },
  text: { flex: 1, minWidth: 0 },
}));
