// Moscow-time helpers: day keys, day arithmetic, week / month boundaries, picker conversions — and the
// guarantee the whole app relies on: the results do NOT depend on the device (process) time zone.
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DAY_MS,
  DEFAULT_PICKER_TIME,
  SCHOOL_TIME_ZONE,
  SCHOOL_UTC_OFFSET_MINUTES,
  addDaysToDayKey,
  calendarDaysBetweenMsk,
  dayKeyToDate,
  isDayKey,
  isSameMskDay,
  mskAddDays,
  mskDate,
  mskDateTimeOfDay,
  mskDayKey,
  mskMonday,
  mskMonthGrid,
  mskParts,
  mskStartOfDay,
  mskStartOfMonth,
  mskToday,
  mskWeekdayIndex,
  parseDayKey,
  parseMskDateTimeInput,
  toEpochMs,
  toMskDateTimeInput
} from "@/domain/moscow-time";

// Only `process.env.TZ` is needed; the project does not load `@types/node` globally.
declare const process: { env: Record<string, string | undefined> };

/** Zones on both sides of Moscow, with and without DST, including the two extremes of the date line. */
const DEVICE_ZONES = [
  "UTC",
  "Europe/Moscow",
  "Asia/Vladivostok",
  "America/Los_Angeles",
  "Europe/London",
  "Pacific/Kiritimati",
  "Pacific/Pago_Pago",
  "Asia/Kolkata"
];

/** Runs `body` once per device zone (Node re-reads `TZ` when it is assigned) and restores the original. */
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

describe("moscow-time: constants", () => {
  it("names the school zone and its fixed offset", () => {
    assert.equal(SCHOOL_TIME_ZONE, "Europe/Moscow");
    assert.equal(SCHOOL_UTC_OFFSET_MINUTES, 180);
    assert.equal(DAY_MS, 86_400_000);
  });
});

describe("moscow-time: the device zone really changes inside the test (sanity)", () => {
  it("switching TZ moves the local clock, so the zone loop below is meaningful", () => {
    const instant = new Date("2026-11-16T20:30:00.000Z");
    const localHours = new Set<number>();
    const offsets = new Set<number>();

    inEveryZone(() => {
      localHours.add(instant.getHours());
      offsets.add(instant.getTimezoneOffset());
    });

    assert.ok(localHours.size >= 6, `local hours seen: ${[...localHours].join(",")}`);
    assert.ok(offsets.has(0) && offsets.has(-600) && offsets.has(-180));
  });
});

describe("moscow-time: wall clock of an instant", () => {
  it("reads Moscow fields from any instant representation", () => {
    const expected = { year: 2026, month: 11, day: 16, hour: 23, minute: 30, second: 5, millisecond: 7, weekday: 0 };

    inEveryZone(() => {
      assert.deepEqual(mskParts("2026-11-16T20:30:05.007Z"), expected);
      assert.deepEqual(mskParts(new Date("2026-11-16T20:30:05.007Z")), expected);
      assert.deepEqual(mskParts(Date.UTC(2026, 10, 16, 20, 30, 5, 7)), expected);
    });
  });

  it("rolls the day over at Moscow midnight, not at UTC or device midnight", () => {
    inEveryZone(() => {
      assert.equal(mskDayKey("2026-11-16T20:59:59.999Z"), "2026-11-16");
      assert.equal(mskDayKey("2026-11-16T21:00:00.000Z"), "2026-11-17");
      assert.equal(mskDayKey("2026-12-31T21:00:00.000Z"), "2027-01-01");
      assert.equal(mskDayKey("2024-02-28T21:00:00.000Z"), "2024-02-29");
      assert.equal(mskToday("2026-11-16T21:30:00.000Z"), "2026-11-17");
    });
  });

  it("counts weekdays from Monday", () => {
    inEveryZone(() => {
      assert.equal(mskWeekdayIndex("2026-11-16T09:00:00.000Z"), 0); // Monday
      assert.equal(mskWeekdayIndex("2026-11-21T09:00:00.000Z"), 5); // Saturday
      assert.equal(mskWeekdayIndex("2026-11-22T09:00:00.000Z"), 6); // Sunday
      // Sunday 22:00 UTC is already Monday in Moscow.
      assert.equal(mskWeekdayIndex("2026-11-22T22:00:00.000Z"), 0);
    });
  });

  it("propagates an invalid instant as NaN instead of throwing", () => {
    assert.ok(Number.isNaN(toEpochMs("not-a-date")));
    assert.ok(Number.isNaN(mskParts("not-a-date").year));
    assert.ok(Number.isNaN(mskStartOfDay("not-a-date").getTime()));
  });
});

