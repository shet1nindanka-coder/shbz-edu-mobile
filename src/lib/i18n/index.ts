// Общий вход i18n без словарей: формат, формы по числу, язык и типы. Безопасен
// для client-компонентов. Сами словари — @/lib/i18n/get-dictionary (сервер)
// и useI18n() (браузер).
export type { ClientDictionary, Dictionary } from "@/lib/i18n/dictionary";
export { format, plural } from "@/lib/i18n/format";
export { DEFAULT_LOCALE, LOCALES, LOCALE_COOKIE, intlLocaleOf, isLocale, parseLocale } from "@/lib/i18n/locale";
export type { Locale } from "@/lib/i18n/locale";
