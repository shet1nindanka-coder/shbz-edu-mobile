// Общие константы языка — без серверных импортов, чтобы файл можно было
// подключать и в client-компонентах, и в middleware.
export const LOCALES = ["ru", "en"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "ru";

// Язык живёт в cookie, а не в localStorage как тема: почти все страницы —
// серверные компоненты, и язык должен быть известен до рендера.
export const LOCALE_COOKIE = "shbz-lang";

export const LOCALE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

export function parseLocale(value: unknown): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

/** BCP-47 тег для Intl: формат дат и чисел следует за языком интерфейса. */
export function intlLocaleOf(locale: Locale) {
  return locale === "en" ? "en-GB" : "ru-RU";
}
