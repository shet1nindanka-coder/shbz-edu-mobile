import type { StyleProp, ViewStyle } from 'react-native';

import { useI18n } from '@/i18n';
import { Notice } from '@/ui';

import { errorText } from './error-text';

export type RefreshErrorProps = {
  error: unknown;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * A refresh failed while older data is on screen (offline, a 429): the data stays, and this line says why
 * it may be stale.
 */
export function RefreshError({ error, testID, style }: RefreshErrorProps) {
  const { m } = useI18n();
  return <Notice tone="error" text={errorText(error, m.common.errors.generic)} testID={testID} style={style} />;
}
