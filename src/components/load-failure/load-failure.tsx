import { useMemo } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

import { errorText, retryAfterOf } from '@/api/errors';
import { useI18n } from '@/i18n';
import { useAppNavigation } from '@/navigation';
import { ErrorState } from '@/ui';

import { useWaitClock, useWaitText } from '../retry-wait';

import type { LoadQueryState } from './load-state';

/** The part of a query result `LoadFailure` reads in its `query` form. */
export type LoadFailureQuery = LoadQueryState & { errorUpdatedAt: number; refetch: () => unknown };

type Common = {
  /** Offer «На главную» next to the retry button. */
  home?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

export type LoadFailureProps =
  /** The usual form: everything is read from the query. */
  | (Common & { query: LoadFailureQuery })
  /** For a read that is not one query (several queries behind one shell, a custom refresh). */
  | (Common & {
      error: unknown;
      /** When the call failed (`query.errorUpdatedAt`) — the start of a `retryAfterSeconds` wait. */
      failedAt?: number;
      onRetry: () => void;
      retrying?: boolean;
    });

/**
 * The first-load error shell of every section (docs/spec/08-design-system.md §9.4): the site's title, the
 * server's text (the network text when the read is parked offline) and «Попробовать снова». One behaviour
 * for all areas:
 *
 * - after an answer that names `retryAfterSeconds` the retry button comes back only when the wait is over,
 *   and the wait is counted down in the text (90-addendum-1 A.3 rule 3);
 * - `home` adds «На главную».
 *
 *   {data ? … : isLoadFailed(query) ? <LoadFailure query={query} testID="…-error" /> : <LoadingState … />}
 */
export function LoadFailure(props: LoadFailureProps) {
  const { dict, m } = useI18n();
  const navigation = useAppNavigation();
  const waitText = useWaitText();

  const fromQuery = 'query' in props;
  const failure = fromQuery ? (props.query.isError ? props.query.error : (props.query.failureReason ?? null)) : props.error;
  const failedAt = fromQuery ? (props.query.isError ? props.query.errorUpdatedAt : 0) : (props.failedAt ?? 0);
  const retrying = fromQuery ? props.query.fetchStatus === 'fetching' : (props.retrying ?? false);
  const retry = fromQuery ? () => void props.query.refetch() : props.onRetry;

  const wait = failedAt > 0 ? retryAfterOf(failure) : 0;
  // A duration from the failure, not a deadline on the device clock (a clock set back must not lengthen it).
  const waitStart = useMemo(() => (wait > 0 ? { seconds: wait, at: failedAt } : null), [wait, failedAt]);
  const seconds = useWaitClock(waitStart);
  // A parked read has no error of its own: say what is wrong (no connection).
  const parked = fromQuery && !props.query.isError;
  const message = errorText(failure, parked ? m.common.errors.network : dict.shells.errorDescription);

  return (
    <ErrorState
      title={dict.shells.errorTitle}
      description={seconds > 0 ? `${message} ${waitText.retryIn(seconds)}` : message}
      // Spoken once (iOS), not again at every tick of the countdown.
      announcement={`${dict.shells.errorTitle}. ${message}`}
      retryLabel={dict.common.retry}
      onRetry={seconds > 0 ? undefined : retry}
      retrying={retrying}
      secondaryLabel={dict.common.home}
      onSecondary={props.home ? navigation.goHome : undefined}
      testID={props.testID}
      style={props.style}
    />
  );
}
