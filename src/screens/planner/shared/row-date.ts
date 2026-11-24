import { formatClockTime, formatDateTime, formatMsk } from '@/domain/dates';
import { mskParts } from '@/domain/moscow-time';
import type { Locale } from '@/i18n';

/**
 * «17 ноя»: the day with the month cut to three letters. `Intl` abbreviates Russian months unevenly
 * («нояб.», «сент.», «мая»); a caption reads better without the full stop inside it (docs/design/
 * glass-over-paper.md §1a "Dates are short").
 */
export function rowDay(value: string | number, locale: Locale): string | null {
  const day = formatMsk(value, 'dayMonthShort', locale);
  return day ? day.replace(/(\p{L}{3})\p{L}*\.?/u, '$1') : null;
}

/**
 * A moment for the one caption of a list row: «17 ноя, 12:00» within the current Moscow year — the year is
 * noise there and costs the caption its end — and the full «17.11.2025, 12:00» for any other year.
 */
export function rowDateTime(value: string, now: number, locale: Locale): string {
  if (mskParts(value).year !== mskParts(now).year) return formatDateTime(value, locale);
  const day = rowDay(value, locale);
  return day ? `${day}, ${formatClockTime(value, locale)}` : formatDateTime(value, locale);
}
