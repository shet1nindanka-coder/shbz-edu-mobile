import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { makeStyles } from '@/theme';

import { CheckMark } from './check-mark';
import { PressableScale } from './internal/pressable-scale';
import { Text } from './text';

export type CheckRowProps = {
  label: string;
  checked: boolean;
  onChange?: (checked: boolean) => void;
  /** Second line under the label (12, muted). */
  description?: string;
  /** Node before the label (avatar, icon). */
  left?: ReactNode;
  disabled?: boolean;
  accessibilityLabel?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * Selectable row (`.shbz-check-row`): soft fill, the label truncates, the check mark is pinned right.
 * Selected rows get the accent border and green fill; unselected ones are slightly dimmed.
 */
export function CheckRow({
  label,
  checked,
  onChange,
  description,
  left,
  disabled = false,
  accessibilityLabel,
  testID,
  style,
}: CheckRowProps) {
  const styles = useStyles();
  return (
    <PressableScale
      accessibilityRole="checkbox"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      onPress={() => onChange?.(!checked)}
      testID={testID}
      style={[styles.row, checked ? styles.selected : styles.unselected, disabled ? styles.disabled : null, style]}
    >
      {left}
      <View style={styles.texts}>
        <Text variant="smallStrong" numberOfLines={1}>
          {label}
        </Text>
        {description ? (
          <Text variant="caption" numberOfLines={1}>
            {description}
          </Text>
        ) : null}
      </View>
      <CheckMark checked={checked} />
    </PressableScale>
  );
}

const useStyles = makeStyles((t) => ({
  row: {
    minHeight: t.sizes.minTouch,
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space.md,
    paddingVertical: 10,
    paddingRight: 12,
    paddingLeft: 14,
    borderRadius: t.radii.md,
    borderWidth: t.borders.interactive,
    borderColor: 'transparent',
    backgroundColor: t.colors.softBg,
  },
  selected: { borderColor: t.colors.accentSolid, backgroundColor: t.colors.greenSoft },
  unselected: { opacity: 0.72 },
  disabled: { opacity: 0.45 },
  texts: { flex: 1, minWidth: 0 },
}));
