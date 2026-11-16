import { View, type StyleProp, type ViewStyle } from 'react-native';

import { makeStyles, type HomeworkNumberStatus } from '@/theme';

import { StatusOptionButton } from './internal/status-option-button';

export type StatusOption<T extends string> = {
  value: T;
  /** Words only, no glyphs (owner decision on the site). */
  label: string;
  /** Style of the option while active: a traffic-light status, or `neutral` (ink outline). */
  tone: HomeworkNumberStatus | 'neutral';
};

export type StatusOptionGroupProps<T extends string> = {
  options: readonly StatusOption<T>[];
  value: T | null;
  /** Tapping the active option clears it (`null`). */
  onChange: (value: T | null) => void;
  /** Accessible name of the group, e.g. `dict.students.lessonResult.aria`. */
  accessibilityLabel: string;
  /** `lg` 13.5px labels (default) · `md` 12px. */
  size?: 'lg' | 'md';
  /** Buttons per row: 2 on phones (default, a 2 × 2 grid), 4 for one row on wide screens. */
  columns?: 1 | 2 | 3 | 4;
  disabled?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * Status / lesson-result option group (`ResultToggle`): traffic-light buttons in a 2 × 2 grid. The
 * active option is filled with its status colour; activating one plays the "stamp".
 */
export function StatusOptionGroup<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
  size = 'lg',
  columns = 2,
  disabled = false,
  testID,
  style,
}: StatusOptionGroupProps<T>) {
  const styles = useStyles();
  // Slightly under an exact share so the gaps fit; flexGrow fills the rest.
  const basis: `${number}%` = `${Math.floor(100 / columns) - 4}%`;
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      style={[styles.group, disabled ? styles.disabled : null, style]}
    >
      {options.map((option) => (
        <StatusOptionButton
          key={option.value}
          label={option.label}
          tone={option.tone}
          active={option.value === value}
          size={size}
          basis={basis}
          disabled={disabled}
          onPress={() => onChange(option.value === value ? null : option.value)}
        />
      ))}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  group: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.xs },
  disabled: { opacity: 0.6 },
}));
