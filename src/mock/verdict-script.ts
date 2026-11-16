/**
 * Rule V — the single place that decides the verdict of a mocked AI check
 * (docs/spec/90-addendum-6.md §4). Used by `studentWork.startHomeworkCheck` (rule V-H) and
 * `studentWork.submitLessonItem` (rule V-L); no other code may invent a verdict.
 *
 * The rule is pure: it reads what the caller passes in, never `Math.random()`, the clock, the photo bytes
 * or the number label.
 *
 * Precedence at the terminal moment of a check — the first that applies wins:
 * 1. `store.controls.nextCheckOutcome` (one-shot, armed on the demo screen);
 * 2. the row's `MockRowScript` (`store.rowScripts`, seeded in-flight rows only);
 * 3. rule V-H / V-L below.
 */
import type { CheckErrorCode, ErrorKind, HomeworkNumberStatus, Locale, SolutionVerdict } from "@/api/types";
import { compareHomeworkNumbers } from "@/domain/numbers";

import type { ScriptedResult } from "./store/schema";

export const VERDICT_CYCLE: readonly SolutionVerdict[] = ["CORRECT", "INCORRECT", "UNCERTAIN"];

/** The whole rule: position in the list plus the number of earlier attempts, walked along the cycle. */
export function scriptVerdict(index: number, attempt: number): SolutionVerdict {
  return VERDICT_CYCLE[(Math.max(0, index) + Math.max(0, attempt)) % VERDICT_CYCLE.length]!;
}

/** `modelUsed` of every check the mock "model" produced. */
export const MOCK_MODEL_NAME = "mock";

const INCORRECT_ERROR_KINDS: readonly ErrorKind[] = ["SIGN", "ARITHMETIC", "DOMAIN", "BRACKETS"];

/**
 * Texts the mocked model "writes" (data, not UI strings): they follow the locale of the request that
 * started the check, exactly like the site passes the student's locale to the check queue. The Russian
 * strings are those of `scripts/create-test-accounts.ts`.
 */
const MODEL_TEXTS: Record<Locale, { correctAnswer: string; correct: string; incorrect: string; errorNote: string }> = {
  ru: {
    correctAnswer: "совпадает с эталоном",
    correct: "Верно.",
    incorrect: "Ошибка вычислительного характера — пересчитай выкладки внимательнее.",
    errorNote: "На втором шаге потерян знак перед дробью.",
  },
  en: {
    correctAnswer: "matches the reference answer",
    correct: "Correct.",
    incorrect: "A calculation error — recheck your working carefully.",
    errorNote: "The sign before the fraction was lost at the second step.",
  },
};

/**
 * Payload of one scripted result (90-addendum-6 §4.5). `index` = position of the number in `found`
 * (homework) / position of the item in the participant's set (lesson); it picks the `errorKind` of an
 * INCORRECT result.
 */
export function scriptedResult(number: string, verdict: SolutionVerdict, index: number, locale: Locale = "ru"): ScriptedResult {
  const texts = MODEL_TEXTS[locale] ?? MODEL_TEXTS.ru;
  const base = { number, verdict, copySuspected: false, injectionSuspected: false } as const;

  if (verdict === "CORRECT") {
    return { ...base, confidence: 0.93, recognizedAnswer: texts.correctAnswer, comment: texts.correct, errorKind: null, errorNote: null };
  }
  if (verdict === "INCORRECT") {
    return {
      ...base,
      confidence: 0.88,
      recognizedAnswer: "x = 3",
      comment: texts.incorrect,
      errorKind: INCORRECT_ERROR_KINDS[Math.max(0, index) % INCORRECT_ERROR_KINDS.length]!,
      errorNote: texts.errorNote,
    };
  }
  // UNCERTAIN keeps the model's comment in the store; the student projection replaces it with
  // `dict.student.uncertainComment` (90-addendum-4 P3).
  return { ...base, confidence: 0.41, recognizedAnswer: null, comment: texts.correct, errorKind: "UNREADABLE", errorNote: null };
}

