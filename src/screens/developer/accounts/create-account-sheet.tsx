import { useMutation } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { View, type TextInputInstance } from 'react-native';

import { errorText, hasErrorCode, useApi } from '@/api';
import type { AccountCreateInput, CreatedAccount, ManagedTeacher } from '@/api/types';
import { RetryWaitLine, useRetryWait } from '@/components/retry-wait';
import { generatePasswordFromName } from '@/domain/password-generate';
import { MAX_PASSWORD_LENGTH } from '@/domain/password-policy';
import { MAX_LOGIN_LENGTH, MAX_USER_NAME_LENGTH } from '@/domain/text';
import { useI18n } from '@/i18n';
import {
  PasswordFeedback,
  PasswordSuggestion,
  secureRandomInt,
  shouldSuggestPassword,
  type CreatedCredentials,
} from '@/screens/teacher/students';
import { makeStyles } from '@/theme';
import { BottomSheet, Button, Notice, Segmented, Select, TextField } from '@/ui';

import { canSubmitAccountForm, teacherOptions, validOwnerId, type AccountRole } from './accounts-logic';

export type CreateAccountSheetProps = {
  visible: boolean;
  /** Teachers of the directory: a student account needs one of them as its owner. */
  teachers: readonly ManagedTeacher[];
  onClose: () => void;
  /** The account exists; the caller shows the credentials once (the password is not stored anywhere). */
  onCreated: (account: CreatedAccount, credentials: CreatedCredentials) => void;
  /** `404 teacherNotFound`: the picked owner was deleted meanwhile — the directory must be re-read. */
  onTeacherMissing: () => void;
  /** After the exit animation: the caller opens the credentials sheet only now. */
  onClosed?: () => void;
};

/**
 * "New account" (docs/spec/04-teacher-students.md S9a, §3.7): a student (with the teacher who owns them)
 * or a teacher. Name, login and a password in plain text — the developer passes it on. The password is
 * checked against the policy as it is typed, and a readable one built from the surname is offered when
 * the empty field gets focus.
 *
 * The typed values survive closing the sheet by accident; after a success the fields are cleared while the
 * role and the picked teacher stay — accounts are usually created in a row for one teacher.
 */
