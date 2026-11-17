import { type StyleProp, type ViewStyle } from 'react-native';

import { makeStyles, useTheme } from '@/theme';

import { CheckMark } from './check-mark';
import { hitSlopFor, PressableScale } from './internal/pressable-scale';
import { Text } from './text';

export type CheckboxProps = {
  checked: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  /** Text to the right of the box; the whole row toggles. */
  label?: string;
  /** Required when there is no `label`. */
  accessibilityLabel?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

/** Checkbox (`.shbz-checkbox`). Pressed scale is 0.92; the hit area is at least 44pt. */
export function Checkbox({ checked, onChange, disabled = false, label, accessibilityLabel, testID, style }: CheckboxProps) {
  const theme = useTheme();
  const styles = useStyles();
  return (
    <PressableScale
      accessibilityRole="checkbox"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      onPress={() => onChange?.(!checked)}
      scaleTo={label ? 1 : theme.motion.checkboxPressScale}
      hitSlop={label ? { top: 11, bottom: 11 } : hitSlopFor(theme.sizes.checkbox, theme.sizes.checkbox)}
      testID={testID}
      style={[styles.row, label ? null : styles.bare, style]}
    >
      <CheckMark checked={checked} disabled={disabled} />
      {label ? (
        <Text variant="small" color="label" style={[styles.label, disabled ? styles.disabled : null]}>
          {label}
        </Text>
      ) : null}
    </PressableScale>
  );
}

const useStyles = makeStyles((t) => ({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: t.radii.checkbox },
  bare: { alignSelf: 'flex-start' },
  // `minWidth: 0`: on web a flex item is at least as wide as its longest word, so a long unbroken name
  // would run past the row instead of wrapping.
  label: { flex: 1, minWidth: 0, paddingTop: 1 },
  disabled: { opacity: 0.5 },
}));
