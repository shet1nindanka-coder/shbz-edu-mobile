import type { ReactNode } from 'react';
import { View } from 'react-native';

import { makeStyles, useTheme } from '@/theme';
import { Icon, PressableScale, Text, type IconName, type TextProps } from '@/ui';

export type DisclosureRowProps = {
  label: string;
  expanded: boolean;
  onToggle: () => void;
  /** Muted text after the label («· 3 запуска»). */
  meta?: string;
  /** Typography of the label; default `smallStrong`. */
  variant?: TextProps['variant'];
  color?: TextProps['color'];
  /** Mark before the label instead of the chevron's place (the lock of «видно только вам»). */
  icon?: IconName;
  /** Node at the right edge (a chip). */
  trailing?: ReactNode;
  accessibilityLabel?: string;
  testID?: string;
};

/**
 * Header of a small disclosure inside a card ("Check history · 3 runs", "Internal diagnostics",
 * "Completed homework (2)"): a label and a chevron on one 44 pt row; the owner renders the body.
 */
export function DisclosureRow({ label, expanded, onToggle, meta, variant = 'smallStrong', color = 'textMuted', icon, trailing, accessibilityLabel, testID }: DisclosureRowProps) {
  const styles = useStyles();
  const theme = useTheme();
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
      {icon ? <Icon name={icon} size={theme.sizes.icon.sm} color="textMuted" /> : null}
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
      <Icon name={expanded ? 'chevronUp' : 'chevronDown'} size={theme.sizes.icon.sm} color="textMuted" />
    </PressableScale>
  );
}

const useStyles = makeStyles((t) => ({
  row: { minHeight: t.sizes.minTouch, flexDirection: 'row', alignItems: 'center', gap: t.space.sm },
  pressed: { opacity: 0.6 },
  texts: { flex: 1, minWidth: 0 },
  label: { flexShrink: 1 },
}));
