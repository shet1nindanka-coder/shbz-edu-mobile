import { useMutation } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { View } from 'react-native';

import { errorText } from '@/api';
import { RetryWaitLine, useRetryWait } from '@/components/retry-wait';
import { MAX_PASSWORD_LENGTH } from '@/domain/password-policy';
import { format, useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { BottomSheet, Button, Notice, Text, TextField } from '@/ui';

import { canSubmitPassword } from './account-form';
import { PasswordFeedback } from './password-feedback';
import { useLatched } from './use-latched';

export type ResetPasswordTarget = { id: string; name: string };

export type PasswordResetSheetProps = {
  /** The account whose password is replaced; `null` closes the sheet. */
  target: ResetPasswordTarget | null;
  /** Whose account it is: picks the "what happens next" text of `dict.students.passwordReset` (spoken only). */
  audience: 'student' | 'teacher';
  /** The request that replaces the password. */
  reset: (id: string, password: string) => Promise<unknown>;
  /** Shown when a failure carries no text of its own. */
  saveFailedText: string;
  /** The failure means the account no longer exists (`404`): the sheet closes and the caller says so. */
  isGone: (error: unknown) => boolean;
  /** Reads to refresh after the password was replaced. */
  onReplaced?: () => void;
  /** Reads to refresh when the account turned out to be gone. */
  onGone?: () => void;
  onClose: () => void;
  /** The password was replaced and every session of the account ended. */
  onDone: (target: ResetPasswordTarget) => void;
  /** The account no longer exists (or is out of the caller's reach); `message` is localised. */
  onMissing: (message: string) => void;
  /** Prefix of the sheet's testIDs (`<prefix>-sheet`, `-input`, `-submit`, …). */
  testIDPrefix: string;
};

/**
 * "Reset password" of an account (docs/spec/04-teacher-students.md D2, §3.3, §3.9): one visible field with
 * the live policy check, named by the heading «Новый пароль для …» alone — no label, no placeholder; the
 * site's "what happens next" paragraph is the field's accessibility hint (docs/design/glass-over-paper.md
 * §1a). The site redirects to the list with a banner; here the sheet closes in place and the caller shows
 * the notice. A failure that can be retried (invalid, rate limit, save, no connection) stays inside the
 * sheet with the typed password kept.
 *
 * One sheet for both targets: `ResetPasswordSheet` (a teacher's or the developer's student) and the
 * developer's `ResetTeacherPasswordSheet` only bind the request, the texts and the "gone" code.
 */
export function PasswordResetSheet({
  target,
  audience,
  reset: send,
  saveFailedText,
  isGone,
  onReplaced,
  onGone,
  onClose,
  onDone,
  onMissing,
  testIDPrefix,
}: PasswordResetSheetProps) {
  const styles = useStyles();
  const { dict } = useI18n();
  const t = dict.students.passwordReset;
  const shown = useLatched(target);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const limit = useRetryWait();

  // The keyboard's "send" bypasses Button's press guard: one request at a time, set before mutate.
  const inFlight = useRef(false);
  const reset = useMutation({
    mutationFn: (input: { target: ResetPasswordTarget; password: string }) => send(input.target.id, input.password),
    onSuccess: (_result, input) => {
      setPassword('');
      setError(null);
      onReplaced?.();
      onDone(input.target);
    },
    onError: (failure) => {
      limit.note(failure);
      const text = errorText(failure, saveFailedText);
      if (isGone(failure)) {
        setPassword('');
        setError(null);
        onGone?.();
        onMissing(text);
        return;
      }
      setError(text);
    },
    onSettled: () => {
      inFlight.current = false;
    },
  });

  const canSubmit = canSubmitPassword(password) && !limit.waiting;

  const submit = () => {
    if (!target || !canSubmit || inFlight.current) return;
    inFlight.current = true;
    setError(null);
    reset.mutate({ target, password });
  };

  const cancel = () => {
    if (reset.isPending) return;
    setPassword('');
    setError(null);
    onClose();
  };

  return (
    <BottomSheet
      visible={target !== null}
      onClose={cancel}
      closeLabel={t.cancel}
      showClose={false}
      dismissible={!reset.isPending}
      testID={`${testIDPrefix}-sheet`}
      footer={
        // The confirm label is long («Сменить пароль»): it gets the room, «Отмена» keeps its own width.
        <View style={styles.actions}>
          <Button label={t.cancel} variant="outline" size="lg" disabled={reset.isPending} onPress={cancel} testID={`${testIDPrefix}-cancel`} />
          <Button
            label={reset.isPending ? t.saving : t.submit}
            size="lg"
            loading={reset.isPending}
            disabled={!canSubmit}
            onPress={submit}
            style={styles.submit}
            testID={`${testIDPrefix}-submit`}
          />
        </View>
      }
    >
      <View style={styles.content}>
        <Text variant="dialogTitle" accessibilityRole="header">
          {format(t.heading, { name: shown?.name ?? '' })}
        </Text>
        <View style={styles.field}>
          <TextField
            accessibilityLabel={t.newPassword}
            accessibilityHint={t[audience].consequences}
            value={password}
            onChangeText={setPassword}
            // Plain text on purpose: it is written down and passed on to the account's owner.
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            autoComplete="off"
            textContentType="none"
            importantForAutofill="no"
            maxLength={MAX_PASSWORD_LENGTH}
            returnKeyType="done"
            onSubmitEditing={submit}
            disabled={reset.isPending}
            testID={`${testIDPrefix}-input`}
          />
          <PasswordFeedback password={password} okText={t.passwordOk} testID={`${testIDPrefix}-feedback`} />
        </View>
        {error ? <Notice tone="error" text={error} testID={`${testIDPrefix}-error`} /> : null}
        {/* Outside the error: closing the sheet clears the error, the lock stays (it is per user). */}
        <RetryWaitLine wait={limit} testID={`${testIDPrefix}-wait`} />
      </View>
    </BottomSheet>
  );
}

const useStyles = makeStyles((t) => ({
  content: { gap: t.space.field, paddingTop: t.space.xxs, paddingBottom: t.space.md },
  field: { gap: t.space.sm },
  actions: { flexDirection: 'row', gap: t.space.md },
  submit: { flex: 1 },
}));
