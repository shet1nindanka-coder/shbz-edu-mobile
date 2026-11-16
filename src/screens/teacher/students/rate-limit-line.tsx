import { format, useI18n } from '@/i18n';
import { formatWait } from '@/screens/shell';
import { Text } from '@/ui';

/** «Повторить можно через 4 минуты.» — shown under an error notice while a rate limit is cooling down. */
export function RateLimitLine({ seconds, testID }: { seconds: number; testID?: string }) {
  const { m, locale } = useI18n();
  if (seconds <= 0) return null;
  return (
    <Text variant="caption" color="textMuted" testID={testID}>
      {format(m.common.errors.retryIn, { time: formatWait(seconds, locale, m.common.errors) })}
    </Text>
  );
}
