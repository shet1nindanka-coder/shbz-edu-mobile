import type { HomeworkNumberStatus } from '@/api/types';
import type { NumberCounts, StatusKey } from '@/domain/number-focus';
import { format, type MobileDictionary } from '@/i18n';

type StatusStrings = MobileDictionary['common']['statuses'];

/** Short name of a status as shown next to a number: «решил сам», «исправил», «нужна помощь», «не отмечено». */
export function statusLabel(status: HomeworkNumberStatus | null | undefined, statuses: StatusStrings): string {
  return statuses[status ?? 'none'].label;
}

/** Heading of a status group in «Все номера»: «Нужна помощь · 4». */
export function statusGroupTitle(status: StatusKey, count: number, statuses: StatusStrings): string {
  return format(statuses.groupCount, { label: statuses[status].group, n: count });
}

/** One line for the status bar: «31 решил сам · 6 исправил · 4 нужна помощь» (zero parts are left out). */
export function statusBreakdown(counts: NumberCounts, statuses: StatusStrings, withNone = false): string {
  const parts: string[] = [];
  if (counts.green > 0) parts.push(format(statuses.barPart, { n: counts.green, label: statuses.GREEN.label }));
  if (counts.yellow > 0) parts.push(format(statuses.barPart, { n: counts.yellow, label: statuses.YELLOW.label }));
  if (counts.red > 0) parts.push(format(statuses.barPart, { n: counts.red, label: statuses.RED.label }));
  if (withNone && counts.none > 0) parts.push(format(statuses.barPart, { n: counts.none, label: statuses.none.label }));
  return parts.join(' · ');
}
