// Pure helpers of the numbers field (site: `components/topic-numbers-field.tsx`; docs/spec/07-developer-content.md §1.6).
import { normalizeHomeworkNumber, parseNumbersInput } from '@/domain/numbers';

/** The "final list" line is cut to this many characters, then "..." is appended. */
export const NUMBERS_PREVIEW_MAX_LENGTH = 120;

/** Numeric value used to detect neighbours; values longer than 15 digits never join a range. */
function toNumericValue(value: string): number {
  const normalized = normalizeHomeworkNumber(value);
  return normalized.length <= 15 ? Number(normalized) : Number.NaN;
}

/** `["1","2","3","8"]` → `"1-3, 8"`: consecutive values collapse into `first-last`, in the recorded spelling. */
export function compressNumbersToRanges(numbers: readonly string[]): string {
  const first = numbers[0];
  if (first === undefined) return '';

  const segments: string[] = [];
  let rangeStart = first;
  let rangeEnd = first;
  const flush = () => segments.push(rangeStart === rangeEnd ? rangeStart : `${rangeStart}-${rangeEnd}`);

  for (const current of numbers.slice(1)) {
    if (toNumericValue(current) === toNumericValue(rangeEnd) + 1) {
      rangeEnd = current;
      continue;
    }
    flush();
    rangeStart = current;
    rangeEnd = current;
  }
  flush();
  return segments.join(', ');
}

export function truncatePreview(value: string, maxLength = NUMBERS_PREVIEW_MAX_LENGTH): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength).trimEnd()}...`;
}

export type NumbersSummary = {
  /** `empty` — nothing typed; `unrecognized` — text, but no number parses; `ok` — at least one number. */
  state: 'empty' | 'unrecognized' | 'ok';
  count: number;
  first: string | null;
  last: string | null;
  /** The parsed list compressed into ranges and truncated — the "final list" line. */
  preview: string;
};

/** What the field shows under the textarea for the raw text. */
export function summarizeNumbersInput(text: string): NumbersSummary {
  const parsed = parseNumbersInput(text);
  const first = parsed[0] ?? null;
  const last = parsed[parsed.length - 1] ?? null;
  if (first === null || last === null) {
    return { state: text.trim().length > 0 ? 'unrecognized' : 'empty', count: 0, first: null, last: null, preview: '' };
  }
  return { state: 'ok', count: parsed.length, first, last, preview: truncatePreview(compressNumbersToRanges(parsed)) };
}
