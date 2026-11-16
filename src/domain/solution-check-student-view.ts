// Ported 1:1 from the site (lib/solution-check-student-view.ts) — only the imports differ. Re-port instead of hand-editing;
// anything the app changes on purpose is marked [MOBILE].
import { type Locale } from "@/lib/i18n";
import { getDictionary } from "@/i18n/get-dictionary";
import type { CheckVerdict } from "@/domain/solution-check-parse";
import { compareHomeworkNumbers } from "@/domain/utils";

/**
 * Что из результата автопроверки видит ученик.
 *
 * Вердикт с низкой уверенностью закрывается в UNCERTAIN уже при разборе ответа
 * (`normalizeCheckResultsByConfidence`), но комментарий модели при этом остаётся
 * прежним — и ученик видел плашку «не распознано» рядом с текстом «Верно.»
 * (PROD-011). Комментарий писался под другой вердикт, поэтому как утверждение
 * он больше не годится.
 *
 * Полный результат — с исходным комментарием, `recognizedAnswer`, диагностикой
 * и пометками — остаётся у учителя: здесь режется только то, что уходит ученику.
 */

export const UNCERTAIN_STUDENT_COMMENT = getDictionary("ru").student.uncertainComment;

export type StudentFacingCheckResult = {
  number: string;
  verdict: CheckVerdict;
  recognizedAnswer: string | null;
  comment: string | null;
};

export function toStudentFacingResult(
  result: {
    number: string;
    verdict: CheckVerdict;
    recognizedAnswer: string | null;
    comment: string | null;
  },
  locale: Locale = "ru"
): StudentFacingCheckResult {
  if (result.verdict === "UNCERTAIN") {
    return {
      number: result.number,
      verdict: result.verdict,
      // Распознанный ответ тоже убираем: он был распознан неуверенно, а ученик
      // прочитает его как «вот что ты написал» и будет спорить с учителем.
      recognizedAnswer: null,
      comment: getDictionary(locale).student.uncertainComment
    };
  }

  return {
    number: result.number,
    verdict: result.verdict,
    recognizedAnswer: result.recognizedAnswer,
    comment: result.comment
  };
}

export function toStudentFacingResults(
  results: {
    number: string;
    verdict: CheckVerdict;
    recognizedAnswer: string | null;
    comment: string | null;
  }[],
  locale: Locale = "ru"
): StudentFacingCheckResult[] {
  return results
    .map((result) => toStudentFacingResult(result, locale))
    .sort((left, right) => compareHomeworkNumbers(left.number, right.number));
}
