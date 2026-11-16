import { format, useI18n } from '@/i18n';
import { formatWait, useCountdown } from '@/screens/shell';
import { ErrorState } from '@/ui';

import { errorText, retryAfterOf } from './error-text';

/** The part of a query result this component reads. */
type LoadQuery = {
  isError: boolean;
  error: unknown;
  errorUpdatedAt: number;
  fetchStatus: 'fetching' | 'paused' | 'idle';
  refetch: () => unknown;
};

/**
 * A read that has nothing to show and will not get it by waiting: it failed, or it is paused because the
 * device is offline (queries are `offlineFirst` — a skeleton would otherwise stay for as long as the phone
 * is offline).
 */
export function isLoadFailed(query: Pick<LoadQuery, 'isError' | 'fetchStatus'>): boolean {
  return query.isError || query.fetchStatus === 'paused';
}

/**
 * The error state of such a read with "try again". After a `429` the button comes back only when the
 * `retryAfterSeconds` of the answer have passed (90-addendum-1 A.3 rule 3); the wait is counted down.
 */
export function LoadFailure({ query, testID }: { query: LoadQuery; testID?: string }) {
  const { dict, m, locale } = useI18n();
  const wait = query.isError ? retryAfterOf(query.error) : 0;
  const seconds = useCountdown(wait > 0 ? query.errorUpdatedAt + wait * 1000 : null);
  const message = query.isError ? errorText(query.error, dict.shells.errorDescription) : m.common.errors.network;
  const description =
    seconds > 0 ? `${message} ${format(m.common.errors.retryIn, { time: formatWait(seconds, locale, m.common.errors) })}` : message;

  return (
    <ErrorState
      title={dict.shells.errorTitle}
      description={description}
      retryLabel={dict.common.retry}
      onRetry={seconds > 0 ? undefined : () => void query.refetch()}
      retrying={query.fetchStatus === 'fetching'}
      testID={testID}
    />
  );
}
