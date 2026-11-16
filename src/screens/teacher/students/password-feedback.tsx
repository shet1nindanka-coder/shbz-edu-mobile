import { passwordProblemText } from '@/domain/password-policy';
import { useI18n } from '@/i18n';
import { Text } from '@/ui';

import { passwordFeedback } from './account-form';

export type PasswordFeedbackProps = {
  password: string;
  /** Green line for a password that passes the policy (the two forms word it differently). */
  okText: string;
  testID?: string;
};

/**
 * Live line under a password field (docs/spec/04-teacher-students.md S2a, D2; policy §4.7): the first
 * problem in red, otherwise — for a non-empty value — the "looks good" line in green.
 */
export function PasswordFeedback({ password, okText, testID }: PasswordFeedbackProps) {
  const { dict } = useI18n();
  const feedback = passwordFeedback(password);
  if (feedback.kind === 'empty') return null;
  if (feedback.kind === 'problem') {
    return (
      <Text variant="captionMedium" color="dangerSolid" accessibilityRole="alert" accessibilityLiveRegion="polite" testID={testID}>
        {passwordProblemText(feedback.problem, dict.passwordPolicy)}
      </Text>
    );
  }
  return (
    <Text variant="captionMedium" color="greenText" accessibilityLiveRegion="polite" testID={testID}>
      {okText}
    </Text>
  );
}
