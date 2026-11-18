import { useState } from 'react';
import { View } from 'react-native';

import { TextButton } from './text-button';
import { TextField, type TextFieldProps } from './text-field';

export type PasswordFieldProps = Omit<TextFieldProps, 'secureTextEntry' | 'right'> & {
  /** Label of the reveal button, e.g. `dict.login.showPassword`. */
  showLabel: string;
  /** Label of the hide button, e.g. `dict.login.hidePassword`. */
  hideLabel: string;
  /** Spoken name of the reveal button, naming its object (`dict.login.showPasswordAria`); default `showLabel`. */
  showAccessibilityLabel?: string;
  /** Spoken name of the hide button (`dict.login.hidePasswordAria`); default `hideLabel`. */
  hideAccessibilityLabel?: string;
};

/** Password input with the inside-right "Показать / Скрыть" text button. */
export function PasswordField({ showLabel, hideLabel, showAccessibilityLabel, hideAccessibilityLabel, ...props }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  return (
    <TextField
      autoCapitalize="none"
      autoCorrect={false}
      autoComplete="current-password"
      textContentType="password"
      {...props}
      secureTextEntry={!visible}
      right={
        <View style={{ paddingRight: 14, paddingLeft: 4 }}>
          <TextButton
            label={visible ? hideLabel : showLabel}
            accessibilityLabel={visible ? (hideAccessibilityLabel ?? hideLabel) : (showAccessibilityLabel ?? showLabel)}
            tone="soft"
            disabled={props.disabled}
            onPress={() => setVisible((current) => !current)}
          />
        </View>
      }
    />
  );
}
