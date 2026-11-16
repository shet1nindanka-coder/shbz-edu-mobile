// Public entry of the app's i18n layer.
//
//   const { locale, dict, m, setLocale } = useI18n();
//   dict.student.…   site texts (same keys as the site)      m.common.…   mobile-only texts
//   format(dict.common.homeworkN, { n })                     plural(locale, n, dict.login.minuteForms)
//
// Non-React code (`src/domain`, `src/mock`, tests) imports the pure modules directly:
// `@/i18n/get-dictionary`, `@/i18n/mobile`, `@/lib/i18n/format`, `@/lib/i18n/locale`.
export { I18nProvider, useI18n, type I18nProviderProps, type I18nValue } from "./i18n-provider";
export { SERVER_ONLY_SECTIONS, getClientDictionary, getDictionary } from "./get-dictionary";
export { MOBILE_AREAS, getMobileDictionary, type MobileArea, type MobileDictionary } from "./mobile";

export type { ClientDictionary, Dictionary, ServerOnlySection } from "@/lib/i18n/dictionary";
export { format, plural } from "@/lib/i18n/format";
export { DEFAULT_LOCALE, LOCALES, LOCALE_COOKIE, intlLocaleOf, isLocale, parseLocale, type Locale } from "@/lib/i18n/locale";

/** Device-storage key of the language preference — the site's cookie name (docs/spec/09 §3.4). */
export { LOCALE_COOKIE as LOCALE_STORAGE_KEY } from "@/lib/i18n/locale";
