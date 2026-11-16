import type { UseQueryResult } from '@tanstack/react-query';

import { useI18n } from '@/i18n';
import { ErrorState } from '@/ui';

import { errorText } from './error-text';

type LoadQuery = Pick<UseQueryResult<unknown>, 'isError' | 'error' | 'fetchStatus' | 'refetch'>;

/**
 * A read that has nothing to show and is not going to get it by waiting: it failed, or it is paused
 * because the device is offline (queries are `offlineFirst` — the retry waits for the connection, which
 * would otherwise leave a skeleton on screen for as long as the phone is offline).
 */
export function isLoadFailed(query: Pick<LoadQuery, 'isError' | 'fetchStatus'>): boolean {
  return query.isError || query.fetchStatus === 'paused';
}

/** The error state of such a read, with "try again". */
export function LoadFailure({ query, testID }: { query: LoadQuery; testID?: string }) {
  const { dict, m } = useI18n();
  return (
    <ErrorState
      title={dict.shells.errorTitle}
      description={query.isError ? errorText(query.error, dict.shells.errorDescription) : m.common.errors.network}
      retryLabel={dict.common.retry}
      onRetry={() => void query.refetch()}
      retrying={query.fetchStatus === 'fetching'}
      testID={testID}
    />
  );
}
