/**
 * The error line of the login form, kept as a CODE and rendered on every pass (pure).
 *
 * The server's `message` is already localised — in the language of the request. The login screen has a
 * language switch right above the form, so a stored message would stay in the old language after a
 * switch. The site renders this notice from the dictionary by its code (docs/spec/01-shell-auth.md, table
 * of login errors); so does this module. Only an answer whose code has no login text keeps the server's
 * own message.
 */
import type { Locale } from '@/api/types';
import { format, plural } from '@/lib/i18n/format';

export type LoginFailure = {
  /** `ApiError.code`, or `empty` (client-side check) / `unknown` (not an API error). */
  code: string;
  /** `params.minutes` of a rate-limit refusal (1..60), when the server named it. */
  minutes?: number;
  /** The server's message in the language of the request — the fallback for codes without a login text. */
  message?: string;
};

export type LoginErrorTexts = {
  login: {
    rateLimitedFor: string;
    minuteForms: readonly string[];
    errors: { empty: string; invalid: string; rateLimited: string };
  };
  /** `m.common.errors.network` */
  network: string;
  /** `m.common.errors.generic` */
  generic: string;
};

/** What to remember about a rejected sign-in. */
export function loginFailureOf(error: { code: string; message: string; params?: Record<string, unknown> }): LoginFailure {
  const minutes = error.params?.minutes;
  return typeof minutes === 'number' && Number.isFinite(minutes) && minutes >= 1
    ? { code: error.code, minutes: Math.floor(minutes), message: error.message }
    : { code: error.code, message: error.message };
}

/** The text of the notice in the current interface language. */
export function loginFailureText(failure: LoginFailure, locale: Locale, texts: LoginErrorTexts): string {
  switch (failure.code) {
    case 'empty':
      return texts.login.errors.empty;
    case 'invalidCredentials':
      return texts.login.errors.invalid;
    case 'rateLimited':
      return failure.minutes === undefined
        ? texts.login.errors.rateLimited
        : format(texts.login.rateLimitedFor, { minutes: plural(locale, failure.minutes, texts.login.minuteForms) });
    case 'network':
      return texts.network;
    default:
      return failure.message || texts.generic;
  }
}
