import { useMutation } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { View } from 'react-native';

import { isApiError, isRateLimited, useApi } from '@/api';
import { useCountdown, useWaitText } from '@/components/retry-wait';
import { validatePasswordChangeInput } from '@/domain/account-validation';
import { MAX_PASSWORD_LENGTH, passwordProblemText } from '@/domain/password-policy';
import { useI18n } from '@/i18n';
import { Hint, useSession } from '@/providers';
import { makeStyles } from '@/theme';
import { Button, Notice, SectionCard, Text, TextField } from '@/ui';


type Result = { tone: 'success' | 'error'; text: string } | null;

/**
 * "Change password" (docs/spec/01-shell-auth.md §1.5 item 5, §3.4; 90-addendum-6 §7.2). The three fields
 * are checked in the server's order before the request (shape → mismatch → strength), so a typo does not
 * burn one of the five attempts per 15 minutes. On success every other device is signed out and this one
 * continues on the rotated token. A rate-limit refusal keeps the fields and disables the button for
 * `retryAfterSeconds`.
 */
export function PasswordSection() {
  const styles = useStyles();
  const api = useApi();
  const { dict, m } = useI18n();
  const waitText = useWaitText();
  const t = dict.settings;
  const { applyRotatedToken } = useSession();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [result, setResult] = useState<Result>(null);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const waitSeconds = useCountdown(lockedUntil);
  const locked = waitSeconds > 0;

  // Set before the request and cleared when it settles: `isPending` read in a handler is the last render's
  // value, so a second submit (return key + button) in the same frame would pass it.
  const inFlight = useRef(false);
  const change = useMutation({
    mutationFn: (input: { currentPassword: string; newPassword: string; confirmPassword: string }) =>
      api.shell.changePassword(input),
    onSuccess: async ({ token }) => {
      await applyRotatedToken(token);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setResult({ tone: 'success', text: t.notices.passwordUpdated });
    },
    onError: (error) => {
      // The fields are kept: the user corrects one of them instead of typing all three again.
      setResult({ tone: 'error', text: isApiError(error) ? error.message : m.common.errors.generic });
      if (isRateLimited(error)) setLockedUntil(Date.now() + error.retryAfterSeconds * 1000);
    },
    onSettled: () => {
      inFlight.current = false;
    },
  });

  const submit = () => {
    if (inFlight.current || change.isPending || locked) return;
    const input = { currentPassword, newPassword, confirmPassword };
    const checked = validatePasswordChangeInput(input);
    if (!checked.ok) {
      const text =
        checked.error === 'mismatch'
          ? t.notices.passwordMismatch
          : // The specific problem when the new password itself is the reason, else the site's combined text.
            checked.passwordProblem && currentPassword
            ? passwordProblemText(checked.passwordProblem, dict.passwordPolicy)
            : t.notices.passwordInvalid;
      setResult({ tone: 'error', text });
      return;
    }
    setResult(null);
    inFlight.current = true;
    change.mutate(input);
  };

  return (
    <SectionCard title={t.changePassword}>
      <View style={styles.form}>
        {result ? (
          <View accessibilityLiveRegion="polite">
            <Notice tone={result.tone} text={result.text} testID="settings-password-notice" />
            {locked ? (
              <Text variant="caption" color="textMuted" style={styles.wait} testID="settings-password-wait">
                {waitText.retryIn(waitSeconds)}
              </Text>
            ) : null}
          </View>
        ) : null}
        <TextField
          label={t.currentPassword}
          value={currentPassword}
          onChangeText={setCurrentPassword}
          placeholder={t.currentPasswordPlaceholder}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          autoComplete="current-password"
          textContentType="password"
          maxLength={MAX_PASSWORD_LENGTH}
          testID="settings-current-password"
        />
        <TextField
          label={t.newPassword}
          value={newPassword}
          onChangeText={setNewPassword}
          placeholder={t.newPasswordPlaceholder}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          autoComplete="new-password"
          textContentType="newPassword"
          maxLength={MAX_PASSWORD_LENGTH}
          testID="settings-new-password"
        />
        <TextField
          label={t.repeatPassword}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          placeholder={t.repeatPasswordPlaceholder}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          autoComplete="new-password"
          textContentType="newPassword"
          maxLength={MAX_PASSWORD_LENGTH}
          returnKeyType="done"
          onSubmitEditing={submit}
          testID="settings-repeat-password"
        />
        <View style={styles.actions}>
          <Button
            label={change.isPending ? m.common.states.saving : t.updatePassword}
            onPress={submit}
            loading={change.isPending}
            disabled={locked}
            style={styles.button}
            testID="settings-update-password"
          />
          <Hint>
            <Text variant="hint" style={styles.hint}>
              {t.passwordHint}
            </Text>
          </Hint>
        </View>
      </View>
    </SectionCard>
  );
}

const useStyles = makeStyles((t) => ({
  form: { gap: t.space.field },
  wait: { marginTop: t.space.xs },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: t.space.md },
  button: { alignSelf: 'flex-start' },
  hint: { flexShrink: 1 },
}));
