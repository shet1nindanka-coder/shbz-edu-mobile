// Ported 1:1 from the site (lib/progress-policy.ts) — only the imports differ. Re-port instead of hand-editing;
// anything the app changes on purpose is marked [MOBILE].
import { HomeworkNumberStatus, LessonItemResult } from "@/domain/enums";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n";
import { getDictionary } from "@/i18n/get-dictionary";
import { getStatusForAiVerdict, isStatusDowngrade } from "@/domain/solution-check-status";
import type { CheckVerdict } from "@/domain/solution-check-parse";

// Русские константы остаются для AuditLog и логов (lib/progress-write.ts);
// экран истории берёт подписи на языке интерфейса через функции ниже.
export const PROGRESS_SOURCE_LABELS = getDictionary(DEFAULT_LOCALE).progress.sources;

export const PROGRESS_DECISION_LABELS = getDictionary(DEFAULT_LOCALE).progress.decisions;

export type ProgressDecisionReason = keyof typeof PROGRESS_DECISION_LABELS;
export type ProgressSource = keyof typeof PROGRESS_SOURCE_LABELS;

export function progressSourceLabels(locale: Locale = DEFAULT_LOCALE) {
  return getDictionary(locale).progress.sources;
}

export function progressDecisionLabels(locale: Locale = DEFAULT_LOCALE) {
  return getDictionary(locale).progress.decisions;
}

export type ProgressIntent =
  | { source: "teacher"; status: HomeworkNumberStatus | null }
  | { source: "homework_check"; verdict: CheckVerdict; checkStartedAt: Date }
  | { source: "lesson_teacher"; result: LessonItemResult | null; previousResult: LessonItemResult | null }
  | { source: "lesson_check"; result: LessonItemResult | null; verdict: CheckVerdict }
  | { source: "lesson_end"; result: LessonItemResult };

const RESULT_TO_STATUS: Partial<Record<LessonItemResult, HomeworkNumberStatus>> = {
  SOLVED: HomeworkNumberStatus.GREEN,
  PARTIAL: HomeworkNumberStatus.YELLOW,
  NOT_SOLVED: HomeworkNumberStatus.RED
};

export type ProgressDecision = {
  write: boolean;
  requestedStatus: HomeworkNumberStatus | null;
  status: HomeworkNumberStatus | null;
  reason: ProgressDecisionReason;
};

/** Единые правила записи. Различия ДЗ и урока намеренно сохранены. */
export function decideProgressChange(
  current: { status: HomeworkNumberStatus | null; statusChangedAt: Date | null } | null,
  intent: ProgressIntent
): ProgressDecision {
  const previous = current?.status ?? null;
  const keep = (reason: ProgressDecisionReason, requestedStatus: HomeworkNumberStatus | null = null): ProgressDecision =>
    ({ write: false, requestedStatus, status: previous, reason });
  let requested: HomeworkNumberStatus | null;

  if (intent.source === "homework_check") {
    requested = getStatusForAiVerdict(intent.verdict, previous);
    if (requested === null) return keep("uncertain");
    if (requested === previous) return keep("unchanged", requested);
    if (isStatusDowngrade(requested, previous)) return keep("downgrade_blocked", requested);
    if (current?.statusChangedAt && current.statusChangedAt > intent.checkStartedAt) {
      return keep("newer_status", requested);
    }
  } else if (intent.source === "teacher") {
    requested = intent.status;
  } else {
    if (intent.source === "lesson_check" && intent.result === null) {
      return keep(intent.verdict === "UNCERTAIN" ? "uncertain" : "lesson_result_preserved");
    }
    if (intent.result === LessonItemResult.SKIPPED || intent.result === null) {
      // «Не успел» и снятие итога сами по себе прогресс не меняют. Но если учитель
      // ставит их ПОВЕРХ выставленного итога (решил → не успел), прежний GREEN/YELLOW/RED
      // надо очистить — иначе ученик числится решившим номер, который не делал.
      const clearsPreviousResult =
        intent.source === "lesson_teacher" &&
        intent.previousResult !== null &&
        intent.previousResult !== LessonItemResult.SKIPPED;

      if (!clearsPreviousResult) {
        return keep("no_status");
      }
      requested = null;
    } else {
      requested = RESULT_TO_STATUS[intent.result] ?? null;
    }
  }

  // Ручная повторная отметка остаётся новым действием: её время защищает
  // от ответа ранее запущенной проверки ДЗ, даже если цвет не изменился.
  return { write: true, requestedStatus: requested, status: requested, reason: previous === requested ? "reaffirmed" : "changed" };
}

export function progressStatusLabel(status: HomeworkNumberStatus | null, locale: Locale = DEFAULT_LOCALE) {
  const labels = getDictionary(locale).progress.statuses;

  return status ? labels[status] : labels.none;
}
