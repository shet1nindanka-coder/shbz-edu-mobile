// Pure rules of the "add a student" and "reset password" forms (docs/spec/04-teacher-students.md S2a, D2).
// The same checks run again in the API; these only decide what the form shows and when it may be sent.
// No React, no React Native — unit-tested in tests/teacher-students.test.ts.
import { validatePasswordStrength, type PasswordProblem } from '@/domain/password-policy';

export type StudentFormValues = { name: string; login: string; password: string };

/** The line under a password field: nothing while empty, the first policy problem, or "looks good". */
export type PasswordFeedback = { kind: 'empty' } | { kind: 'ok' } | { kind: 'problem'; problem: PasswordProblem };

export function passwordFeedback(password: string): PasswordFeedback {
  if (password.length === 0) return { kind: 'empty' };
  const problem = validatePasswordStrength(password);
  return problem ? { kind: 'problem', problem } : { kind: 'ok' };
}

/** A password may be sent when it is not empty and passes the policy. */
export function canSubmitPassword(password: string): boolean {
  return passwordFeedback(password).kind === 'ok';
}

/** "Add student" is enabled when name and login are not blank and the password passes the policy. */
export function canSubmitStudentForm(values: StudentFormValues): boolean {
  return values.name.trim().length > 0 && values.login.trim().length > 0 && canSubmitPassword(values.password);
}

/**
 * The password suggestion is offered when the password field is focused while it is still empty and both
 * name and login are filled in — the surname is what the suggestion is built from.
 */
export function shouldSuggestPassword(values: StudentFormValues): boolean {
  return values.password.length === 0 && values.name.trim().length > 0 && values.login.trim().length > 0;
}
