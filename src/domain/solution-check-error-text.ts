// Ported from the site (lib/solution-check-error-text.ts): `humanizeSolutionCheckError` is unchanged.
// [MOBILE] The API sends a failed check to the student as a CODE (`CheckErrorCode`), not as raw provider
// text, so the classifier is also exposed on its own (`classifySolutionCheckError`) together with the
// code → text lookup (`checkErrorText`).
// Граница между диагностикой для разработчика и сообщением для человека:
// сырой текст ошибки провайдера остаётся в pino-логах, ученику показывается
// сообщение на языке интерфейса с конкретным следующим шагом.

// Тексты передаются аргументом (dict.student.checkErrors): модуль работает в
// client-компонентах и не должен тащить словари в бандл.
import type { Dictionary } from "@/lib/i18n/dictionary";

type ErrorClassKey = "interrupted" | "disabled" | "timeout" | "quota" | "unavailable" | "queue" | "image";

const ERROR_CLASSES: { pattern: RegExp; key: ErrorClassKey }[] = [
  {
    // Проверка оборвалась: перезапуск сервера или снята разработчиком как зависшая.
    pattern: /прервал|перезапуск|зависш|interrupted|restart|stuck/i,
    key: "interrupted"
  },
  {
    // Проверка выключена в дев-панели или не настроена модель.
    pattern: /отключен|не настроен|disabled|not configured/i,
    key: "disabled"
  },
  {
    // Таймаут запроса к модели (AbortError / timeout).
    pattern: /abort|time.?out|таймаут|timed out/i,
    key: "timeout"
  },
  {
    // Бюджет / квота исчерпаны.
    pattern: /quota|insufficient|billing|balance|budget|бюджет|лимит провер/i,
    key: "quota"
  },
  {
    // Провайдер перегружен или недоступен (5xx / 429 / rate limit).
    pattern: /статус 5\d\d|статус 429|rate.?limit|too many|overload|unavailable|bad gateway|connect|fetch failed|ECONN/i,
    key: "unavailable"
  },
  {
    // Очередь проверок переполнена или сброшена.
    pattern: /очеред/i,
    key: "queue"
  },
  {
    // Фото не читаются моделью.
    pattern: /image|photo|фото|изображен|unsupported format/i,
    key: "image"
  }
];

/** Error classes plus "unknown" — the `CheckErrorCode` of the API ("unknown" ↔ dictionary key `fallback`). */
export type SolutionCheckErrorCode = ErrorClassKey | "unknown";

/** Class of a raw check error; never exposes the provider text. Empty / unrecognised → "unknown". */
export function classifySolutionCheckError(raw: string | null | undefined): SolutionCheckErrorCode {
  if (!raw || !raw.trim()) {
    return "unknown";
  }

  for (const entry of ERROR_CLASSES) {
    if (entry.pattern.test(raw)) {
      return entry.key;
    }
  }

  return "unknown";
}

/** Student-facing text of a check error code (`dict.student.checkErrors`). */
export function checkErrorText(
  code: SolutionCheckErrorCode | null | undefined,
  messages: Dictionary["student"]["checkErrors"]
): string {
  return code && code !== "unknown" ? messages[code] : messages.fallback;
}

/**
 * Переводит техническую ошибку ИИ-проверки в понятное ученику сообщение
 * с следующим шагом. Никогда не возвращает сырой текст провайдера.
 */
export function humanizeSolutionCheckError(
  raw: string | null | undefined,
  messages: Dictionary["student"]["checkErrors"]
): string {
  if (!raw || !raw.trim()) {
    return messages.fallback;
  }

  for (const entry of ERROR_CLASSES) {
    if (entry.pattern.test(raw)) {
      return messages[entry.key];
    }
  }

  return messages.fallback;
}
