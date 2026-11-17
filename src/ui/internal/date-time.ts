// Pure helpers of the date-time field. The value is a wall-clock string `YYYY-MM-DDTHH:mm` ("" = no
// value), exactly as on the site's `ShbzDateTimePicker`; turning it into an instant is the caller's job.
import { mskDate, mskParts, SCHOOL_TIME_ZONE } from '@/domain/moscow-time';

export type DateTimeParts = { year: number; month: number; day: number; hour: number; minute: number };
export type DateTimeLocale = 'ru' | 'en';

const PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/;
const pad = (n: number) => String(n).padStart(2, '0');

export function parseDateTimeValue(value: string): DateTimeParts | null {
  const match = PATTERN.exec(value);
  if (!match) return null;
  const [year, month, day, hour, minute] = match.slice(1).map(Number) as [number, number, number, number, number];
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;
  return { year, month, day, hour, minute };
}

export function formatDateTimeValue(parts: DateTimeParts): string {
  return `${String(parts.year).padStart(4, '0')}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}

/**
 * The zone the native pickers are told to show (`timeZoneName`). The field holds Moscow wall clock on every
 * device (docs/spec/09-data-i18n-math.md §6.2), so the pickers work in Moscow time too, never in the
 * device's own zone: a Moscow 02:30 that does not exist in the device zone (its spring-forward hour, e.g.
 * Europe/Berlin on 29 Mar 2026, or Africa/Cairo at midnight) would otherwise move to 03:30.
 */
export const PICKER_TIME_ZONE = SCHOOL_TIME_ZONE;

/** Wall clock → the instant the native picker is given (shown in `PICKER_TIME_ZONE`). */
export function partsToPickerDate(parts: DateTimeParts): Date {
  return mskDate(parts);
}

/** What the native picker returned (an instant) → the wall clock it showed in `PICKER_TIME_ZONE`. */
export function pickerDateToParts(date: Date): DateTimeParts {
  const { year, month, day, hour, minute } = mskParts(date);
  return { year, month, day, hour, minute };
}

/**
 * Wall clock → `Date` in the DEVICE zone. Not for the native pickers (see `partsToPickerDate`): a wall
 * clock inside the device zone's DST gap does not exist there and moves by an hour.
 */
export function partsToDate(parts: DateTimeParts): Date {
  return new Date(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0, 0);
}

export function dateToParts(date: Date): DateTimeParts {
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    hour: date.getHours(),
    minute: date.getMinutes(),
  };
}

/** `dd.MM.yyyy, HH:mm` (ru-RU) / `dd/MM/yyyy, HH:mm` (en-GB); "" for an empty or malformed value. */
export function formatDateTimeDisplay(value: string, locale: DateTimeLocale = 'ru'): string {
  const parts = parseDateTimeValue(value);
  if (!parts) return '';
  return `${formatDateDisplay(parts, locale)}, ${formatTimeDisplay(parts)}`;
}

export function formatDateDisplay(parts: DateTimeParts, locale: DateTimeLocale = 'ru'): string {
  const separator = locale === 'ru' ? '.' : '/';
  return [pad(parts.day), pad(parts.month), String(parts.year)].join(separator);
}

export function formatTimeDisplay(parts: DateTimeParts): string {
  return `${pad(parts.hour)}:${pad(parts.minute)}`;
}

const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Wall-clock parts of "now". `today` (`YYYY-MM-DD`) is the calendar day that counts as today in the zone
 * the caller reads the value in — the app passes the Moscow day, because every deadline and lesson start
 * is Moscow wall clock whatever the device zone is. Without it the device's own day is used.
 */
export function todayParts(now: Date, today?: string): DateTimeParts {
  const device = dateToParts(now);
  const match = today ? DAY_KEY.exec(today) : null;
  if (!match) return device;
  return { ...device, year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

/** Today 23:59 — the "Сегодня" action and the default when a day is picked with no time. */
export function todayDateTimeValue(now: Date, today?: string): string {
  return formatDateTimeValue({ ...todayParts(now, today), hour: 23, minute: 59 });
}

/** Picking a day keeps the already chosen time, otherwise sets 23:59. */
export function withPickedDate(value: string, year: number, month: number, day: number): string {
  const current = parseDateTimeValue(value);
  return formatDateTimeValue({ year, month, day, hour: current?.hour ?? 23, minute: current?.minute ?? 59 });
}

/** Picking a time with no value uses today. */
export function withPickedTime(value: string, hour: number, minute: number, now: Date, today?: string): string {
  const current = parseDateTimeValue(value) ?? todayParts(now, today);
  return formatDateTimeValue({ ...current, hour, minute });
}
