import { useState, type ReactNode, type Ref } from 'react';
import {
  TextInput,
  type StyleProp,
  type TextInputInstance,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { makeStyles, useTheme } from '@/theme';

import { FieldShell } from './internal/field-shell';
import { InputFrame } from './internal/input-frame';

export type TextFieldProps = Omit<TextInputProps, 'style' | 'editable'> & {
  label?: string;
  /** Inline error under the field. */
  error?: string | null;
  helper?: string;
  disabled?: boolean;
  /** Node inside the field on the left (icon). */
  left?: ReactNode;
  /** Node inside the field on the right (text button, icon). */
  right?: ReactNode;
  /** Right-aligned node on the label row. */
  labelAside?: ReactNode;
  ref?: Ref<TextInputInstance>;
  containerStyle?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
};

/**
 * Single-line input (`.shbz-input`): 52 high, 16px text (iOS zooms below 16), radius 12; the focused
 * state is the gradient border. `accessibilityLabel` defaults to `label`.
 */
export function TextField({
  label,
  error,
  helper,
  disabled = false,
  left,
  right,
  labelAside,
  ref,
  containerStyle,
  inputStyle,
  onFocus,
  onBlur,
  accessibilityLabel,
  ...inputProps
}: TextFieldProps) {
  const theme = useTheme();
  const styles = useStyles();
  const [focused, setFocused] = useState(false);

  return (
    <FieldShell label={label} error={error} helper={helper} labelAside={labelAside} style={containerStyle}>
      <InputFrame focused={focused} disabled={disabled} height={theme.sizes.field}>
        {left}
        <TextInput
          ref={ref}
          accessibilityLabel={accessibilityLabel ?? label}
          accessibilityState={{ disabled }}
          placeholderTextColor={theme.colors.placeholder}
          selectionColor={theme.colors.accentSolid}
          cursorColor={theme.colors.accentSolid}
          keyboardAppearance={theme.dark ? 'dark' : 'light'}
          {...inputProps}
          editable={!disabled}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          style={[styles.input, left ? styles.withLeft : null, right ? styles.withRight : null, inputStyle]}
        />
        {right}
      </InputFrame>
    </FieldShell>
  );
}

const useStyles = makeStyles((t) => ({
  input: {
    ...t.typography.input,
    flex: 1,
    minWidth: 0,
    alignSelf: 'stretch',
    paddingHorizontal: 16,
    paddingVertical: 0,
    color: t.colors.textStrong,
    // The browser's own focus outline would double the gradient border on web. Chromium paints
    // `outline-style: auto` (its default ring) even at width 0; a solid outline of width 0 paints nothing.
    outlineWidth: 0,
    outlineStyle: 'solid',
  },
  withLeft: { paddingLeft: 10 },
  withRight: { paddingRight: 8 },
}));
