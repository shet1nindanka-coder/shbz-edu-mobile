import { useMutation } from '@tanstack/react-query';
import { useRef, useState } from 'react';

import { errorText, hasErrorCode, useApi } from '@/api';
import type { AccountCreateInput, CreatedAccount, ManagedTeacher } from '@/api/types';
import { useRetryWait } from '@/components/retry-wait';
import { generatePasswordFromName } from '@/domain/password-generate';
import { useI18n } from '@/i18n';
import { secureRandomInt, shouldSuggestPassword, type CreatedCredentials } from '@/screens/teacher/students';

import { canSubmitAccountForm, validOwnerId, type AccountRole } from './accounts-logic';

export type CreateAccountFormOptions = {
  /** Teachers of the directory: a student account needs one of them as its owner. */
  teachers: readonly ManagedTeacher[];
  /** The account exists; the caller shows the credentials once (the password is not stored anywhere). */
  onCreated: (account: CreatedAccount, credentials: CreatedCredentials) => void;
  /** `404 teacherNotFound`: the picked owner was deleted meanwhile — the directory must be re-read. */
  onTeacherMissing: () => void;
};

/**
 * State of the "new account" form (docs/spec/04-teacher-students.md S9a, §3.7): a student (with the
 * teacher who owns them) or a teacher; name, login and a password in plain text — the developer passes it
 * on. A readable password built from the surname is offered when the empty field gets focus.
 *
 * The state lives outside the fields so the same form is a sheet on a phone and a panel on a tablet, and
 * the typed values survive closing the sheet by accident. After a success the fields are cleared while the
 * role and the picked teacher stay — accounts are usually created in a row for one teacher.
 */
export function useCreateAccountForm({ teachers, onCreated, onTeacherMissing }: CreateAccountFormOptions) {
  const api = useApi();
  const { dict } = useI18n();
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

  const isStudent = role === 'STUDENT';
  // A teacher deleted since the pick is no longer offered, so the pick is no longer shown either.
  const teacherId = validOwnerId(pickedTeacherId, teachers);
  const values = { role, teacherId, name, login, password };

  // The keyboard's "send" bypasses Button's press guard: one request at a time, set before mutate.
  const inFlight = useRef(false);
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
    onSettled: () => {
      inFlight.current = false;
    },
  });

  const pending = create.isPending;
  const canSubmit = canSubmitAccountForm(values, teachers) && !pending && !limit.waiting;

  const submit = () => {
    if (!canSubmit || inFlight.current) return;
    inFlight.current = true;
    setFormError(null);
    setLoginError(null);
    setTeacherError(null);
    // `teacherId` is read for a student only; the contract types it as a string for both roles.
    create.mutate({ role, teacherId: isStudent ? (teacherId ?? '') : '', name, login, password });
  };

  return {
    teachers,
    role,
    isStudent,
    teacherId,
    name,
    login,
    password,
    suggestion: suggestion && suggestOpen ? suggestion : null,
    formError,
    loginError,
    teacherError,
    limit,
    pending,
    canSubmit,
    submit,
    changeRole: (next: AccountRole) => {
      setRole(next);
      setFormError(null);
    },
    pickTeacher: (next: string) => {
      setPickedTeacherId(next);
      setTeacherError(null);
    },
    changeName: (value: string) => {
      setName(value);
      // The surname changed: the cached suggestion is stale, a new one is built on the next focus.
      setSuggestion(null);
      setSuggestOpen(false);
    },
    changeLogin: (value: string) => {
      setLogin(value);
      setLoginError(null);
    },
    changePassword: (value: string) => {
      setPassword(value);
      setSuggestOpen(false);
    },
    /** The empty password field got the focus: offer a readable password built from the surname. */
    offerSuggestion: () => {
      if (!shouldSuggestPassword(values)) return;
      setSuggestion((current) => current ?? generatePasswordFromName(name, secureRandomInt));
      setSuggestOpen(true);
    },
    pickSuggestion: (value: string) => {
      setPassword(value);
      setSuggestOpen(false);
      setFormError(null);
    },
    anotherSuggestion: () => setSuggestion(generatePasswordFromName(name, secureRandomInt)),
    closeSuggestion: () => setSuggestOpen(false),
  };
}

export type CreateAccountForm = ReturnType<typeof useCreateAccountForm>;
