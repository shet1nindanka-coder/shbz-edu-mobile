import { useCallback, useState } from 'react';

import { isRateLimited } from '@/api';
import { format, useI18n } from '@/i18n';
import { formatWait, useCountdown } from '@/screens/shell';
import { Text } from '@/ui';

export type RateLimitWait = {
  /** Seconds until the limited action may be tried again; 0 when nothing is limited. */
  seconds: number;
  waiting: boolean;
  /** Feed every mutation error here: a `429 rateLimited` starts the countdown. */
  note: (error: unknown) => void;
};

/**
 * Keeps a control disabled for `retryAfterSeconds` after a `429 rateLimited` (90-addendum-1 A.3 rule 3).
 * One instance per rate-limit bucket.
 */
export function useRateLimit(): RateLimitWait {
  const [until, setUntil] = useState<number | null>(null);
  const seconds = useCountdown(until);
  const note = useCallback((error: unknown) => {
    if (isRateLimited(error)) setUntil(Date.now() + error.retryAfterSeconds * 1000);
  }, []);
  return { seconds, waiting: seconds > 0, note };
}

/** «Повторить можно через 45 секунд.» — shown under the notice while a limit is cooling down. */
export function RateLimitLine({ seconds, testID }: { seconds: number; testID?: string }) {
  const { m, locale } = useI18n();
  if (seconds <= 0) return null;
  return (
    <Text variant="caption" color="textMuted" testID={testID}>
      {format(m.common.errors.retryIn, { time: formatWait(seconds, locale, m.common.errors) })}
    </Text>
  );
}
