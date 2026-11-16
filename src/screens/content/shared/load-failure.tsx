import type { UseQueryResult } from '@tanstack/react-query';

import { useI18n } from '@/i18n';
import { ErrorState } from '@/ui';

import { errorText } from './error-text';

/**
 * Why a screen without data cannot show any: the query failed, or — offline — its retry is parked until
 * the connection returns (the query stays `pending`, which would otherwise be an endless skeleton).
 * `undefined` while the first load is simply running.
 */
export function loadFailureOf(query: Pick<UseQueryResult<unknown, unknown>, 'isError' | 'isPaused' | 'error' | 'failureReason'>): { error: unknown } | undefined {
  if (query.isError) return { error: query.error };
  if (query.isPaused) return { error: query.failureReason };
  return undefined;
}

export type LoadFailureProps = {
  /** The failure from `loadFailureOf`. */
  error: unknown;
  onRetry: () => void;
  retrying: boolean;
  testID?: string;
};

/** The section's error shell (docs/spec/08-design-system.md §9.4): title, the server's text, «Попробовать снова». */
export function LoadFailure({ error, onRetry, retrying, testID }: LoadFailureProps) {
  const { dict } = useI18n();
  return (
    <ErrorState
      title={dict.shells.errorTitle}
      description={errorText(error, dict.shells.errorDescription)}
      retryLabel={dict.common.retry}
      onRetry={onRetry}
      retrying={retrying}
      testID={testID}
    />
  );
}
