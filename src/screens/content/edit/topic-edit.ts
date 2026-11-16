// Pure rules of the topic edit screen (docs/spec/07-developer-content.md §1.3, §1.3.1, §1.3.2, §4.9).
// No React, no React Native: covered by tests/content-edit.test.ts.
import type { NumbersChangePreview, TopicNumber, UpdateTopicRequest } from '@/api/types';
import { normalizeHomeworkNumber } from '@/domain/numbers';

import { hasLatex } from '../shared/number-fill-status';

/** The site's `ANSWERS_PAGE_SIZE`: the statements-and-answers block shows ten numbers per page. */
export const ANSWERS_PAGE_SIZE = 10;

/** Prefill of the numbers field: every number of the topic in display order, joined by ", " (the site's edit page). */
export function numbersFieldText(numbers: readonly Pick<TopicNumber, 'number'>[]): string {
  return numbers.map((entry) => entry.number).join(', ');
}

/**
 * A field of the form holds `null` while the user has not changed it, so it keeps following the server
 * value (another developer's save must not be reverted by a form that was merely open).
 */
export function draftValue(draft: string | null, saved: string): string {
  return draft ?? saved;
}

/** What to store for a typed value: `null` again once it equals the saved one. */
export function nextDraft(value: string, saved: string): string | null {
  return value === saved ? null : value;
}

export type TopicFormValues = { title: string; description: string; numbers: string };

/** The site's `required` fields: the title and the numbers text (the description is optional). */
export function missingRequiredField(values: TopicFormValues): 'title' | 'numbers' | null {
  if (values.title.trim().length === 0) return 'title';
  if (values.numbers.trim().length === 0) return 'numbers';
  return null;
}

// ───────────────────────────── destructive change of the number set ─────────────────────────────

type RemovedNumber = NumbersChangePreview['removed'][number];

/** Rows of the confirmation dialog: removed numbers that carry student work. */
export function dangerousNumbers(plan: NumbersChangePreview): RemovedNumber[] {
  return plan.removed.filter((entry) => entry.hasStudentWork);
}

/** Removed numbers that sit in an issued homework — named in the acknowledgement checkbox. */
export function assignedNumbers(plan: NumbersChangePreview): RemovedNumber[] {
  return plan.removed.filter((entry) => entry.isAssigned);
}

/** The destructive button stays disabled until the acknowledgement is ticked (when one is asked for). */
export function canConfirmRemoval(plan: NumbersChangePreview, allowAssigned: boolean): boolean {
  return !plan.requiresAssignedConfirmation || allowAssigned;
}

/** The confirmation part of `PATCH /topics/{topicId}` for a plan the user accepted. */
export function removalConfirmation(
  plan: NumbersChangePreview,
  allowAssigned: boolean,
): Pick<UpdateTopicRequest, 'confirmNumbersRemoval' | 'allowAssignedRemoval'> {
  return {
    confirmNumbersRemoval: dangerousNumbers(plan).map((entry) => entry.number),
    allowAssignedRemoval: plan.requiresAssignedConfirmation && allowAssigned,
  };
}

/** `details` of `409 numbersConfirm` / `409 numbersAssigned` is a fresh preview — checked before it is trusted. */
export function isNumbersChangePreview(value: unknown): value is NumbersChangePreview {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<Record<keyof NumbersChangePreview, unknown>>;
  return (
    typeof candidate.keptCount === 'number' &&
    Array.isArray(candidate.added) &&
    Array.isArray(candidate.removed) &&
    typeof candidate.requiresConfirmation === 'boolean' &&
    typeof candidate.requiresAssignedConfirmation === 'boolean'
  );
}

/**
 * What a failed preview means for the save (§1.3.1 step 3: "show the error and submit anyway — the server
 * re-checks"). Refusals the save would repeat word for word end the attempt with the preview's own,
 * more specific text; everything else (network, rate limit, 5xx) saves as is.
 */
export function previewFailureAction(code: string | undefined): 'stop' | 'saveAnyway' {
  return code === 'emptyNumbers' || code === 'numbersTwin' || code === 'topicNotFound' ? 'stop' : 'saveAnyway';
}

// ───────────────────────────── statements and answers: pages ─────────────────────────────

export function pageCountOf(total: number, pageSize = ANSWERS_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

/** Keeps the page inside `1..pageCount` (the list shrinks when numbers are removed). */
export function clampPage(page: number, pageCount: number): number {
  if (!Number.isFinite(page)) return 1;
  return Math.min(Math.max(1, Math.floor(page)), Math.max(1, pageCount));
}

export function pageSlice<T>(items: readonly T[], page: number, pageSize = ANSWERS_PAGE_SIZE): T[] {
  const start = (clampPage(page, pageCountOf(items.length, pageSize)) - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

/** «Показаны номера {start}-{end} из {total}»: 1-based positions, `0-0` for an empty topic. */
export function pageRange(total: number, page: number, pageSize = ANSWERS_PAGE_SIZE): { start: number; end: number } {
  if (total <= 0) return { start: 0, end: 0 };
  const current = clampPage(page, pageCountOf(total, pageSize));
  return { start: (current - 1) * pageSize + 1, end: Math.min(current * pageSize, total) };
}

/**
 * The entry a number label points at: compared by the normalised form, as the site's `?number=N` is
 * («007» finds «7»). `null` when the topic has no such number.
 */
export function findNumberEntry<T extends Pick<TopicNumber, 'number'>>(numbers: readonly T[], label: string | null): T | null {
  if (label === null || !/^\d+$/.test(label)) return null;
  const wanted = normalizeHomeworkNumber(label);
  return numbers.find((entry) => normalizeHomeworkNumber(entry.number) === wanted) ?? null;
}

/** 1-based page of the statements-and-answers list that holds `label`; `null` when the topic has no such number. */
export function pageOfNumber(numbers: readonly Pick<TopicNumber, 'number'>[], label: string | null, pageSize = ANSWERS_PAGE_SIZE): number | null {
  const entry = findNumberEntry(numbers, label);
  return entry === null ? null : Math.floor(numbers.indexOf(entry) / pageSize) + 1;
}

/** Counters of the «Сохранено условий … ответов …» line. */
export function countFilled(numbers: readonly Pick<TopicNumber, 'conditionLatex' | 'answerLatex'>[]): { conditions: number; answers: number } {
  let conditions = 0;
  let answers = 0;
  for (const entry of numbers) {
    if (hasLatex(entry.conditionLatex)) conditions += 1;
    if (hasLatex(entry.answerLatex)) answers += 1;
  }
  return { conditions, answers };
}
