import type { StyleProp, TextStyle } from 'react-native';

import { Text } from '@/ui';

import { useWaitText } from './use-wait-text';

export type RetryWaitLineProps = { seconds: number; testID?: string; style?: StyleProp<TextStyle> };

/** «Повторить можно через 45 секунд.» — shown under a notice while a limit is cooling down; nothing at 0. */
export function RetryWaitLine({ seconds, testID, style }: RetryWaitLineProps) {
  const wait = useWaitText();
  if (seconds <= 0) return null;
  return (
    <Text variant="caption" color="textMuted" testID={testID} style={style}>
      {wait.retryIn(seconds)}
    </Text>
  );
}
