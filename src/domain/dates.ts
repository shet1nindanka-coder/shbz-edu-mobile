// Date formatters (the site's `lib/utils.ts` formatters plus the ad-hoc `Intl.DateTimeFormat` calls of its
// components), with two deliberate [MOBILE] differences (docs/spec/09-data-i18n-math.md §6.2):
//
// 1. Every wall-clock value is MOSCOW time, whatever the device zone is. The site formats in the device
//    zone in some client components and in Moscow time on the server; the app always uses Moscow.
// 2. No `Intl` at all. The output strings are produced from the tables below and are byte-identical to
//    `Intl.DateTimeFormat(intlLocaleOf(locale), { …, timeZone: "Europe/Moscow" })` for ru-RU / en-GB
//    (pinned by tests/domain-dates.test.ts). This removes the dependency on the JS engine's ICU data and
//    time-zone database, which differs between Hermes builds, iOS, Android and the web.
import type { Dictionary } from "@/lib/i18n/dictionary";
import { format } from "@/lib/i18n/format";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locale";

import { MINUTE_MS, dayKeyToDate, isSameMskDay, mskParts, toEpochMs, type DateInput, type MskParts } from "./moscow-time";

type MonthNames = readonly [string, string, string, string, string, string, string, string, string, string, string, string];

/** Month inside a date ("16 ноября"): genitive in Russian. */
const MONTHS_IN_DATE: Record<Locale, MonthNames> = {
  ru: ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"],
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
};

/** Abbreviated month inside a date ("16 нояб."), CLDR spellings of ru-RU / en-GB. */
const MONTHS_SHORT: Record<Locale, MonthNames> = {
  ru: ["янв.", "февр.", "мар.", "апр.", "мая", "июн.", "июл.", "авг.", "сент.", "окт.", "нояб.", "дек."],
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec"]
};

/** Stand-alone month ("ноябрь 2026 г."): nominative in Russian. */
const MONTHS_STANDALONE: Record<Locale, MonthNames> = {
  ru: ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"],
  en: MONTHS_IN_DATE.en
};

const noDateLabel: Record<Locale, string> = { ru: "Без даты", en: "No date" };

/**
 * Named formats — each mirrors one `Intl.DateTimeFormat` option set used on the site:
 *
 * | style            | options                                              | ru-RU                   | en-GB                    |
 * |------------------|------------------------------------------------------|-------------------------|--------------------------|
 * | date             | day 2-digit, month long, year numeric                | 05 ноября 2026 г.       | 05 November 2026         |
 * | shortDate        | day numeric, month long, year numeric, « г.» removed | 5 ноября 2026           | 5 November 2026          |
 * | dateTime         | dd, mm, yyyy, hh, mm                                 | 05.11.2026, 09:07       | 05/11/2026, 09:07        |
 * | dateTimeSeconds  | dateStyle short, timeStyle medium                    | 05.11.2026, 09:07:09    | 05/11/2026, 09:07:09     |
 * | dayMonth         | day numeric, month long                              | 5 ноября                | 5 November               |
 * | dayMonthPadded   | day 2-digit, month long                              | 05 ноября               | 05 November              |
 * | dayMonthShort    | day numeric, month short                             | 5 нояб.                 | 5 Nov                    |
 * | dayMonthNumeric  | day 2-digit, month 2-digit                           | 05.11                   | 05/11                    |
 * | dayMonthTime     | day numeric, month long, hour, minute                | 5 ноября в 09:07        | 5 November at 09:07      |
 * | fullDate         | day numeric, month long, year numeric                | 5 ноября 2026 г.        | 5 November 2026          |
 * | monthYear        | month long, year numeric                             | ноябрь 2026 г.          | November 2026            |
 * | time             | hour 2-digit, minute 2-digit                         | 09:07                   | 09:07                    |
 */
export type MskDateStyle =
  | "date"
  | "shortDate"
  | "dateTime"
  | "dateTimeSeconds"
  | "dayMonth"
  | "dayMonthPadded"
  | "dayMonthShort"
  | "dayMonthNumeric"
  | "dayMonthTime"
  | "fullDate"
  | "monthYear"
  | "time";

function two(value: number) {
  return String(value).padStart(2, "0");
}

