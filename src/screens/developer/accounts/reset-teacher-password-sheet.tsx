import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';

import { hasErrorCode, useApi } from '@/api';
import { MAX_PASSWORD_LENGTH } from '@/domain/password-policy';
import { format, useI18n } from '@/i18n';
import { canSubmitPassword, errorText, PasswordFeedback, RateLimitLine, useLatched, useRateLimit } from '@/screens/teacher/students';
import { makeStyles } from '@/theme';
import { BottomSheet, Button, Notice, Text, TextField } from '@/ui';

export type ResetTeacherTarget = { id: string; name: string };

export type ResetTeacherPasswordSheetProps = {
  /** The teacher whose password is replaced; `null` closes the sheet. */
  teacher: ResetTeacherTarget | null;
  onClose: () => void;
  /** The password was replaced and every session of the teacher ended. */
  onDone: (teacher: ResetTeacherTarget) => void;
  /** `404 teacherNotFound`: the teacher was deleted meanwhile; `message` is localised. */
  onMissing: (message: string) => void;
};

/**
 * "Reset password" for a teacher (docs/spec/04-teacher-students.md D2 with `target = "teacher"`, §3.9):
 * one visible field with the live policy check. The site redirects to the page with a banner; here the
 * sheet closes in place and the screen shows the notice. A failure that can be retried (invalid, rate
 * limit, save, no connection) stays inside the sheet with the typed password kept.
 */
export function ResetTeacherPasswordSheet({ teacher, onClose, onDone, onMissing }: ResetTeacherPasswordSheetProps) {
  const styles = useStyles();
  const api = useApi();
  const { dict } = useI18n();
  const t = dict.students.passwordReset;
  const notices = dict.students.accounts.notices;
  const shown = useLatched(teacher);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const limit = useRateLimit();

  const reset = useMutation({
    mutationFn: (input: { target: ResetTeacherTarget; password: string }) =>
      api.accounts.resetTeacherPassword(input.target.id, input.password),
    onSuccess: (_result, input) => {
      setPassword('');
      setError(null);
      onDone(input.target);
    },
    onError: (failure) => {
      limit.note(failure);
      const text = errorText(failure, notices.teacherPasswordSave);
      if (hasErrorCode(failure, 'teacherNotFound')) {
        setPassword('');
        setError(null);
        onMissing(text);
        return;
      }
      setError(text);
    },
  });

  const canSubmit = canSubmitPassword(password) && !limit.waiting;

  const submit = () => {
    if (!teacher || !canSubmit || reset.isPending) return;
    setError(null);
    reset.mutate({ target: teacher, password });
  };

  const cancel = () => {
    if (reset.isPending) return;
    setPassword('');
    setError(null);
    onClose();
  };

  return (
    <BottomSheet
      visible={teacher !== null}
      onClose={cancel}
      closeLabel={t.cancel}
      showClose={false}
      dismissible={!reset.isPending}
      testID="reset-teacher-password-sheet"
      footer={
        // The confirm label is long («Сменить пароль»): it gets the room, «Отмена» keeps its own width.
        <View style={styles.actions}>
          <Button label={t.cancel} variant="outline" size="lg" disabled={reset.isPending} onPress={cancel} testID="reset-teacher-password-cancel" />
          <Button
            label={reset.isPending ? t.saving : t.submit}
            size="lg"
            loading={reset.isPending}
            disabled={!canSubmit}
            onPress={submit}
            style={styles.submit}
            testID="reset-teacher-password-submit"
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
            {t.teacher.consequences}
          </Text>
        </View>
        <View style={styles.field}>
          <TextField
            label={t.newPassword}
            value={password}
            onChangeText={setPassword}
            placeholder={t.newPasswordPlaceholder}
            // Plain text on purpose: the developer writes it down and passes it to the teacher.
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
            testID="reset-teacher-password-input"
          />
          <PasswordFeedback password={password} okText={t.passwordOk} testID="reset-teacher-password-feedback" />
        </View>
        {error ? (
          <View style={styles.error}>
            <Notice tone="error" text={error} testID="reset-teacher-password-error" />
            <RateLimitLine seconds={limit.seconds} testID="reset-teacher-password-wait" />
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