describe("moscow-time: building instants from a Moscow wall clock", () => {
  it("mskDate is the inverse of mskParts", () => {
    inEveryZone(() => {
      const instant = mskDate({ year: 2026, month: 11, day: 16, hour: 18, minute: 0 });

      assert.equal(instant.toISOString(), "2026-11-16T15:00:00.000Z");
      assert.deepEqual(mskParts(instant), {
        year: 2026, month: 11, day: 16, hour: 18, minute: 0, second: 0, millisecond: 0, weekday: 0
      });
      // Just after Moscow midnight is still the previous day in UTC.
      assert.equal(mskDate({ year: 2026, month: 1, day: 1 }).toISOString(), "2025-12-31T21:00:00.000Z");
    });
  });

  it("rolls out-of-range fields over like Date.UTC", () => {
    assert.equal(mskDayKey(mskDate({ year: 2026, month: 3, day: 0 })), "2026-02-28");
    assert.equal(mskDayKey(mskDate({ year: 2026, month: 13, day: 1 })), "2027-01-01");
    assert.equal(mskDayKey(mskDate({ year: 2026, month: 11, day: 16, hour: 24 })), "2026-11-17");
  });
});

describe("moscow-time: day keys", () => {
  it("parses only real calendar days", () => {
    assert.deepEqual(parseDayKey("2026-11-16"), { year: 2026, month: 11, day: 16 });
    assert.deepEqual(parseDayKey("2024-02-29"), { year: 2024, month: 2, day: 29 });
    assert.equal(parseDayKey("2026-02-29"), null);
    assert.equal(parseDayKey("2026-13-01"), null);
    assert.equal(parseDayKey("2026-11-31"), null);
    assert.equal(parseDayKey("2026-1-5"), null);
    assert.equal(parseDayKey("2026-11-16T00:00"), null);
    assert.equal(parseDayKey(""), null);
    assert.equal(isDayKey("2026-11-16"), true);
    assert.equal(isDayKey("16.11.2026"), false);
    assert.equal(isDayKey(20261116), false);
  });

  it("maps a day key to Moscow midnight and back", () => {
    inEveryZone(() => {
      assert.equal(dayKeyToDate("2026-11-16").toISOString(), "2026-11-15T21:00:00.000Z");
      assert.equal(mskDayKey(dayKeyToDate("2026-11-16")), "2026-11-16");
      assert.ok(Number.isNaN(dayKeyToDate("2026-02-30").getTime()));
    });
  });

  it("adds days across month, year and leap-day boundaries", () => {
    inEveryZone(() => {
      assert.equal(addDaysToDayKey("2026-11-30", 1), "2026-12-01");
      assert.equal(addDaysToDayKey("2026-12-31", 1), "2027-01-01");
      assert.equal(addDaysToDayKey("2024-02-28", 1), "2024-02-29");
      assert.equal(addDaysToDayKey("2026-03-01", -1), "2026-02-28");
      assert.equal(addDaysToDayKey("2026-11-16", -111), "2026-07-28");
      assert.equal(addDaysToDayKey("2026-11-16", 0), "2026-11-16");
    });
  });

  it("every day is exactly 24 h — also across the dates where other zones switch DST", () => {
    inEveryZone(() => {
      // 29 March 2026 (EU spring forward) and 8 March 2026 (US spring forward).
      for (const key of ["2026-03-07", "2026-03-08", "2026-03-28", "2026-03-29", "2026-10-24", "2026-10-25", "2026-11-01"]) {
        const start = dayKeyToDate(key);
        const next = dayKeyToDate(addDaysToDayKey(key, 1));

        assert.equal(next.getTime() - start.getTime(), DAY_MS, key);
        assert.equal(mskAddDays(start, 1).getTime(), next.getTime(), key);
      }
    });
  });
});