export function CreateAccountSheet({ visible, teachers, onClose, onCreated, onTeacherMissing, onClosed }: CreateAccountSheetProps) {
  const styles = useStyles();
  const api = useApi();
  const { dict, m } = useI18n();
  const t = dict.students.accountForm;
  const fields = dict.students.createForm;
  const [role, setRole] = useState<AccountRole>('STUDENT');
  const [pickedTeacherId, setPickedTeacherId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // `409 exists` is about one field: shown under the login until it is edited.
  const [loginError, setLoginError] = useState<string | null>(null);
  // `404 teacherNotFound`: shown under the owner picker until another teacher is picked.
  const [teacherError, setTeacherError] = useState<string | null>(null);
  const limit = useRetryWait();
  const loginRef = useRef<TextInputInstance>(null);
  const passwordRef = useRef<TextInputInstance>(null);

  const isStudent = role === 'STUDENT';
  const hasTeachers = teachers.length > 0;
  // A teacher deleted since the pick is no longer offered, so the pick is no longer shown either.
  const teacherId = validOwnerId(pickedTeacherId, teachers);
  const values = { role, teacherId, name, login, password };

  const create = useMutation({
    mutationFn: (input: AccountCreateInput) => api.accounts.createAccount(input),
    onSuccess: ({ account }, input) => {
      setName('');
      setLogin('');
      setPassword('');
      setSuggestion(null);
      setSuggestOpen(false);
      setFormError(null);
      setLoginError(null);
      setTeacherError(null);
      // Name and login as the server normalised them: exactly what the person will sign in with.
      onCreated(account, { name: account.name, login: account.email, password: input.password });
    },
    onError: (error) => {
      limit.note(error);
      const text = errorText(error, dict.students.actions.createAccount.save);
      if (hasErrorCode(error, 'exists')) {
        setLoginError(text);
        setFormError(null);
      } else if (hasErrorCode(error, 'teacherNotFound')) {
        setTeacherError(text);
        setFormError(null);
        onTeacherMissing();
      } else {
        // invalidData, rateLimited, saveFailed, serviceUnavailable, network: the input stays as typed.
        setFormError(text);
      }
    },
  });

  const canSubmit = canSubmitAccountForm(values, teachers) && !create.isPending && !limit.waiting;

  const submit = () => {
    if (!canSubmit) return;
    setFormError(null);
    setLoginError(null);
    setTeacherError(null);
    // `teacherId` is read for a student only; the contract types it as a string for both roles.
    create.mutate({ role, teacherId: isStudent ? (teacherId ?? '') : '', name, login, password });
  };

  const close = () => {
    if (!create.isPending) onClose();
  };

  const submitLabel = isStudent ? t.createStudent : t.createTeacher;

  return (
    <BottomSheet
      visible={visible}
      onClose={close}
      onClosed={onClosed}
      closeLabel={m.common.actions.close}
      title={dict.students.accounts.newAccount}
      dismissible={!create.isPending}
      testID="create-account-sheet"
      footer={
        <Button
          label={create.isPending ? t.creating : submitLabel}
          size="lg"
          fullWidth
          loading={create.isPending}
          disabled={!canSubmit}
          onPress={submit}
          testID="create-account-submit"
        />
      }
    >
      <View style={styles.form}>
        <Segmented
          options={[
            { value: 'STUDENT', label: t.roleStudent },
            { value: 'TEACHER', label: t.roleTeacher },
          ]}
          value={role}
          onChange={(next: AccountRole) => {
            setRole(next);
            setFormError(null);
          }}
          accessibilityLabel={t.roleAria}
          fill
          disabled={create.isPending}
          testID="create-account-role"
        />
        {isStudent ? (
          <Select
            label={t.ownerTeacher}
            options={teacherOptions(teachers)}
            value={teacherId}
            onChange={(next) => {
              setPickedTeacherId(next);
              setTeacherError(null);
            }}
            placeholder={hasTeachers ? t.selectTeacher : t.createTeacherFirst}
            closeLabel={m.common.actions.close}
            error={teacherError}
            disabled={!hasTeachers || create.isPending}
            testID="create-account-teacher"
          />
        ) : null}
        <TextField
          label={isStudent ? t.nameStudent : t.nameTeacher}
          value={name}
          onChangeText={(value) => {
            setName(value);
            // The surname changed: the cached suggestion is stale, a new one is built on the next focus.
            setSuggestion(null);
            setSuggestOpen(false);
          }}
          placeholder={fields.namePlaceholder}
          autoComplete="name"
          textContentType="name"
          autoCapitalize="words"
          maxLength={MAX_USER_NAME_LENGTH}
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => loginRef.current?.focus()}
          disabled={create.isPending}
          testID="create-account-name"
        />
        <TextField
          ref={loginRef}
          label={isStudent ? t.loginStudent : t.loginTeacher}
          value={login}
          onChangeText={(value) => {
            setLogin(value);
            setLoginError(null);
          }}
          placeholder={fields.loginPlaceholder}
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
          testID="create-account-login"
        />
        <View style={styles.password}>
          <TextField
            ref={passwordRef}
            label={fields.password}
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
            placeholder={fields.passwordPlaceholder}
            // Plain text on purpose (it is dictated or sent on), and nothing may offer to save or fill it.
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
            testID="create-account-password"
          />
          <PasswordFeedback password={password} okText={fields.passwordOk} testID="create-account-password-feedback" />
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
            <Notice tone="error" text={formError} testID="create-account-error" />
            <RetryWaitLine seconds={limit.seconds} testID="create-account-wait" />
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
