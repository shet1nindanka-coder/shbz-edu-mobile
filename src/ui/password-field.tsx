import { useState } from 'react';
import { View } from 'react-native';

import { makeStyles, useTheme } from '@/theme';

import { Icon } from './icon';
import { PressableScale } from './internal/pressable-scale';
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

/** Password input with an eye inside it on the right: the words «Показать / Скрыть» are its spoken name. */
export function PasswordField({ showLabel, hideLabel, showAccessibilityLabel, hideAccessibilityLabel, ...props }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const theme = useTheme();
  const styles = useStyles();
  return (
    <TextField
      autoCapitalize="none"
      autoCorrect={false}
      autoComplete="current-password"
      textContentType="password"
      {...props}
      secureTextEntry={!visible}
      right={
        <View style={styles.right}>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={visible ? (hideAccessibilityLabel ?? hideLabel) : (showAccessibilityLabel ?? showLabel)}
            accessibilityState={{ disabled: Boolean(props.disabled) }}
            disabled={props.disabled}
            hitSlop={12}
            onPress={() => setVisible((current) => !current)}
            style={styles.eye}
          >
            <Icon name={visible ? 'eyeOff' : 'eye'} size={theme.sizes.icon.md} color="textMuted" />
          </PressableScale>
        </View>
      }
    />
  );
}

const useStyles = makeStyles((t) => ({
  right: { paddingRight: t.space.md, paddingLeft: t.space.xxs },
  eye: { width: t.sizes.icon.lg, height: t.sizes.icon.lg, alignItems: 'center', justifyContent: 'center' },
}));
