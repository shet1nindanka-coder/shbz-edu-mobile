import { useState, type ReactNode, type Ref } from 'react';
import {
  TextInput,
  View,
  type StyleProp,
  type TextInputInstance,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { makeStyles, useTheme } from '@/theme';

import { FieldShell } from './internal/field-shell';
import { InputFrame } from './internal/input-frame';

export type TextAreaProps = Omit<TextInputProps, 'style' | 'editable' | 'multiline'> & {
  label?: string;
  error?: string | null;
  helper?: string;
  disabled?: boolean;
  /**
   * `default` — `.shbz-textarea` (min 96, gradient focus border).
   * `note` — the student's sticker (`.shbz-note-field`): soft fill, dashed border while empty, solid once
   * it has text, ink border + mint ring on focus.
   */
  variant?: 'default' | 'note';
  /** Right-aligned node on the label row (e.g. a "saved" flash or a counter). */
  labelAside?: ReactNode;
  ref?: Ref<TextInputInstance>;
  containerStyle?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
};

/** Multi-line input. Grows with its content from the minimum height. */
export function TextArea({
  label,
  error,
  helper,
  disabled = false,
  variant = 'default',
  labelAside,
  ref,
  containerStyle,
  inputStyle,
  onFocus,
  onBlur,
  accessibilityLabel,
  value,
  ...inputProps
}: TextAreaProps) {
  const theme = useTheme();
  const styles = useStyles();
  const [focused, setFocused] = useState(false);

  const input = (
    <TextInput
      ref={ref}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      placeholderTextColor={theme.colors.placeholder}
      selectionColor={theme.colors.accentSolid}
      cursorColor={theme.colors.accentSolid}
      keyboardAppearance={theme.dark ? 'dark' : 'light'}
      {...inputProps}
      value={value}
      multiline
      editable={!disabled}
      textAlignVertical="top"
      onFocus={(event) => {
        setFocused(true);
        onFocus?.(event);
      }}
      onBlur={(event) => {
        setFocused(false);
        onBlur?.(event);
      }}
      style={[variant === 'note' ? styles.noteInput : styles.input, inputStyle]}
    />
  );

  return (
    <FieldShell label={label} error={error} helper={helper} labelAside={labelAside} style={containerStyle}>
      {variant === 'note' ? (
        <View
          style={[
            styles.note,
            value ? styles.noteFilled : null,
            focused ? styles.noteFocused : null,
            disabled ? styles.disabled : null,
          ]}
        >
          {input}
        </View>
      ) : (
        <InputFrame focused={focused} disabled={disabled} minHeight={theme.sizes.textareaMin}>
          {input}
        </InputFrame>
      )}
    </FieldShell>
  );
}

const useStyles = makeStyles((t) => ({
  input: {
    ...t.typography.body,
    flex: 1,
    minWidth: 0,
    alignSelf: 'stretch',
    minHeight: t.sizes.textareaMin - 2 * t.borders.interactive,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: t.colors.textStrong,
    // No browser focus ring (see `text-field.tsx`): width 0 alone does not hide `outline-style: auto`.
    outlineWidth: 0,
    outlineStyle: 'solid',
  },
  note: {
    minHeight: t.sizes.noteMin,
    borderRadius: t.radii.md,
    borderWidth: t.borders.interactive,
    borderStyle: 'dashed',
    borderColor: t.colors.inputBorder,
    backgroundColor: t.colors.softBg,
  },
  noteFilled: { borderStyle: 'solid' },
  noteFocused: {
    borderStyle: 'solid',
    borderColor: t.colors.inputBorderFocus,
    backgroundColor: t.colors.inputBg,
    boxShadow: `0 0 0 4px ${t.colors.inputRing}`,
  },
  noteInput: {
    ...t.typography.small,
    lineHeight: 21,
    minHeight: t.sizes.noteMin - 2 * t.borders.interactive,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: t.colors.textStrong,
    // No browser focus ring (see `text-field.tsx`): width 0 alone does not hide `outline-style: auto`.
    outlineWidth: 0,
    outlineStyle: 'solid',
  },
  disabled: { opacity: 0.55 },
}));
