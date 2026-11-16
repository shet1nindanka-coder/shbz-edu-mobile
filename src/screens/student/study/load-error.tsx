import type { StyleProp, ViewStyle } from 'react-native';

import { isApiError, isRateLimited } from '@/api';
import { format, useI18n } from '@/i18n';
import { useAppNavigation } from '@/navigation';
import { formatWait, useCountdown } from '@/screens/shell';
import { ErrorState } from '@/ui';

import { errorText } from './error-text';

/** Epoch ms until which a rate-limited call must not be repeated; null for any other failure. */
function retryAt(error: unknown, failedAt: number): number | null {
  if (!isRateLimited(error) || !isApiError(error) || !error.retryAfterSeconds) return null;
  return failedAt + error.retryAfterSeconds * 1000;
}

export type LoadErrorProps = {
  error: unknown;
  /** When the call failed (`query.errorUpdatedAt`) — the start of a rate-limit wait. */
  failedAt: number;
  onRetry: () => void;
  retrying?: boolean;
  /** Offer «На главную» next to the retry button (every screen but the overview itself). */
  home?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * The section error shell (02 "Error: dashboard error boundary"): the site's title, the server's text,
 * «Попробовать снова» and «На главную». A rate-limited read hides the retry button until the wait is over.
 * SPEC-GAP: the site has no rate limit on these reads (they are server-rendered); the wait line follows
 * the app-wide rule for `retryAfterSeconds` (90-addendum-1 A.3).
 */
export function LoadError({ error, failedAt, onRetry, retrying = false, home = false, testID, style }: LoadErrorProps) {
  const { dict, m, locale } = useI18n();
  const navigation = useAppNavigation();
  const wait = useCountdown(retryAt(error, failedAt));
  const message = errorText(error, dict.shells.errorDescription);
  const description = wait > 0 ? `${message} ${format(m.common.errors.retryIn, { time: formatWait(wait, locale, m.common.errors) })}` : message;
  return (
    <ErrorState
      title={dict.shells.errorTitle}
      description={description}
      retryLabel={dict.common.retry}
      onRetry={wait > 0 ? undefined : onRetry}
      retrying={retrying}
      secondaryLabel={dict.common.home}
      onSecondary={home ? navigation.goHome : undefined}
      testID={testID}
      style={style}
    />
  );
}
