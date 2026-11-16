// Ported 1:1 from the site (lib/plan-error.ts) — only the imports differ. Re-port instead of hand-editing;
// anything the app changes on purpose is marked [MOBILE].
// Ошибки ИИ-подбора урока и ДЗ хранятся в LessonParticipant.planError кодом,
// а текст собирается на языке интерфейса. Модуль работает в client-компонентах,
// поэтому словари не импортирует: тексты передаются аргументом.

import type { Dictionary } from "@/lib/i18n/dictionary";

export type PlanErrorCode = keyof Dictionary["planner"]["planErrors"];

const PLAN_ERROR_PREFIX = "plan-error:";

// Строки, которые писались в planError до кодов. Это значения из базы, а не
// тексты интерфейса: они заморожены и не правятся вместе со словарём.
const LEGACY_PLAN_ERRORS: Record<string, PlanErrorCode> = {
  "ИИ-подбор недоступен: модель не настроена. Урок можно собрать вручную.": "unavailable",
  "Ученик не найден или удалён.": "studentMissing",
  "Нет доступных номеров: всё уже решено, выдано на уроках или в активных ДЗ. Добавьте номера вручную.": "noCandidates",
  "В этой теме нет доступных номеров: всё уже решено, выдано или разобрано. Добавьте номера вручную.":
    "homeworkNoCandidates",
  "Дедлайн уже в прошлом или тема не задана — создайте новый черновик.": "homeworkParams",
  "Модель не вернула план. Нажмите «Повторить» или добавьте номера вручную.": "emptyPlan",
  "Подбор не удался: модель не ответила. Нажмите «Повторить» или добавьте номера вручную.": "failed"
};

/** Значение для записи в planError. */
export function planErrorValue(code: PlanErrorCode) {
  return `${PLAN_ERROR_PREFIX}${code}`;
}

/** Текст ошибки подбора для показа учителю; неизвестную строку отдаёт как есть. */
export function planErrorText(raw: string, messages: Dictionary["planner"]["planErrors"]) {
  const code = raw.startsWith(PLAN_ERROR_PREFIX)
    ? raw.slice(PLAN_ERROR_PREFIX.length)
    : LEGACY_PLAN_ERRORS[raw.trim()];

  return code && Object.prototype.hasOwnProperty.call(messages, code) ? messages[code as PlanErrorCode] : raw;
}
