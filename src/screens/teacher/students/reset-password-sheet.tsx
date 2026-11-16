import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';

import { qk, useApi } from '@/api';
import { MAX_PASSWORD_LENGTH } from '@/domain/password-policy';
import { format, useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { BottomSheet, Button, Notice, Text, TextField } from '@/ui';

import { canSubmitPassword } from './account-form';
import { errorText, isStudentGone } from './error-text';
import { PasswordFeedback } from './password-feedback';
import { RateLimitLine } from './rate-limit-line';
import { useLatched } from './use-latched';
import { useRateLimit } from './use-rate-limit';

export type ResetPasswordTarget = { id: string; name: string };

export type ResetPasswordSheetProps = {
  /** The student whose password is replaced; `null` closes the sheet. */
  student: ResetPasswordTarget | null;
  onClose: () => void;
  /** The password was replaced and every session of the student ended. */
  onDone: (student: ResetPasswordTarget) => void;
  /** `404`: the student no longer exists (or is not this teacher's any more); `message` is localised. */
  onMissing: (message: string) => void;
};

/**
 * "Reset password" for a student (docs/spec/04-teacher-students.md D2, §3.3): one visible field with the
 * live policy check. The site redirects to the list with a banner; here the sheet closes in place and the
 * caller shows the notice. A failure that can be retried (invalid, rate limit, save, no connection) stays
 * inside the sheet with the typed password kept.
 */
export function ResetPasswordSheet({ student, onClose, onDone, onMissing }: ResetPasswordSheetProps) {
  const styles = useStyles();
  const api = useApi();
  const queryClient = useQueryClient();
  const { dict } = useI18n();
  const t = dict.students.passwordReset;
  const notices = dict.students.list.notices;
  const shown = useLatched(student);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const limit = useRateLimit();

  const reset = useMutation({
    mutationFn: (input: { target: ResetPasswordTarget; password: string }) =>
      api.teacherStudents.resetStudentPassword(input.target.id, input.password),
    onSuccess: (_result, input) => {
      setPassword('');
      setError(null);
      onDone(input.target);
    },
    onError: (failure) => {
      limit.note(failure);
      const text = errorText(failure, notices.passwordSave);
      if (isStudentGone(failure)) {
        setPassword('');
        setError(null);
        void queryClient.invalidateQueries({ queryKey: qk('teacherStudents') });
        onMissing(text);
        return;
      }
      setError(text);
    },
  });

  const canSubmit = canSubmitPassword(password) && !limit.waiting;

  const submit = () => {
    if (!student || !canSubmit || reset.isPending) return;
    setError(null);
    reset.mutate({ target: student, password });
  };

  const cancel = () => {
    if (reset.isPending) return;
    setPassword('');
    setError(null);
    onClose();
  };

  return (
    <BottomSheet
      visible={student !== null}
      onClose={cancel}
      closeLabel={t.cancel}
      showClose={false}
      dismissible={!reset.isPending}
      testID="reset-password-sheet"
      footer={
        // The confirm label is long («Сменить пароль»): it gets the room, «Отмена» keeps its own width.
        <View style={styles.actions}>
          <Button label={t.cancel} variant="outline" size="lg" disabled={reset.isPending} onPress={cancel} testID="reset-password-cancel" />
          <Button
            label={reset.isPending ? t.saving : t.submit}
            size="lg"
            loading={reset.isPending}
            disabled={!canSubmit}
            onPress={submit}
            style={styles.submit}
            testID="reset-password-submit"
          />
        </View>
      }
    >
      <View style={styles.content}>
        <View style={styles.intro}>
          <Text variant="kicker">{t.kicker}</Text>
          <Text variant="dialogTitle" accessibilityRole="header">
            {format(t.heading, { name: shown?.name ?? '' })}
          </Text>
          <Text variant="small" color="label" style={styles.paragraph}>
            {t.student.consequences}
          </Text>
        </View>
        <View style={styles.field}>
          <TextField
            label={t.newPassword}
            value={password}
            onChangeText={setPassword}
            placeholder={t.newPasswordPlaceholder}
            // Plain text on purpose: the teacher writes it down and passes it to the student.
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
            testID="reset-password-input"
          />
          <PasswordFeedback password={password} okText={t.passwordOk} testID="reset-password-feedback" />
        </View>
        {error ? (
          <View style={styles.error}>
            <Notice tone="error" text={error} testID="reset-password-error" />
            <RateLimitLine seconds={limit.seconds} testID="reset-password-wait" />
          </View>
        ) : null}
      </View>
    </BottomSheet>
  );
}

const useStyles = makeStyles((t) => ({
  content: { gap: t.space.field, paddingTop: t.space.xxs, paddingBottom: t.space.md },
  intro: { gap: 10 },
  paragraph: { lineHeight: 24 },
  field: { gap: t.space.sm },
  error: { gap: t.space.xs },
  actions: { flexDirection: 'row', gap: t.space.md },
  submit: { flex: 1 },
}));
