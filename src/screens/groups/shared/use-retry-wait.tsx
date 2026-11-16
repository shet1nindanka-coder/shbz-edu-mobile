import { useCallback, useState } from 'react';

import { format, useI18n } from '@/i18n';
import { formatWait, useCountdown } from '@/screens/shell';
import { Text } from '@/ui';

import { retryAfterOf } from './error-text';

export type RetryWait = {
  /** Seconds until the refused action may be tried again; 0 when nothing is cooling down. */
  seconds: number;
  waiting: boolean;
  /** Feed every mutation error here: one that carries `retryAfterSeconds` starts the countdown. */
  note: (error: unknown) => void;
};

/**
 * Keeps a control disabled for `retryAfterSeconds` after a refusal that names a wait (90-addendum-1 A.3
 * rule 3): never retry on the user's behalf, just say when it will work again. One instance per bucket.
 */
export function useRetryWait(): RetryWait {
  const [until, setUntil] = useState<number | null>(null);
  const seconds = useCountdown(until);
  const note = useCallback((error: unknown) => {
    const wait = retryAfterOf(error);
    if (wait > 0) setUntil(Date.now() + wait * 1000);
  }, []);
  return { seconds, waiting: seconds > 0, note };
}

/** «Повторить можно через 45 секунд.» — shown under the notice while a limit is cooling down. */
export function RetryWaitLine({ seconds, testID }: { seconds: number; testID?: string }) {
  const { m, locale } = useI18n();
  if (seconds <= 0) return null;
  return (
    <Text variant="caption" color="textMuted" testID={testID}>
      {format(m.common.errors.retryIn, { time: formatWait(seconds, locale, m.common.errors) })}
    </Text>
  );
}
