// School time = Moscow time, on every device (docs/spec/09-data-i18n-math.md §6.2).
//
// The site gets Moscow calendar days for free: the server process runs with TZ="Europe/Moscow" and uses the
// local `Date` getters. A phone can be in any zone, so the app never touches local getters or the Intl
// time-zone database for day logic. Moscow has had a FIXED offset of UTC+3 with no DST since 2014, so a
// Moscow wall clock is simply the UTC clock of `instant + 3 h`: shift once, then read with `getUTC*`.
//
// Vocabulary: an "instant" is a `Date` / ISO string / epoch ms; a "day key" is a Moscow calendar day
// "YYYY-MM-DD" (the `DateKey` of the API types).

export const SCHOOL_TIME_ZONE = "Europe/Moscow";
export const SCHOOL_UTC_OFFSET_MINUTES = 180;

export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

const OFFSET_MS = SCHOOL_UTC_OFFSET_MINUTES * MINUTE_MS;
const DAY_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_TIME_INPUT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

export type DateInput = Date | string | number;

export type MskParts = {
  year: number;
  /** 1–12. */
  month: number;
  /** 1–31. */
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
  /** Monday = 0 … Sunday = 6 (the site's `getDayOfWeekIndex`). */
  weekday: number;
};

export type MskWallClock = {
  year: number;
  /** 1–12. */
  month: number;
  day: number;
  hour?: number;
  minute?: number;
  second?: number;
  millisecond?: number;
};

/** Epoch milliseconds of an instant; `NaN` for an unparsable value. */
export function toEpochMs(value: DateInput): number {
  if (value instanceof Date) {
    return value.getTime();
  }

  return typeof value === "number" ? value : new Date(value).getTime();
}

function pad(value: number, width = 2) {
  return String(value).padStart(width, "0");
}

function buildDayKey(year: number, month: number, day: number) {
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

/** Moscow wall-clock fields of an instant. Every field is `NaN` for an invalid instant. */
export function mskParts(value: DateInput): MskParts {
  const shifted = new Date(toEpochMs(value) + OFFSET_MS);

  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
    millisecond: shifted.getUTCMilliseconds(),
    weekday: (shifted.getUTCDay() + 6) % 7
  };
}

/**
 * The instant of a Moscow wall-clock moment. Out-of-range fields roll over like `Date.UTC`
 * (day 0 = last day of the previous month, hour 24 = next day), which makes day arithmetic trivial.
 */
export function mskDate(clock: MskWallClock): Date {
  const utc = Date.UTC(
    clock.year,
    clock.month - 1,
    clock.day,
    clock.hour ?? 0,
    clock.minute ?? 0,
    clock.second ?? 0,
    clock.millisecond ?? 0
  );

  return new Date(utc - OFFSET_MS);
}

/** Moscow calendar day of an instant, "YYYY-MM-DD". The site's `getTimelineDateKey`. */
export function mskDayKey(value: DateInput): string {
  const parts = mskParts(value);

  return buildDayKey(parts.year, parts.month, parts.day);
}

/** "Today" in Moscow for the given clock reading (pass the server-corrected `now` when there is one). */
export function mskToday(now: DateInput = Date.now()): string {
  return mskDayKey(now);
}

/** Splits a day key; `null` unless it is a real calendar day ("2026-02-30" is rejected). */
export function parseDayKey(key: string): { year: number; month: number; day: number } | null {
  const match = DAY_KEY_PATTERN.exec(key);

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const check = new Date(Date.UTC(year, month - 1, day));

  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    return null;
  }

  return { year, month, day };
}

export function isDayKey(value: unknown): value is string {
  return typeof value === "string" && parseDayKey(value) !== null;
}

/** 00:00 Moscow time of a day key as an instant; an Invalid Date for a malformed key. */
export function dayKeyToDate(key: string): Date {
  const parsed = parseDayKey(key);

  return parsed ? mskDate(parsed) : new Date(Number.NaN);
}

