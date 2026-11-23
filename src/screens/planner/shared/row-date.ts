import { formatClockTime, formatDateTime, formatMsk } from '@/domain/dates';
import { mskParts } from '@/domain/moscow-time';
import type { Locale } from '@/i18n';

/**
 * A moment for the one caption of a list row: «17 ноя, 12:00» within the current Moscow year — the year is
 * noise there and costs the caption its end — and the full «17.11.2025, 12:00» for any other year.
 */
export function rowDateTime(value: string, now: number, locale: Locale): string {
  if (mskParts(value).year !== mskParts(now).year) return formatDateTime(value, locale);
  const day = formatMsk(value, 'dayMonthShort', locale);
  return day ? `${day}, ${formatClockTime(value, locale)}` : formatDateTime(value, locale);
}
