import { useState, type Ref } from 'react';
import {
  TextInput,
  View,
  type StyleProp,
  type TextInputInstance,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { makeStyles, useTheme } from '@/theme';

import { Icon } from './icon';
import { PressableScale } from './internal/pressable-scale';
import { Text } from './text';

export type SearchFieldProps = Omit<TextInputProps, 'style' | 'editable' | 'onSubmitEditing'> & {
  value: string;
  onChangeText: (value: string) => void;
  /** Called with the current text from the keyboard's search key and from the arrow button. */
  onSubmit?: (value: string) => void;
  /** Accessible name of the arrow button (it appears once something is typed). */
  submitLabel: string;
  /** Inline error under the pill. */
  error?: string | null;
  disabled?: boolean;
  /** Blocks submitting while a search is running. */
  busy?: boolean;
  ref?: Ref<TextInputInstance>;
  style?: StyleProp<ViewStyle>;
};

/** Search pill (`.shbz-search`): 46 high, full width on phones, accent border on focus. */
export function SearchField({
  value,
  onChangeText,
  onSubmit,
  submitLabel,
  error,
  disabled = false,
  busy = false,
  ref,
  style,
  onFocus,
  onBlur,
  accessibilityLabel,
  placeholder,
  ...inputProps
}: SearchFieldProps) {
  const theme = useTheme();
  const styles = useStyles();
  const [focused, setFocused] = useState(false);
  const canSubmit = value.trim().length > 0 && !disabled && !busy;

  return (
    <View style={[styles.wrap, style]}>
      <View style={[styles.pill, focused ? styles.pillFocused : null, disabled ? styles.disabled : null]}>
        <Icon name="search" size={16} color="kicker" />
        <TextInput
          ref={ref}
          accessibilityLabel={accessibilityLabel ?? placeholder}
          placeholder={placeholder}
          placeholderTextColor={theme.colors.placeholder}
          selectionColor={theme.colors.accentSolid}
          cursorColor={theme.colors.accentSolid}
          keyboardAppearance={theme.dark ? 'dark' : 'light'}
          returnKeyType="search"
          enterKeyHint="search"
          autoCorrect={false}
          {...inputProps}
          value={value}
          onChangeText={onChangeText}
          editable={!disabled}
          onSubmitEditing={() => {
            if (canSubmit) onSubmit?.(value);
          }}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          style={styles.input}
        />
        {value.length > 0 ? (
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={submitLabel}
            accessibilityState={{ disabled: !canSubmit }}
            disabled={!canSubmit}
            onPress={() => onSubmit?.(value)}
            hitSlop={12}
            style={[styles.submit, !canSubmit ? styles.disabled : null]}
          >
            <Icon name="forward" size={20} color="accentSolid" />
          </PressableScale>
        ) : null}
      </View>
      {error ? (
        <Text variant="captionMedium" color="redText" accessibilityRole="alert" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  wrap: { gap: t.space.xs, alignSelf: 'stretch' },
  pill: {
    height: t.sizes.search,
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space.sm,
    paddingHorizontal: 18,
    borderRadius: t.radii.md,
    borderWidth: t.borders.interactive,
    borderColor: t.colors.outlineBorder,
    backgroundColor: t.colors.cardBg,
  },
  pillFocused: { borderColor: t.colors.accentSolid },
  input: {
    ...t.typography.small,
    // A fixed line box misaligns the caret in a single-line input.
    lineHeight: undefined,
    flex: 1,
    minWidth: 0,
    alignSelf: 'stretch',
    paddingVertical: 0,
    paddingHorizontal: 0,
    color: t.colors.textStrong,
    // No browser focus ring (see `text-field.tsx`): width 0 alone does not hide `outline-style: auto`.
    outlineWidth: 0,
    outlineStyle: 'solid',
  },
  submit: { borderRadius: t.radii.full },
  disabled: { opacity: 0.55 },
}));
