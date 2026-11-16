// Date formatters: fixed expectations from the spec (docs/spec/09-data-i18n-math.md §6.1), byte-for-byte
// parity with what the site prints (`Intl.DateTimeFormat` in the Europe/Moscow zone), and independence
// from the device time zone.
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatClockTime,
  formatDate,
  formatDateTime,
  formatDayKey,
  formatMonthLabel,
  formatMsk,
  formatNotificationTime,
  formatRunDateTime,
  formatShortDate,
  minutesSince,
  toIsoDateTimeString,
  type MskDateStyle
} from "@/domain/dates";
import { getDictionary } from "@/i18n/get-dictionary";
import { intlLocaleOf, type Locale } from "@/lib/i18n/locale";

declare const process: { env: Record<string, string | undefined> };

const LOCALES: Locale[] = ["ru", "en"];
const DEVICE_ZONES = ["UTC", "Asia/Vladivostok", "America/Los_Angeles", "Europe/Moscow", "Pacific/Kiritimati"];

function inEveryZone(body: (zone: string) => void) {
  const original = process.env.TZ;

  try {
    for (const zone of DEVICE_ZONES) {
      process.env.TZ = zone;
      body(zone);
    }
  } finally {
    if (original === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = original;
    }
  }
}

/** The `Intl.DateTimeFormat` options each named style stands for (what the site passes). */
const INTL_OPTIONS: Record<MskDateStyle, Intl.DateTimeFormatOptions> = {
  date: { day: "2-digit", month: "long", year: "numeric" },
  shortDate: { day: "numeric", month: "long", year: "numeric" },
  fullDate: { day: "numeric", month: "long", year: "numeric" },
  dateTime: { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" },
  dateTimeSeconds: { dateStyle: "short", timeStyle: "medium" },
  dayMonth: { day: "numeric", month: "long" },
  dayMonthPadded: { day: "2-digit", month: "long" },
  dayMonthShort: { day: "numeric", month: "short" },
  dayMonthNumeric: { day: "2-digit", month: "2-digit" },
  dayMonthTime: { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" },
  monthYear: { month: "long", year: "numeric" },
  time: { hour: "2-digit", minute: "2-digit" }
};

function intlReference(value: Date, style: MskDateStyle, locale: Locale) {
  const text = new Intl.DateTimeFormat(intlLocaleOf(locale), { ...INTL_OPTIONS[style], timeZone: "Europe/Moscow" }).format(value);

  // `formatShortDate` on the site strips the trailing « г.».
  return style === "shortDate" ? text.replace(/\s*г\.$/, "") : text;
}

describe("dates: the site's three formatters", () => {
  it("prints the spec examples in both languages", () => {
    const value = "2026-11-16T15:00:00.000Z"; // 18:00 Moscow time

    assert.equal(formatDate(value), "16 ноября 2026 г.");
    assert.equal(formatDate(value, "ru"), "16 ноября 2026 г.");
    assert.equal(formatDate(value, "en"), "16 November 2026");
    assert.equal(formatShortDate(value), "16 ноября 2026");
    assert.equal(formatShortDate(value, "en"), "16 November 2026");
    assert.equal(formatDateTime(value), "16.11.2026, 18:00");
    assert.equal(formatDateTime(value, "en"), "16/11/2026, 18:00");
    assert.equal(formatDate(new Date(value)), "16 ноября 2026 г.");
  });

  it("pads the day in `formatDate` but not in `formatShortDate`", () => {
    const value = "2026-04-05T09:07:00.000Z";

    assert.equal(formatDate(value), "05 апреля 2026 г.");
    assert.equal(formatShortDate(value), "5 апреля 2026");
    assert.equal(formatDate(value, "en"), "05 April 2026");
    assert.equal(formatShortDate(value, "en"), "5 April 2026");
    assert.equal(formatDateTime(value, "en"), "05/04/2026, 12:07");
  });

  it("prints «Без даты» / \"No date\" for a missing or unparsable value", () => {
    assert.equal(formatDate(null), "Без даты");
    assert.equal(formatDate(undefined), "Без даты");
    assert.equal(formatDate(""), "Без даты");
    assert.equal(formatShortDate(null, "en"), "No date");
    assert.equal(formatDateTime(null, "en"), "No date");
    assert.equal(formatDateTime("not-a-date"), "Без даты");
    assert.equal(formatDate(null), getDictionary("ru").common.noDate);
    assert.equal(formatDate(null, "en"), getDictionary("en").common.noDate);
  });

  it("toIsoDateTimeString normalises to the wire format", () => {
    assert.equal(toIsoDateTimeString("2026-11-16T18:00:00+03:00"), "2026-11-16T15:00:00.000Z");
    assert.equal(toIsoDateTimeString(new Date(Date.UTC(2026, 0, 1))), "2026-01-01T00:00:00.000Z");
    assert.equal(toIsoDateTimeString(null), null);
    assert.equal(toIsoDateTimeString("nope"), null);
  });
});

describe("dates: named styles", () => {
  it("prints every style as documented", () => {
    const value = "2026-11-05T06:07:09.000Z"; // 09:07:09 Moscow time
    const expected: Record<MskDateStyle, [string, string]> = {
      date: ["05 ноября 2026 г.", "05 November 2026"],
      shortDate: ["5 ноября 2026", "5 November 2026"],
      fullDate: ["5 ноября 2026 г.", "5 November 2026"],
      dateTime: ["05.11.2026, 09:07", "05/11/2026, 09:07"],
      dateTimeSeconds: ["05.11.2026, 09:07:09", "05/11/2026, 09:07:09"],
      dayMonth: ["5 ноября", "5 November"],
      dayMonthPadded: ["05 ноября", "05 November"],
      dayMonthShort: ["5 нояб.", "5 Nov"],
      dayMonthNumeric: ["05.11", "05/11"],
      dayMonthTime: ["5 ноября в 09:07", "5 November at 09:07"],
      monthYear: ["ноябрь 2026 г.", "November 2026"],
      time: ["09:07", "09:07"]
    };

    for (const [style, [ru, en]] of Object.entries(expected) as [MskDateStyle, [string, string]][]) {
      assert.equal(formatMsk(value, style, "ru"), ru, `${style} ru`);
      assert.equal(formatMsk(value, style, "en"), en, `${style} en`);
    }
  });

  it("uses a 24-hour clock with midnight as 00", () => {
    assert.equal(formatClockTime("2026-11-05T21:07:00.000Z"), "00:07");
    assert.equal(formatClockTime("2026-11-05T21:07:00.000Z", "en"), "00:07");
    assert.equal(formatClockTime("2026-11-05T14:00:00.000Z", "en"), "17:00");
    assert.equal(formatClockTime("garbage"), "");
  });

  it("returns null for a missing value so the caller picks the placeholder", () => {
    assert.equal(formatMsk(null, "date"), null);
    assert.equal(formatMsk(undefined, "time"), null);
    assert.equal(formatMsk("", "dateTime"), null);
    assert.equal(formatMsk("garbage", "dayMonth"), null);
    assert.equal(formatMsk(Number.NaN, "dayMonth"), null);
    assert.equal(formatDayKey("2026-02-30", "dayMonth"), null);
  });

  it("formats day keys, month labels and check run times", () => {
    assert.equal(formatDayKey("2026-02-20", "dayMonthShort"), "20 февр.");
    assert.equal(formatDayKey("2026-09-01", "dayMonthShort", "en"), "1 Sept");
    assert.equal(formatDayKey("2026-05-09", "fullDate"), "9 мая 2026 г.");
    assert.equal(formatMonthLabel("2026-11-16T15:00:00.000Z"), "Ноябрь 2026 г.");
    assert.equal(formatMonthLabel("2026-11-16T15:00:00.000Z", "en"), "November 2026");
    assert.equal(formatRunDateTime("2026-11-05T06:07:00.000Z"), "05 ноября, 09:07");
    assert.equal(formatRunDateTime("2026-11-05T06:07:00.000Z", "en"), "05 November, 09:07");
    assert.equal(formatRunDateTime(null), null);
    assert.equal(formatRunDateTime("garbage"), null);
  });
});

describe("dates: parity with the site's Intl output", () => {
  // The app formats without `Intl`; this pins the tables to what `Intl` prints for ru-RU / en-GB today.
  it("matches Intl.DateTimeFormat (timeZone Europe/Moscow) for every style, month and locale", () => {
    const instants: Date[] = [];

    for (let month = 0; month < 12; month += 1) {
      // A single- and a double-digit day, early morning and late evening (both cross a UTC day boundary).
      instants.push(new Date(Date.UTC(2026, month, 3, 22, 4, 5)));
      instants.push(new Date(Date.UTC(2026, month, 17, 0, 59, 58)));
      instants.push(new Date(Date.UTC(2027, month, 28, 11, 30, 0)));
    }

    for (const locale of LOCALES) {
      for (const style of Object.keys(INTL_OPTIONS) as MskDateStyle[]) {
        for (const instant of instants) {
          assert.equal(
            formatMsk(instant, style, locale),
            intlReference(instant, style, locale),
            `${style} ${locale} ${instant.toISOString()}`
          );
        }
      }
    }
  });
});

describe("dates: independence from the device zone", () => {
  it("prints the same Moscow time in every device zone", () => {
    const value = "2026-11-16T21:30:00.000Z"; // 00:30 on 17 November in Moscow

    inEveryZone((zone) => {
      assert.equal(formatDate(value), "17 ноября 2026 г.", zone);
      assert.equal(formatShortDate(value, "en"), "17 November 2026", zone);
      assert.equal(formatDateTime(value), "17.11.2026, 00:30", zone);
      assert.equal(formatClockTime(value), "00:30", zone);
      assert.equal(formatMsk(value, "dayMonthTime", "en"), "17 November at 00:30", zone);
      assert.equal(formatDayKey("2026-11-17", "dayMonth"), "17 ноября", zone);
      assert.equal(formatMonthLabel(value, "en"), "November 2026", zone);
    });
  });
});

describe("dates: notification time", () => {
  const ru = getDictionary("ru").student.notifications;
  const en = getDictionary("en").student.notifications;
  const now = "2026-11-16T15:00:00.000Z"; // 18:00 Moscow time

  it("is relative for the last hour", () => {
    assert.equal(formatNotificationTime("2026-11-16T14:59:30.000Z", ru, "ru", now), "только что");
    assert.equal(formatNotificationTime("2026-11-16T14:59:00.000Z", ru, "ru", now), "1 мин назад");
    assert.equal(formatNotificationTime("2026-11-16T14:01:00.000Z", ru, "ru", now), "59 мин назад");
    assert.equal(formatNotificationTime("2026-11-16T14:35:00.000Z", en, "en", now), "25 min ago");
    assert.equal(formatNotificationTime("2026-11-16T15:00:00.000Z", en, "en", now), "just now");
    // A clock skew that puts the notification "in the future" still reads as fresh.
    assert.equal(formatNotificationTime("2026-11-16T15:05:00.000Z", ru, "ru", now), "только что");
  });

  it("switches to «сегодня» and then to a date by the MOSCOW day", () => {
    assert.equal(formatNotificationTime("2026-11-16T14:00:00.000Z", ru, "ru", now), "сегодня, 17:00");
    assert.equal(formatNotificationTime("2026-11-16T06:05:00.000Z", en, "en", now), "today, 09:05");
    // 00:10 Moscow time today is still "yesterday" in UTC — it must read as today.
    assert.equal(formatNotificationTime("2026-11-15T21:10:00.000Z", ru, "ru", now), "сегодня, 00:10");
    // 23:50 Moscow time yesterday.
    assert.equal(formatNotificationTime("2026-11-15T20:50:00.000Z", ru, "ru", now), "15 ноября, 23:50");
    assert.equal(formatNotificationTime("2026-11-05T06:07:00.000Z", en, "en", now), "5 November, 09:07");
  });

  it("does not depend on the device zone", () => {
    inEveryZone((zone) => {
      assert.equal(formatNotificationTime("2026-11-15T21:10:00.000Z", ru, "ru", now), "сегодня, 00:10", zone);
      assert.equal(formatNotificationTime("2026-11-15T20:50:00.000Z", en, "en", now), "15 November, 23:50", zone);
    });
  });

  it("minutesSince never goes negative", () => {
    assert.equal(minutesSince("2026-11-16T14:35:20.000Z", now), 24);
    assert.equal(minutesSince("2026-11-16T15:00:00.000Z", now), 0);
    assert.equal(minutesSince("2026-11-16T15:10:00.000Z", now), 0);
  });
});
