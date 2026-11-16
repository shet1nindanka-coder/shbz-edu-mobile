import { useState } from 'react';
import { View } from 'react-native';

import { TextButton } from './text-button';
import { TextField, type TextFieldProps } from './text-field';

export type PasswordFieldProps = Omit<TextFieldProps, 'secureTextEntry' | 'right'> & {
  /** Label of the reveal button, e.g. `dict.login.showPassword`. */
  showLabel: string;
  /** Label of the hide button, e.g. `dict.login.hidePassword`. */
  hideLabel: string;
};

/** Password input with the inside-right "Показать / Скрыть" text button. */
export function PasswordField({ showLabel, hideLabel, ...props }: PasswordFieldProps) {
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
            tone="soft"
            disabled={props.disabled}
            onPress={() => setVisible((current) => !current)}
          />
        </View>
      }
    />
  );
}
