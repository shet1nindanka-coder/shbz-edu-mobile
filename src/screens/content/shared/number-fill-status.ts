// Fill status of a number's materials (docs/spec/07-developer-content.md §1.3.2, §1.4b): both saved values
// non-blank → full, exactly one → partial, none → empty.
export type NumberFillStatus = 'full' | 'partial' | 'empty';

export function hasLatex(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

export function numberFillStatus(conditionLatex: string | null | undefined, answerLatex: string | null | undefined): NumberFillStatus {
  const filled = Number(hasLatex(conditionLatex)) + Number(hasLatex(answerLatex));
  return filled === 2 ? 'full' : filled === 1 ? 'partial' : 'empty';
}

/**
 * Whether "Save" is offered for a draft (single-number card rule): the draft is non-blank and differs from
 * the saved value after trimming.
 */
export function canSaveLatexDraft(draft: string, saved: string | null | undefined): boolean {
  const trimmed = draft.trim();
  return trimmed.length > 0 && trimmed !== (saved ?? '').trim();
}
