import { Platform } from 'react-native';

import { Text, useStatusAnnouncement } from '@/ui';

/** Outcome of a panel call: the server's `{ ok, message }`, or a failed request shown the same way. */
export type PanelResult = { ok: boolean; message: string };

export type ResultLineProps = {
  /** Shown while the call is running. */
  pendingText?: string | null;
  result: PanelResult | null;
  testID?: string;
};

/**
 * The line under a panel button (07 §1.9): the action's message in green (`ok`) or red, announced to
 * screen readers. Renders nothing when there is neither a pending text nor a result — the caller shows its
 * hint then.
 */
export function ResultLine({ pendingText, result, testID }: ResultLineProps) {
  // The outcome appears under the button without moving the focus: spoken on both platforms. A live region
  // would not do on Android: the line is often mounted with its text (nothing pending before it), and a
  // freshly attached region stays silent.
  useStatusAnnouncement(pendingText ? null : result?.message);
  if (pendingText) {
    return (
      <Text variant="caption" color="textMuted" accessibilityLiveRegion="polite" testID={testID}>
        {pendingText}
      </Text>
    );
  }
  if (!result) return null;
  return (
    <Text
      variant="captionMedium"
      color={result.ok ? 'greenText' : 'dangerText'}
      accessibilityRole={result.ok ? undefined : 'alert'}
      // The browser has no announcement API here: its live region speaks a success line (an error also has
      // role="alert"). On a device the hook above speaks it once.
      accessibilityLiveRegion={Platform.OS === 'web' ? 'polite' : undefined}
      testID={testID}
    >
      {result.message}
    </Text>
  );
}
