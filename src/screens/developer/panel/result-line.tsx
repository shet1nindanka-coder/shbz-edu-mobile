import { format, useI18n } from '@/i18n';
import { formatWait } from '@/screens/shell';
import { Text } from '@/ui';

/** Outcome of a panel call: the server's `{ ok, message }`, or a failed request shown the same way. */
export type PanelResult = { ok: boolean; message: string };

export type ResultLineProps = {
  /** Shown while the call is running. */
  pendingText?: string | null;
  result: PanelResult | null;
  /** Seconds of a rate-limit wait; appended to the message while it counts down. */
  waitSeconds?: number;
  testID?: string;
};

/**
 * The line under a panel button (07 §1.9): the action's message in green (`ok`) or red, announced to
 * screen readers. Renders nothing when there is neither a pending text nor a result — the caller shows its
 * hint then.
 */
export function ResultLine({ pendingText, result, waitSeconds = 0, testID }: ResultLineProps) {
  const { m, locale } = useI18n();
  if (pendingText) {
    return (
      <Text variant="caption" color="textMuted" accessibilityLiveRegion="polite" testID={testID}>
        {pendingText}
      </Text>
    );
  }
  if (!result) return null;
  const wait = waitSeconds > 0 ? ` ${format(m.common.errors.retryIn, { time: formatWait(waitSeconds, locale, m.common.errors) })}` : '';
  return (
    <Text
      variant="captionMedium"
      color={result.ok ? 'greenText' : 'dangerText'}
      accessibilityRole={result.ok ? undefined : 'alert'}
      accessibilityLiveRegion="polite"
      testID={testID}
    >
      {result.message + wait}
    </Text>
  );
}