export type HomeworkCheckNumber = {
  /** `TopicHomeworkNumber.id`. */
  homeworkNumberId: string;
  /** Label, leading zeros kept. */
  number: string;
  /** The student's current status of the number. */
  status: HomeworkNumberStatus | null;
};

/**
 * Rule V-H, steps 1–3: which numbers of the assignment the mocked model "finds" on a batch of `photoCount`
 * photos. Unsolved numbers (not GREEN, not YELLOW) come first in numeric order; when everything is solved
 * the first numbers of the assignment are used instead.
 */
export function selectFoundNumbers<T extends HomeworkCheckNumber>(numbers: readonly T[], photoCount: number): T[] {
  const sorted = [...numbers].sort((left, right) => compareHomeworkNumbers(left.number, right.number));
  const unsolved = sorted.filter((entry) => entry.status !== "GREEN" && entry.status !== "YELLOW");
  const pool = unsolved.length > 0 ? unsolved : sorted;
  return pool.slice(0, Math.max(0, Math.min(Math.floor(photoCount), pool.length)));
}

/**
 * Rule V-H: results of a homework check started by the user. Numbers outside `found` are ABSENT from the
 * result (no verdict, not UNCERTAIN). `found[0]` is always CORRECT, so every check solves at least one
 * unsolved number. `verdicts` overrides the cycle by index (control `nextCheckOutcome.verdicts`).
 */
export function scriptHomeworkCheck<T extends HomeworkCheckNumber>(
  numbers: readonly T[],
  photoCount: number,
  locale: Locale = "ru",
  verdicts?: readonly SolutionVerdict[],
): { entry: T; result: ScriptedResult }[] {
  return selectFoundNumbers(numbers, photoCount).map((entry, index) => ({
    entry,
    result: scriptedResult(entry.number, verdicts?.[index] ?? scriptVerdict(index, 0), index, locale),
  }));
}

/**
 * Rule V-L: the single result of a lesson submission. `position` = 0-based rank of the item among the
 * participant's items by `order` (main part first, then the extra part); `doneAttempts` = earlier
 * submissions of this item with status DONE. The photo count does not influence the verdict.
 */
export function scriptLessonSubmission(
  number: string,
  position: number,
  doneAttempts: number,
  locale: Locale = "ru",
  verdict?: SolutionVerdict,
): ScriptedResult {
  return scriptedResult(number, verdict ?? scriptVerdict(position, doneAttempts), position, locale);
}

/**
 * Canonical raw `error` text stored for a FAILED check of each class (90-addendum-6 §9.2 rule 3). The
 * student projection derives `errorCode` from it with the ordered classifier
 * (`classifySolutionCheckError`); teacher / developer projections show the raw text.
 */
export function failedCheckError(errorClass: CheckErrorCode, target: "homework" | "lesson"): string {
  switch (errorClass) {
    case "interrupted":
      return target === "lesson"
        ? "Проверка прервалась (перезапуск сервера). Сдайте номер заново."
        : "Проверка прервалась (перезапуск сервера). Запустите её заново.";
    case "disabled":
      return "Автопроверка отключена разработчиком.";
    case "timeout":
      return "Request timed out";
    case "quota":
      return "insufficient quota";
    case "unavailable":
      return "Provider responded with статус 429: rate limit exceeded";
    case "queue":
      return "Очередь проверок переполнена.";
    case "image":
      return "Не удалось прочитать фото решения из хранилища.";
    case "unknown":
      return "Модель не вернула вердикт по номеру.";
  }
}

/** A failure of these classes happens before the model stage and gives the daily budget slot back (90-addendum-3 §9 item 3). */
export function failureRefundsBudget(errorClass: CheckErrorCode): boolean {
  return errorClass === "disabled" || errorClass === "image";
}
