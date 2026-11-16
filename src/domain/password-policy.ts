// Ported 1:1 from the site (lib/password-policy.ts) — only the imports differ. Re-port instead of hand-editing;
// anything the app changes on purpose is marked [MOBILE].
// Проверка без словаря: модуль работает и в client-формах. Сервер сравнивает
// код с null, форма показывает текст через passwordProblemText(dict.passwordPolicy).
import { format } from "@/lib/i18n/format";
import type { Dictionary } from "@/lib/i18n/dictionary";

const COMMON_PASSWORDS = new Set([
  "12345678",
  "123456789",
  "1234567890",
  "password",
  "password1",
  "password123",
  "qwerty123",
  "qwertyui",
  "11111111",
  "00000000",
  "1q2w3e4r",
  "abc12345",
  "1234qwer",
  "qwer1234",
  "iloveyou",
  "football"
]);

export const MAX_PASSWORD_LENGTH = 256;

export type PasswordProblem = keyof Dictionary["passwordPolicy"];

/** Код проблемы пароля или null, если пароль подходит. */
export function validatePasswordStrength(password: string): PasswordProblem | null {
  const normalized = password.trim();

  if (normalized.length < 8) {
    return "tooShort";
  }

  if (password.length > MAX_PASSWORD_LENGTH) {
    return "tooLong";
  }

  if (!/[a-zа-яё]/i.test(normalized)) {
    return "noLetter";
  }

  if (!/\d/.test(normalized)) {
    return "noDigit";
  }

  if (COMMON_PASSWORDS.has(normalized.toLowerCase())) {
    return "common";
  }

  return null;
}

export function passwordProblemText(problem: PasswordProblem, t: Dictionary["passwordPolicy"]) {
  return format(t[problem], { max: MAX_PASSWORD_LENGTH });
}