describe("moscow-time: day, week and month boundaries", () => {
  it("start of day / Monday / start of month are Moscow midnights", () => {
    inEveryZone(() => {
      // Thursday 19 November 2026, 02:30 Moscow time (= Wednesday 23:30 UTC).
      const instant = "2026-11-18T23:30:00.000Z";

      assert.equal(mskStartOfDay(instant).toISOString(), "2026-11-18T21:00:00.000Z");
      assert.equal(mskMonday(instant).toISOString(), "2026-11-15T21:00:00.000Z");
      assert.equal(mskStartOfMonth(instant).toISOString(), "2026-10-31T21:00:00.000Z");
      // A Monday is its own Monday; Sunday 23:59 belongs to the week that started six days earlier.
      assert.equal(mskMonday("2026-11-15T21:00:00.000Z").toISOString(), "2026-11-15T21:00:00.000Z");
      assert.equal(mskMonday("2026-11-22T20:59:00.000Z").toISOString(), "2026-11-15T21:00:00.000Z");
    });
  });

  it("counts calendar days, not 24-hour spans", () => {
    inEveryZone(() => {
      // 23:59 → 00:01 Moscow time: one calendar day, two minutes apart.
      assert.equal(calendarDaysBetweenMsk("2026-08-20T20:59:00.000Z", "2026-08-20T21:01:00.000Z"), 1);
      // 00:01 → 23:59 of the same Moscow day: zero.
      assert.equal(calendarDaysBetweenMsk("2026-08-20T21:01:00.000Z", "2026-08-21T20:59:00.000Z"), 0);
      assert.equal(calendarDaysBetweenMsk("2026-07-22T09:00:00.000Z", "2026-08-21T09:00:00.000Z"), 30);
      assert.equal(calendarDaysBetweenMsk("2026-08-21T09:00:00.000Z", "2026-07-22T09:00:00.000Z"), -30);
      assert.equal(isSameMskDay("2026-08-20T21:01:00.000Z", "2026-08-21T20:59:00.000Z"), true);
      assert.equal(isSameMskDay("2026-08-20T20:59:00.000Z", "2026-08-20T21:01:00.000Z"), false);
    });
  });

  it("builds a 6 × 7 month grid that starts on Monday", () => {
    inEveryZone(() => {
      const november = mskMonthGrid(2026, 11); // 1 November 2026 is a Sunday

      assert.equal(november.length, 42);
      assert.equal(november[0], "2026-10-26");
      assert.equal(november[6], "2026-11-01");
      assert.equal(november[41], "2026-12-06");
      assert.equal(new Set(november).size, 42);

      const june = mskMonthGrid(2026, 6); // 1 June 2026 is a Monday
      assert.equal(june[0], "2026-06-01");

      for (const [index, key] of november.entries()) {
        assert.equal(mskWeekdayIndex(dayKeyToDate(key)), index % 7);
      }
    });
  });
});

describe("moscow-time: date-time pickers", () => {
  it("a day without a time means 23:59 Moscow time", () => {
    inEveryZone(() => {
      assert.deepEqual(DEFAULT_PICKER_TIME, { hour: 23, minute: 59 });
      assert.equal(mskDateTimeOfDay("2026-11-16").toISOString(), "2026-11-16T20:59:00.000Z");
      assert.equal(mskDateTimeOfDay("2026-11-16", { hour: 17, minute: 0 }).toISOString(), "2026-11-16T14:00:00.000Z");
      assert.ok(Number.isNaN(mskDateTimeOfDay("nope").getTime()));
    });
  });

  it("reads and writes picker values as Moscow wall clock, never the device zone", () => {
    inEveryZone(() => {
      assert.equal(parseMskDateTimeInput("2026-11-16T18:00")?.toISOString(), "2026-11-16T15:00:00.000Z");
      assert.equal(parseMskDateTimeInput("2026-11-16T00:30")?.toISOString(), "2026-11-15T21:30:00.000Z");
      assert.equal(toMskDateTimeInput("2026-11-16T15:00:00.000Z"), "2026-11-16T18:00");
      assert.equal(toMskDateTimeInput(new Date("2026-11-15T21:30:00.000Z")), "2026-11-16T00:30");
      assert.equal(toMskDateTimeInput(parseMskDateTimeInput("2027-01-01T00:00")), "2027-01-01T00:00");
    });
  });

  it("rejects malformed picker values", () => {
    assert.equal(parseMskDateTimeInput(""), null);
    assert.equal(parseMskDateTimeInput("2026-11-16"), null);
    assert.equal(parseMskDateTimeInput("2026-11-16T24:00"), null);
    assert.equal(parseMskDateTimeInput("2026-11-16T12:60"), null);
    assert.equal(parseMskDateTimeInput("2026-02-30T12:00"), null);
    assert.equal(toMskDateTimeInput(null), "");
    assert.equal(toMskDateTimeInput(undefined), "");
    assert.equal(toMskDateTimeInput("garbage"), "");
  });
});
