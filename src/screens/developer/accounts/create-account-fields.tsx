import { useRef } from 'react';
import { View, type TextInputInstance } from 'react-native';

import { RetryWaitLine } from '@/components/retry-wait';
import { MAX_PASSWORD_LENGTH } from '@/domain/password-policy';
import { MAX_LOGIN_LENGTH, MAX_USER_NAME_LENGTH } from '@/domain/text';
import { useI18n } from '@/i18n';
import { PasswordFeedback, PasswordSuggestion } from '@/screens/teacher/students';
import { makeStyles } from '@/theme';
import { Notice, Segmented, Select, TextField } from '@/ui';

import { teacherOptions, type AccountRole } from './accounts-logic';
import type { CreateAccountForm } from './use-create-account-form';

/**
 * The fields of "New account" (docs/spec/04-teacher-students.md S9a, §3.7): the role switch, the owner
 * teacher of a student, name, login and the password — checked against the policy as it is typed (a field
 * has one name: its label, no sample value inside). The
 * submit button is `CreateAccountSubmit`: the footer of the sheet on a phone, the end of the panel on a
 * tablet.
 */
export function CreateAccountFields({ form }: { form: CreateAccountForm }) {
  const styles = useStyles();
  const { dict, m } = useI18n();
  const t = dict.students.accountForm;
  const fields = dict.students.createForm;
  const loginRef = useRef<TextInputInstance>(null);
  const passwordRef = useRef<TextInputInstance>(null);
  const hasTeachers = form.teachers.length > 0;

  return (
    <View style={styles.form}>
      <Segmented
        options={[
          { value: 'STUDENT', label: t.roleStudent },
          { value: 'TEACHER', label: t.roleTeacher },
        ]}
        value={form.role}
        onChange={(next: AccountRole) => form.changeRole(next)}
        accessibilityLabel={t.roleAria}
        fill
        disabled={form.pending}
        testID="create-account-role"
      />
      {form.isStudent ? (
        <Select
          label={t.ownerTeacher}
          options={teacherOptions(form.teachers)}
          value={form.teacherId}
          onChange={form.pickTeacher}
          placeholder={hasTeachers ? t.selectTeacher : t.createTeacherFirst}
          closeLabel={m.common.actions.close}
          error={form.teacherError}
          disabled={!hasTeachers || form.pending}
          testID="create-account-teacher"
        />
      ) : null}
      <TextField
        label={form.isStudent ? t.nameStudent : t.nameTeacher}
        value={form.name}
        onChangeText={form.changeName}
        autoComplete="name"
        textContentType="name"
        autoCapitalize="words"
        maxLength={MAX_USER_NAME_LENGTH}
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => loginRef.current?.focus()}
        disabled={form.pending}
        testID="create-account-name"
      />
      <TextField
        ref={loginRef}
        label={form.isStudent ? t.loginStudent : t.loginTeacher}
        value={form.login}
        onChangeText={form.changeLogin}
        error={form.loginError}
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
        disabled={form.pending}
        testID="create-account-login"
      />
      <View style={styles.password}>
        <TextField
          ref={passwordRef}
          label={fields.password}
          value={form.password}
          onChangeText={form.changePassword}
          onFocus={form.offerSuggestion}
          // Plain text on purpose (it is dictated or sent on), and nothing may offer to save or fill it.
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          autoComplete="off"
          textContentType="none"
          importantForAutofill="no"
          maxLength={MAX_PASSWORD_LENGTH}
          returnKeyType="done"
          onSubmitEditing={form.submit}
          disabled={form.pending}
          testID="create-account-password"
        />
        <PasswordFeedback password={form.password} okText={fields.passwordOk} testID="create-account-password-feedback" />
        {form.suggestion ? (
          <PasswordSuggestion
            suggestion={form.suggestion}
            onPick={form.pickSuggestion}
            onAnother={form.anotherSuggestion}
            onCustom={form.closeSuggestion}
          />
        ) : null}
      </View>
      {form.formError ? <Notice tone="error" text={form.formError} testID="create-account-error" /> : null}
      {/* Outside the error: editing a field clears the error, the lock stays. */}
      <RetryWaitLine wait={form.limit} testID="create-account-wait" />
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  form: { gap: t.space.md },
  password: { gap: t.space.sm },
}));
