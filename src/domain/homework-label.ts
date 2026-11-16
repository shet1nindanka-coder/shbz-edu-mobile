// Ported 1:1 from the site (lib/homework-label.ts) — only the imports differ. Re-port instead of hand-editing;
// anything the app changes on purpose is marked [MOBILE].
import { format, type Locale } from "@/lib/i18n";
import { getDictionary } from "@/i18n/get-dictionary";
import { DEFAULT_LOCALE } from "@/lib/i18n/locale";

/** Подпись выданного ДЗ: своё название или «ДЗ N» по порядку внутри темы. */
export function homeworkAssignmentLabel(
  assignment: { title: string | null; orderInTopic: number },
  locale: Locale = DEFAULT_LOCALE
) {
  return assignment.title || format(getDictionary(locale).common.homeworkN, { n: assignment.orderInTopic });
}
