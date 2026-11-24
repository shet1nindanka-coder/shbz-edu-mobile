import { passwordProblemText } from '@/domain/password-policy';
import { useI18n } from '@/i18n';
import { Text, useAnnounce, useStatusAnnouncement } from '@/ui';

import { passwordFeedback } from './account-form';

export type PasswordFeedbackProps = {
  password: string;
  /** Spoken when the password passes the policy (the two forms word it differently). */
  okText: string;
  testID?: string;
};

/**
 * Live line under a password field (docs/spec/04-teacher-students.md S2a, D2; policy §4.7): the first
 * problem in red. A password that passes shows nothing — the submit button unlocks (docs/design/
 * glass-over-paper.md §1a: limits are said when they are broken) — and a screen reader is told it fits.
 */
export function PasswordFeedback({ password, okText, testID }: PasswordFeedbackProps) {
  const { dict } = useI18n();
  const feedback = passwordFeedback(password);
  // The first problem changes while typing; VoiceOver hears it only when it changes (Android: live region).
  useAnnounce(feedback.kind === 'problem' ? passwordProblemText(feedback.problem, dict.passwordPolicy) : null);
  // Nothing is mounted for a fitting password, so both platforms get an explicit announcement.
  useStatusAnnouncement(feedback.kind === 'ok' ? okText : null);
  if (feedback.kind !== 'problem') return null;
  return (
    <Text variant="captionMedium" color="dangerSolid" accessibilityRole="alert" accessibilityLiveRegion="polite" testID={testID}>
      {passwordProblemText(feedback.problem, dict.passwordPolicy)}
    </Text>
  );
}
