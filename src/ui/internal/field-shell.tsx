import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme';

import { Text } from '../text';

export type FieldShellProps = {
  /** Label above the control (13/600). */
  label?: string;
  /** Inline error under the control (12/500, red). Replaces `helper` while set. */
  error?: string | null;
  /** Helper text under the control (12.5, kicker colour). */
  helper?: string;
  /** Right-aligned node on the label row (counter, link). */
  labelAside?: ReactNode;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
};

/** Label → control → error/helper stack shared by every form field (label gap 9). */
export function FieldShell({ label, error, helper, labelAside, style, children }: FieldShellProps) {
  const theme = useTheme();
  return (
    <View style={[{ gap: theme.space.sm }, style]}>
      {label || labelAside ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.space.md }}>
          {label ? (
            <Text variant="label" style={{ flexShrink: 1 }}>
              {label}
            </Text>
          ) : (
            <View />
          )}
          {labelAside}
        </View>
      ) : null}
      {children}
      {error ? (
        <Text variant="captionMedium" color="redText" accessibilityRole="alert" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : helper ? (
        <Text variant="hint">{helper}</Text>
      ) : null}
    </View>
  );
}
