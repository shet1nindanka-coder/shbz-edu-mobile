/**
 * How a set of numbers is shown without growing the screen (docs/design/glass-over-paper.md §7, principle
 * 5): the counts for the status bar, the strip of numbers that still need work, the number to focus on,
 * and the groups of the «Все номера» sheet. Pure; the numbers stay strings (leading zeros are part of
 * the recorded spelling).
 */
import type { HomeworkNumberStatus } from "@/domain/enums";

export type FocusNumber = { id: string; number: string; status: HomeworkNumberStatus | null };

export type StatusKey = HomeworkNumberStatus | "none";

/** Order of the groups in «Все номера» and of the strip: what needs attention first. */
export const STATUS_GROUP_ORDER: readonly StatusKey[] = ["RED", "none", "YELLOW", "GREEN"];

export function statusKeyOf(status: HomeworkNumberStatus | null | undefined): StatusKey {
  return status ?? "none";
}

export type NumberCounts = { green: number; yellow: number; red: number; none: number };

export function countByStatus(numbers: readonly { status: HomeworkNumberStatus | null }[]): NumberCounts {
  const counts: NumberCounts = { green: 0, yellow: 0, red: 0, none: 0 };
  for (const entry of numbers) {
    if (entry.status === "GREEN") counts.green += 1;
    else if (entry.status === "YELLOW") counts.yellow += 1;
    else if (entry.status === "RED") counts.red += 1;
    else counts.none += 1;
  }
  return counts;
}

/** Numbers that are not closed yet: «нужна помощь» and not marked. */
export function leftCount(counts: NumberCounts): number {
  return counts.red + counts.none;
}

/**
 * The strip under the summary: the numbers that still need work — «нужна помощь» first, then the ones
 * without a mark — each group in the given order. When everything is closed the strip shows all numbers.
 */
export function stripNumbers<T extends FocusNumber>(numbers: readonly T[]): T[] {
  const red = numbers.filter((entry) => entry.status === "RED");
  const none = numbers.filter((entry) => entry.status === null);
  const remaining = [...red, ...none];
  return remaining.length > 0 ? remaining : [...numbers];
}

/**
 * The number whose card is shown: the picked one while it still exists, else the first «нужна помощь»,
 * else the first without a mark, else the first.
 */
export function pickFocusNumberId(numbers: readonly FocusNumber[], pickedId?: string | null): string | null {
  if (pickedId && numbers.some((entry) => entry.id === pickedId)) return pickedId;
  return (
    numbers.find((entry) => entry.status === "RED")?.id ??
    numbers.find((entry) => entry.status === null)?.id ??
    numbers[0]?.id ??
    null
  );
}

/** Groups of «Все номера»: by status in `STATUS_GROUP_ORDER`, empty groups dropped, the order inside kept. */
export function groupByStatus<T extends FocusNumber>(numbers: readonly T[]): { status: StatusKey; numbers: T[] }[] {
  return STATUS_GROUP_ORDER.map((status) => ({
    status,
    numbers: numbers.filter((entry) => statusKeyOf(entry.status) === status),
  })).filter((group) => group.numbers.length > 0);
}

/**
 * In «Все номера» the tiles show the last three digits when every number shares the rest («051004» →
 * «004»). Returns the length of the common prefix to cut, or 0 to show the numbers whole.
 */
export function commonPrefixLength(numbers: readonly { number: string }[]): number {
  const first = numbers[0]?.number ?? "";
  if (numbers.length < 2 || first.length <= 3) return 0;
  const prefix = first.slice(0, -3);
  return numbers.every((entry) => entry.number.length === first.length && entry.number.startsWith(prefix)) ? prefix.length : 0;
}

/** The tile label of a number in «Все номера»: its tail after the common prefix, or the whole number. */
export function shortNumber(number: string, prefixLength: number): string {
  return prefixLength > 0 ? number.slice(prefixLength) : number;
}
