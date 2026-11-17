import type { StyleProp, TextStyle } from 'react-native';

import { Text } from '@/ui';

import type { RetryWait } from './use-retry-wait';
import { useWaitText } from './use-wait-text';

export type RetryWaitLineProps = {
  /** The wait of the locked control (`useRetryWait()`); or pass its `seconds`. */
  wait?: Pick<RetryWait, 'seconds'>;
  seconds?: number;
  testID?: string;
  style?: StyleProp<TextStyle>;
};

/**
 * «Повторить можно через 45 секунд.» — the reason a control is disabled by `useRetryWait`, for exactly as
 * long as it is (nothing at 0).
 *
 * Render it NEXT TO THE LOCKED CONTROL, unconditionally — not inside the error notice or the `error ? …`
 * branch: the notice can be dismissed (or cleared by reopening a sheet, switching a topic) while the lock
 * stays, and controls that never showed the error are locked too. Put the line once per locked group of
 * controls (one in a screen header for all cards of a live lesson), and keep the notice for the server's
 * text only, so the countdown is never shown twice.
 *
 *   const wait = useRetryWait();
 *   {error ? <Notice tone="error" text={error} onDismiss={…} /> : null}
 *   <Button disabled={wait.waiting} … />
 *   <RetryWaitLine wait={wait} testID="…-wait" />
 */
export function RetryWaitLine({ wait, seconds, testID, style }: RetryWaitLineProps) {
  const text = useWaitText();
  const left = wait?.seconds ?? seconds ?? 0;
  if (left <= 0) return null;
  return (
    <Text variant="caption" color="textMuted" testID={testID} style={style}>
      {text.retryIn(left)}
    </Text>
  );
}
