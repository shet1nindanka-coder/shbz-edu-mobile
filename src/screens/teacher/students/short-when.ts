import { formatClockTime, formatDateTime, formatMsk } from '@/domain/dates';
import { mskParts } from '@/domain/moscow-time';
import type { Locale } from '@/i18n';

/**
 * A moment as the one caption of a row (docs/design/glass-over-paper.md §1a "Dates are short"): «24 ноя,
 * 16:00» within the current Moscow year, the full «24.11.2025, 16:00» for any other year. No React.
 */
export function shortWhen(value: string, now: number, locale: Locale): string {
  if (mskParts(value).year !== mskParts(now).year) return formatDateTime(value, locale);
  const day = formatMsk(value, 'dayMonthShort', locale);
  return day ? `${day}, ${formatClockTime(value, locale)}` : formatDateTime(value, locale);
}
