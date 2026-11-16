// Ported 1:1 from the site (lib/ai-output-language.ts) — only the imports differ. Re-port instead of hand-editing;
// anything the app changes on purpose is marked [MOBILE].
import type { Locale } from "@/lib/i18n/locale";

// Промпты ИИ остаются русскими (см. CLAUDE.md), а тексты, которые модель
// пишет для людей, — на языке интерфейса того, кто запустил задачу.
// Строка добавляется последней в пользовательское сообщение: модель следует
// ей, даже если всё остальное задание написано по-русски.

const LANGUAGE_NAMES: Record<Locale, string> = {
  ru: "русский",
  en: "английский (English)"
};

/**
 * Инструкция о языке ответа для промпта. `fields` — поля JSON, которые читают
 * люди; служебные значения (вердикты, коды, индексы) не переводятся.
 */
export function aiOutputLanguageInstruction(locale: Locale, fields: readonly string[]) {
  const list = fields.join(", ");

  if (locale === "ru") {
    return `Язык ответа: ${LANGUAGE_NAMES.ru}. Поля ${list} пиши по-русски.`;
  }

  return [
    `Язык ответа: ${LANGUAGE_NAMES[locale]}. Поля ${list} пиши ТОЛЬКО на этом языке,`,
    "даже если условия задач и это задание написаны по-русски. Формулы в LaTeX не переводи,",
    "названия тем и номера задач цитируй как есть. Служебные значения (вердикты, коды, индексы) оставь как в формате."
  ].join(" ");
}
