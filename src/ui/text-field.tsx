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

import { withErrorHint } from './a11y';
import { FieldShell } from './internal/field-shell';
import { InputFrame } from './internal/input-frame';
import { MAX_FONT_SCALE } from './text';

export type TextFieldProps = Omit<TextInputProps, 'style' | 'editable'> & {
  label?: string;
  /** Inline error under the field. */
  error?: string | null;
  helper?: string;
  disabled?: boolean;
  /** Node inside the field on the left (icon). The field insets it; pass the bare icon. */
  left?: ReactNode;
  /** Node inside the field on the right (text button, icon). */
  right?: ReactNode;
  /** Right-aligned node on the label row. */
  labelAside?: ReactNode;
  /** `md` 44 (default) · `lg` 52 — the login form. */
  size?: 'md' | 'lg';
  ref?: Ref<TextInputInstance>;
  containerStyle?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
};

/**
 * Single-line input (`.inp`): 44 high (52 on the login form), 15 / 500 text, radius 12, 1.5 outline; the
 * focused state is the gradient border. `accessibilityLabel` defaults to `label`.
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
  size = 'md',
  onFocus,
  onBlur,
  accessibilityLabel,
  accessibilityHint,
  ...inputProps
}: TextFieldProps) {
  const theme = useTheme();
  const styles = useStyles();
  const [focused, setFocused] = useState(false);

  return (
    <FieldShell label={label} error={error} helper={helper} labelAside={labelAside} style={containerStyle}>
      <InputFrame focused={focused} disabled={disabled} height={size === 'lg' ? theme.sizes.fieldLg : theme.sizes.field}>
        {left ? <View style={styles.left}>{left}</View> : null}
        <TextInput
          ref={ref}
          accessibilityLabel={accessibilityLabel ?? label}
          // The inline error belongs to the field: focusing it after a refused submit reads it.
          accessibilityHint={withErrorHint(error, accessibilityHint)}
          accessibilityState={{ disabled }}
          placeholderTextColor={theme.colors.placeholder}
          selectionColor={theme.colors.accentSolid}
          cursorColor={theme.colors.accentSolid}
          keyboardAppearance={theme.dark ? 'dark' : 'light'}
          // Same cap as `Text`: the frame has a fixed height, and the label next to it stops at 1.3 too.
          maxFontSizeMultiplier={MAX_FONT_SCALE}
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
          style={[styles.input, size === 'lg' ? styles.inputLg : null, left ? styles.withLeft : null, right ? styles.withRight : null, inputStyle]}
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
    paddingHorizontal: t.space.md,
    paddingVertical: 0,
    color: t.colors.textStrong,
    // The browser's own focus outline would double the gradient border on web. Chromium paints
    // `outline-style: auto` (its default ring) even at width 0; a solid outline of width 0 paints nothing.
    outlineWidth: 0,
    outlineStyle: 'solid',
  },
  // The slot is inset like the text of a field without an icon; the icon never sits on the border.
  inputLg: { paddingHorizontal: t.space.lg },
  left: { paddingLeft: t.space.md },
  withLeft: { paddingLeft: t.space.sm },
  withRight: { paddingRight: t.space.sm },
}));