function renderParts(parts: MskParts, style: MskDateStyle, locale: Locale): string {
  const ru = locale === "ru";
  const monthIndex = parts.month - 1;
  const month = MONTHS_IN_DATE[locale][monthIndex] ?? "";
  const yearSuffix = ru ? " г." : "";
  const separator = ru ? "." : "/";
  const time = `${two(parts.hour)}:${two(parts.minute)}`;
  const numericDate = `${two(parts.day)}${separator}${two(parts.month)}${separator}${parts.year}`;

  switch (style) {
    case "date":
      return `${two(parts.day)} ${month} ${parts.year}${yearSuffix}`;
    case "shortDate":
      return `${parts.day} ${month} ${parts.year}`;
    case "fullDate":
      return `${parts.day} ${month} ${parts.year}${yearSuffix}`;
    case "dateTime":
      return `${numericDate}, ${time}`;
    case "dateTimeSeconds":
      return `${numericDate}, ${time}:${two(parts.second)}`;
    case "dayMonth":
      return `${parts.day} ${month}`;
    case "dayMonthPadded":
      return `${two(parts.day)} ${month}`;
    case "dayMonthShort":
      return `${parts.day} ${MONTHS_SHORT[locale][monthIndex] ?? ""}`;
    case "dayMonthNumeric":
      return `${two(parts.day)}${separator}${two(parts.month)}`;
    case "dayMonthTime":
      return `${parts.day} ${month} ${ru ? "в" : "at"} ${time}`;
    case "monthYear":
      return `${MONTHS_STANDALONE[locale][monthIndex] ?? ""} ${parts.year}${yearSuffix}`;
    case "time":
      return time;
  }
}

/**
 * Formats an instant as Moscow wall-clock text. Returns `null` for a missing or unparsable value so the
 * caller decides what an absent date looks like (the three site formatters below print «Без даты»).
 */
export function formatMsk(
  value: DateInput | null | undefined,
  style: MskDateStyle,
  locale: Locale = DEFAULT_LOCALE
): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parts = mskParts(value);

  return Number.isNaN(parts.year) ? null : renderParts(parts, style, locale);
}

/** Formats a Moscow day key ("2026-11-05") — for timeline points, calendar cells and day headers. */
export function formatDayKey(key: string, style: MskDateStyle, locale: Locale = DEFAULT_LOCALE): string | null {
  return formatMsk(dayKeyToDate(key), style, locale);
}

// The three formatters of the site's `lib/utils.ts`, same names and signatures. A missing value prints
// «Без даты» / "No date"; so does an unparsable one (the site would throw a RangeError there).

/** «16 ноября 2026» / "16 November 2026" — card captions (no trailing « г.»). */
export function formatShortDate(value?: Date | string | null, locale: Locale = DEFAULT_LOCALE) {
  return formatMsk(value, "shortDate", locale) ?? noDateLabel[locale];
}

/** «16 ноября 2026 г.» / "16 November 2026" (two-digit day). */
export function formatDate(value?: Date | string | null, locale: Locale = DEFAULT_LOCALE) {
  return formatMsk(value, "date", locale) ?? noDateLabel[locale];
}

/** «16.11.2026, 18:00» / "16/11/2026, 18:00". */
export function formatDateTime(value?: Date | string | null, locale: Locale = DEFAULT_LOCALE) {
  return formatMsk(value, "dateTime", locale) ?? noDateLabel[locale];
}

export function toIsoDateTimeString(value?: Date | string | null) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

/** «17:00» — lesson board and live-lesson times (the site's `formatClockTime`). */
export function formatClockTime(value: DateInput, locale: Locale = DEFAULT_LOCALE) {
  return formatMsk(value, "time", locale) ?? "";
}

/** «Ноябрь 2026 г.» / "November 2026" — the month header of the deadlines calendar (first letter upper-cased). */
export function formatMonthLabel(value: DateInput, locale: Locale = DEFAULT_LOCALE) {
  const label = formatMsk(value, "monthYear", locale) ?? "";

  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** «05 ноября, 09:07» — run time of an AI check in the teacher's review list (the site's `formatRunDateTime`). */
export function formatRunDateTime(value: string | null | undefined, locale: Locale = DEFAULT_LOCALE): string | null {
  const day = formatMsk(value, "dayMonthPadded", locale);
  const time = formatMsk(value, "time", locale);

  return day !== null && time !== null ? `${day}, ${time}` : null;
}

/**
 * Relative time of a notification (the bell of the site): under a minute → «только что»; under an hour →
 * «{n} мин назад»; same Moscow day → «сегодня, 17:00»; otherwise «5 ноября, 17:00».
 * `t` is `dict.student.notifications`; `now` is the (server-corrected) clock.
 */
export function formatNotificationTime(
  value: DateInput,
  t: Pick<Dictionary["student"]["notifications"], "justNow" | "minutesAgo" | "today" | "dateTime">,
  locale: Locale = DEFAULT_LOCALE,
  now: DateInput = Date.now()
): string {
  const diffMinutes = Math.floor((toEpochMs(now) - toEpochMs(value)) / MINUTE_MS);

  if (diffMinutes < 1) {
    return t.justNow;
  }

  if (diffMinutes < 60) {
    return format(t.minutesAgo, { n: diffMinutes });
  }

  const time = formatClockTime(value, locale);

  if (isSameMskDay(value, now)) {
    return format(t.today, { time });
  }

  return format(t.dateTime, { date: formatMsk(value, "dayMonth", locale) ?? "", time });
}

/** Whole minutes since an instant, never negative (the lesson board's «{n} мин назад»). */
export function minutesSince(value: DateInput, now: DateInput = Date.now()): number {
  return Math.max(0, Math.floor((toEpochMs(now) - toEpochMs(value)) / MINUTE_MS));
}
