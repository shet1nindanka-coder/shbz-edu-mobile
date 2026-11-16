import type { ReactNode } from 'react';
import { View } from 'react-native';

import { makeStyles } from '@/theme';
import { Icon, PressableScale, Text, type TextProps } from '@/ui';

export type DisclosureRowProps = {
  label: string;
  expanded: boolean;
  onToggle: () => void;
  /** Muted text after the label («· 3 запуска»). */
  meta?: string;
  /** Typography of the label; default `smallStrong`. */
  variant?: TextProps['variant'];
  color?: TextProps['color'];
  /** Node at the right edge (a chip). */
  trailing?: ReactNode;
  accessibilityLabel?: string;
  testID?: string;
};

/**
 * Header of a small disclosure inside a card ("Check history · 3 runs", "Internal diagnostics",
 * "Completed homework (2)"): a chevron and a label on one 44 pt row; the owner renders the body.
 */
export function DisclosureRow({ label, expanded, onToggle, meta, variant = 'smallStrong', color, trailing, accessibilityLabel, testID }: DisclosureRowProps) {
  const styles = useStyles();
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (meta ? `${label} ${meta}` : label)}
      accessibilityState={{ expanded }}
      scaleTo={1}
      onPress={onToggle}
      testID={testID}
      style={styles.row}
      pressedStyle={styles.pressed}
    >
      <Icon name={expanded ? 'chevronDown' : 'chevronRight'} size={16} color="kicker" />
      <View style={styles.texts}>
        <Text variant={variant} color={color} style={styles.label}>
          {label}
          {meta ? (
            <Text variant="small" color="textMuted">
              {` ${meta}`}
            </Text>
          ) : null}
        </Text>
      </View>
      {trailing}
    </PressableScale>
  );
}

const useStyles = makeStyles((t) => ({
  row: { minHeight: t.sizes.minTouch, flexDirection: 'row', alignItems: 'center', gap: t.space.sm, borderRadius: t.radii.sm },
  pressed: { opacity: 0.6 },
  texts: { flex: 1, minWidth: 0 },
  label: { flexShrink: 1 },
}));
