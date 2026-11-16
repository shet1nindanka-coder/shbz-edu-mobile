import type { ru } from "@/lib/i18n/dictionaries/ru";

export type Dictionary = typeof ru;

/** Разделы, нужные только серверу: JSON-ошибки API и шаблоны записей в БД. */
export type ServerOnlySection = "apiCommon" | "apiStudent" | "apiContent" | "apiPlanner" | "audit" | "notifications";

/** То, что получает браузер через I18nProvider. */
export type ClientDictionary = Omit<Dictionary, ServerOnlySection>;