/** 00:00 Moscow time of the Moscow day that contains the instant. */
export function mskStartOfDay(value: DateInput): Date {
  const parts = mskParts(value);

  return mskDate({ year: parts.year, month: parts.month, day: parts.day });
}

/** Moves an instant by whole days. No DST in Moscow, so a calendar day is always exactly 24 h. */
export function mskAddDays(value: DateInput, days: number): Date {
  return new Date(toEpochMs(value) + days * DAY_MS);
}

/** Day key `days` calendar days after (or before, when negative) the given one. */
export function addDaysToDayKey(key: string, days: number): string {
  return mskDayKey(mskAddDays(dayKeyToDate(key), days));
}

/** Monday = 0 … Sunday = 6 of the Moscow day that contains the instant. */
export function mskWeekdayIndex(value: DateInput): number {
  return mskParts(value).weekday;
}

/** Monday 00:00 Moscow time of the week that contains the instant (weeks start on Monday). */
export function mskMonday(value: DateInput): Date {
  const start = mskStartOfDay(value);

  return mskAddDays(start, -mskWeekdayIndex(start));
}

/** The 1st, 00:00 Moscow time, of the Moscow month that contains the instant. */
export function mskStartOfMonth(value: DateInput): Date {
  const parts = mskParts(value);

  return mskDate({ year: parts.year, month: parts.month, day: 1 });
}

/** Whole Moscow calendar days from `from` to `to`: "yesterday" is 1 even if only a minute passed. */
export function calendarDaysBetweenMsk(from: DateInput, to: DateInput): number {
  return Math.round((mskStartOfDay(to).getTime() - mskStartOfDay(from).getTime()) / DAY_MS);
}

export function isSameMskDay(left: DateInput, right: DateInput): boolean {
  return mskDayKey(left) === mskDayKey(right);
}

/**
 * The 6 × 7 grid of a month calendar: 42 day keys starting on the Monday on or before the 1st
 * (the site's `getMonthDays` of the deadlines calendar, but in Moscow days).
 */
export function mskMonthGrid(year: number, month: number): string[] {
  const first = mskDate({ year, month, day: 1 });
  const gridStart = mskAddDays(first, -mskWeekdayIndex(first));

  return Array.from({ length: 42 }, (_, index) => mskDayKey(mskAddDays(gridStart, index)));
}

// ───────────────────────────── date-time pickers ─────────────────────────────

/** A day picked without a time means "by the end of that day" (the site's date-time picker). */
export const DEFAULT_PICKER_TIME = { hour: 23, minute: 59 } as const;

/** Instant of a deadline / lesson start chosen as a Moscow day and (optionally) a Moscow time. */
export function mskDateTimeOfDay(
  dayKey: string,
  time: { hour: number; minute: number } = DEFAULT_PICKER_TIME
): Date {
  const parsed = parseDayKey(dayKey);

  return parsed ? mskDate({ ...parsed, hour: time.hour, minute: time.minute }) : new Date(Number.NaN);
}

/** Moscow wall clock of an instant as "YYYY-MM-DDTHH:mm" (picker state); "" for an invalid instant. */
export function toMskDateTimeInput(value: DateInput | null | undefined): string {
  if (value === null || value === undefined) {
    return "";
  }

  const parts = mskParts(value);

  if (Number.isNaN(parts.year)) {
    return "";
  }

  return `${buildDayKey(parts.year, parts.month, parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}

/**
 * Reads "YYYY-MM-DDTHH:mm" as a MOSCOW wall clock (never the device zone) and returns the instant;
 * `null` for an empty or malformed value. Send `.toISOString()` over the wire.
 */
export function parseMskDateTimeInput(value: string): Date | null {
  const match = DATE_TIME_INPUT_PATTERN.exec(value.trim());

  if (!match) {
    return null;
  }

  const day = parseDayKey(`${match[1]}-${match[2]}-${match[3]}`);
  const hour = Number(match[4]);
  const minute = Number(match[5]);

  if (!day || hour > 23 || minute > 59) {
    return null;
  }

  return mskDate({ ...day, hour, minute });
}
