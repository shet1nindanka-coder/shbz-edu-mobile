// Input rules of the account forms (login, create account, profile name, change password).
//
// [MOBILE] On the site these checks sit inline at the top of the server actions (actions/auth.ts,
// actions/student.ts, actions/account.ts, actions/profile.ts). They are lifted here unchanged so the forms
// and the mock API apply one set of rules: same normalisation, same limits, same order of checks.
import { UserRole } from "./enums";
import { MAX_PASSWORD_LENGTH, validatePasswordStrength, type PasswordProblem } from "./password-policy";
import { MAX_LOGIN_LENGTH, MAX_USER_NAME_LENGTH, normalizeLoginInput, normalizeSingleLineText } from "./text";

/** Minimum length (after trimming) the change-password form requires before it even compares the fields. */
export const MIN_PASSWORD_LENGTH = 8;

export type LoginInputResult = { ok: true; login: string; password: string } | { ok: false; error: "empty" };

/**
 * Sign-in form (`loginAction`): the login is normalised (single line, lower case), the password is taken
 * as typed. An empty or overlong field is the site's `?error=empty`.
 */
export function validateLoginInput(loginRaw: string, password: string): LoginInputResult {
  const login = normalizeLoginInput(loginRaw);

  if (!login || !password || login.length > MAX_LOGIN_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
    return { ok: false, error: "empty" };
  }

  return { ok: true, login, password };
}

/** Display name (`updateProfileInfoAction`): normalised to one line, 1..120 characters; `null` if invalid. */
export function normalizeUserName(nameRaw: string): string | null {
  const name = normalizeSingleLineText(nameRaw);

  return !name || name.length > MAX_USER_NAME_LENGTH ? null : name;
}

export type NewAccountInput = {
  name: string;
  login: string;
  password: string;
};

export type NewAccountResult =
  | { ok: true; name: string; login: string; password: string }
  /** `passwordProblem` tells the form which hint to show; the site answers one generic "invalid" text. */
  | { ok: false; error: "invalid"; passwordProblem: PasswordProblem | null };

/** New student created by a teacher (`createStudentAction`). */
export function validateNewAccountInput(input: NewAccountInput): NewAccountResult {
  const name = normalizeSingleLineText(input.name);
  const login = normalizeLoginInput(input.login);
  const passwordProblem = validatePasswordStrength(input.password);

  if (
    !name ||
    name.length > MAX_USER_NAME_LENGTH ||
    !login ||
    login.length > MAX_LOGIN_LENGTH ||
    input.password.length > MAX_PASSWORD_LENGTH ||
    passwordProblem !== null
  ) {
    return { ok: false, error: "invalid", passwordProblem };
  }

  return { ok: true, name, login, password: input.password };
}

export type DeveloperAccountResult =
  | { ok: true; role: "TEACHER" | "STUDENT"; teacherId: string | null; name: string; login: string; password: string }
  | { ok: false; error: "invalid"; passwordProblem: PasswordProblem | null };

/**
 * Account created by the developer (`createAccountAction`): the role is TEACHER or STUDENT only, and a
 * student must be attached to a teacher.
 */
export function validateDeveloperAccountInput(
  input: NewAccountInput & { role: string; teacherId?: string | null }
): DeveloperAccountResult {
  const role = input.role === UserRole.TEACHER ? UserRole.TEACHER : input.role === UserRole.STUDENT ? UserRole.STUDENT : null;
  const teacherId = (input.teacherId ?? "").trim();
  const base = validateNewAccountInput(input);

  if (!role || (role === UserRole.STUDENT && !teacherId) || !base.ok) {
    return { ok: false, error: "invalid", passwordProblem: base.ok ? null : base.passwordProblem };
  }

  return {
    ok: true,
    role,
    teacherId: role === UserRole.STUDENT ? teacherId : null,
    name: base.name,
    login: base.login,
    password: base.password
  };
}

export type PasswordChangeResult =
  | { ok: true; currentPassword: string; newPassword: string }
  | { ok: false; error: "invalid" | "mismatch"; passwordProblem: PasswordProblem | null };

/**
 * Change-password form (`updatePasswordAction`), in the site's order: shape of the three fields →
 * "invalid"; new ≠ confirmation → "mismatch"; strength of the new password → "invalid".
 */
export function validatePasswordChangeInput(input: {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}): PasswordChangeResult {
  const { currentPassword, newPassword, confirmPassword } = input;

  if (
    !currentPassword ||
    currentPassword.length > MAX_PASSWORD_LENGTH ||
    newPassword.length > MAX_PASSWORD_LENGTH ||
    confirmPassword.length > MAX_PASSWORD_LENGTH ||
    newPassword.trim().length < MIN_PASSWORD_LENGTH ||
    confirmPassword.trim().length < MIN_PASSWORD_LENGTH
  ) {
    return { ok: false, error: "invalid", passwordProblem: validatePasswordStrength(newPassword) };
  }

  if (newPassword !== confirmPassword) {
    return { ok: false, error: "mismatch", passwordProblem: null };
  }

  const passwordProblem = validatePasswordStrength(newPassword);

  if (passwordProblem !== null) {
    return { ok: false, error: "invalid", passwordProblem };
  }

  return { ok: true, currentPassword, newPassword };
}
