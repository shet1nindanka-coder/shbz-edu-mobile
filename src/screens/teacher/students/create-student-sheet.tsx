import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { View, type TextInputInstance } from 'react-native';

import { errorText, hasErrorCode, useApi } from '@/api';
import type { StudentCreateInput } from '@/api/types';
import { RetryWaitLine, useRetryWait } from '@/components/retry-wait';
import { generatePasswordFromName } from '@/domain/password-generate';
import { MAX_PASSWORD_LENGTH } from '@/domain/password-policy';
import { MAX_LOGIN_LENGTH, MAX_USER_NAME_LENGTH } from '@/domain/text';
import { useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { BottomSheet, Button, Notice, TextField } from '@/ui';

import { canSubmitStudentForm, shouldSuggestPassword } from './account-form';
import type { CreatedCredentials } from './credentials-sheet';
import { invalidateStudents } from './invalidate-students';
import { PasswordFeedback } from './password-feedback';
import { PasswordSuggestion } from './password-suggestion';
import { secureRandomInt } from './secure-random';

export type CreateStudentSheetProps = {
  visible: boolean;
  onClose: () => void;
  /** The account exists; the caller shows the credentials once (the password is not stored anywhere). */
  onCreated: (credentials: CreatedCredentials) => void;
  /** After the exit animation: the caller opens the credentials sheet only now. */
  onClosed?: () => void;
};

/**
 * "Add a student" (docs/spec/04-teacher-students.md S2a, §3.1): name, login and a password in plain text —
 * the teacher dictates it aloud. The password is checked against the policy as it is typed, and a
 * readable one built from the surname is offered when the empty field gets focus.
 *
 * The typed values survive closing the sheet by accident; they are cleared only after a success.
 */
export function CreateStudentSheet({ visible, onClose, onCreated, onClosed }: CreateStudentSheetProps) {
  const styles = useStyles();
  const api = useApi();
  const queryClient = useQueryClient();
  const { dict, m } = useI18n();
  const t = dict.students.createForm;
  const [name, setName] = useState('');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // `409 exists` is about one field: shown under the login until it is edited.
  const [loginError, setLoginError] = useState<string | null>(null);
  const limit = useRetryWait();
  const loginRef = useRef<TextInputInstance>(null);
  const passwordRef = useRef<TextInputInstance>(null);
  const values = { name, login, password };

  const create = useMutation({
    mutationFn: (input: StudentCreateInput) => api.teacherStudents.createStudent(input),
    onSuccess: ({ student }, input) => {
      setName('');
      setLogin('');
      setPassword('');
      setSuggestion(null);
      setSuggestOpen(false);
      setFormError(null);
      setLoginError(null);
      invalidateStudents(queryClient);
      // Name and login as the server normalised them: exactly what the student will sign in with.
      onCreated({ name: student.name, login: student.email, password: input.password });
    },
    onError: (error) => {
      limit.note(error);
      const text = errorText(error, dict.students.actions.createStudent.save);
      if (hasErrorCode(error, 'exists')) {
        setLoginError(text);
        setFormError(null);
      } else {
        // invalidData, rateLimited, saveFailed, serviceUnavailable, network: the input stays as typed.
        setFormError(text);
      }
    },
  });

  const canSubmit = canSubmitStudentForm(values) && !create.isPending && !limit.waiting;

  const submit = () => {
    if (!canSubmit) return;
    setFormError(null);
    setLoginError(null);
    create.mutate({ name, login, password });
  };

  const close = () => {
    if (!create.isPending) onClose();
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={close}
      onClosed={onClosed}
      closeLabel={m.common.actions.close}
      title={dict.students.list.addStudent}
      dismissible={!create.isPending}
      testID="create-student-sheet"
      footer={
        <Button
          label={create.isPending ? t.creating : t.submit}
          size="lg"
          fullWidth
          loading={create.isPending}
          disabled={!canSubmit}
          onPress={submit}
          testID="create-student-submit"
        />
      }
    >
      <View style={styles.form}>
        <TextField
          label={t.name}
          value={name}
          onChangeText={(value) => {
            setName(value);
            // The surname changed: the cached suggestion is stale, a new one is built on the next focus.
            setSuggestion(null);
            setSuggestOpen(false);
          }}
          placeholder={t.namePlaceholder}
          autoComplete="name"
          textContentType="name"
          autoCapitalize="words"
          maxLength={MAX_USER_NAME_LENGTH}
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => loginRef.current?.focus()}
          disabled={create.isPending}
          testID="create-student-name"
        />
        <TextField
          ref={loginRef}
          label={t.login}
          value={login}
          onChangeText={(value) => {
            setLogin(value);
            setLoginError(null);
          }}
          placeholder={t.loginPlaceholder}
          error={loginError}
          // Any string is a valid login; the e-mail keyboard only puts "@" and "." within reach.
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          autoComplete="off"
          textContentType="none"
          maxLength={MAX_LOGIN_LENGTH}
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => passwordRef.current?.focus()}
          disabled={create.isPending}
          testID="create-student-login"
        />
        <View style={styles.password}>
          <TextField
            ref={passwordRef}
            label={t.password}
            value={password}
            onChangeText={(value) => {
              setPassword(value);
              setSuggestOpen(false);
            }}
            onFocus={() => {
              if (!shouldSuggestPassword(values)) return;
              setSuggestion((current) => current ?? generatePasswordFromName(name, secureRandomInt));
              setSuggestOpen(true);
            }}
            placeholder={t.passwordPlaceholder}
            // Plain text on purpose (the teacher dictates it), and nothing may offer to save or fill it.
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            autoComplete="off"
            textContentType="none"
            importantForAutofill="no"
            maxLength={MAX_PASSWORD_LENGTH}
            returnKeyType="done"
            onSubmitEditing={submit}
            disabled={create.isPending}
            testID="create-student-password"
          />
          <PasswordFeedback password={password} okText={t.passwordOk} testID="create-student-password-feedback" />
          {suggestion && suggestOpen ? (
            <PasswordSuggestion
              suggestion={suggestion}
              onPick={(value) => {
                setPassword(value);
                setSuggestOpen(false);
                setFormError(null);
              }}
              onAnother={() => setSuggestion(generatePasswordFromName(name, secureRandomInt))}
              onCustom={() => setSuggestOpen(false)}
            />
          ) : null}
        </View>
        {formError ? (
          <View style={styles.error}>
            <Notice tone="error" text={formError} testID="create-student-error" />
            <RetryWaitLine seconds={limit.seconds} testID="create-student-wait" />
          </View>
        ) : null}
      </View>
    </BottomSheet>
  );
}

const useStyles = makeStyles((t) => ({
  form: { gap: t.space.field, paddingBottom: t.space.md },
  password: { gap: t.space.sm },
  error: { gap: t.space.xs },
}));
