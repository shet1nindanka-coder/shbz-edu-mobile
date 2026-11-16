// Ported from the site (tests/week-buckets.test.ts): the same cases against the ported module.
// [MOBILE] Dates are built and read as Moscow wall-clock moments (`mskDate` / `mskParts`) instead of
// device-local ones, so the cases hold in any process time zone.
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
import test from "node:test";
import assert from "node:assert/strict";
import { mskDate, mskParts } from "@/domain/moscow-time";
import { buildWeekBuckets, countByWeek, getDayOfWeekIndex, mondayOf } from "@/domain/week-buckets";

/** Moscow wall-clock moment; `month` is 0-based like the `Date` constructor the site tests use. */
function msk(year: number, month: number, day: number, hour = 0, minute = 0) {
  return mskDate({ year, month: month + 1, day, hour, minute });
}

test("mondayOf возвращает понедельник 00:00 текущей недели", () => {
  // 21 августа 2026 — пятница; понедельник той недели — 17 августа.
  const friday = msk(2026, 7, 21, 15, 30);
  const monday = mondayOf(friday);
  const parts = mskParts(monday);

  assert.equal(parts.year, 2026);
  assert.equal(parts.month, 8);
  assert.equal(parts.day, 17);
  assert.equal(parts.hour, 0);
  assert.equal(parts.minute, 0);
  assert.equal(monday.toISOString(), "2026-08-16T21:00:00.000Z");

  // Понедельник остаётся своим же понедельником.
  assert.equal(mondayOf(monday).getTime(), monday.getTime());

  // Воскресенье относится к неделе прошедшего понедельника, а не следующего.
  const sunday = msk(2026, 7, 23, 23, 59);
  assert.equal(mskParts(mondayOf(sunday)).day, 17);

  // 00:30 Moscow time on Monday is still Sunday evening in UTC — the week is decided by the Moscow day.
  assert.equal(mskParts(mondayOf(msk(2026, 7, 24, 0, 30))).day, 24);
});

test("buildWeekBuckets: последние N недель от старой к новой, текущая — последняя", () => {
  const now = msk(2026, 7, 21, 12, 0);
  const buckets = buildWeekBuckets(now, 4);

  assert.equal(buckets.length, 4);
  assert.equal(mskParts(buckets[3].start).day, 17); // текущая неделя
  assert.equal(mskParts(buckets[2].start).day, 10);
  assert.equal(mskParts(buckets[1].start).day, 3);
  assert.equal(mskParts(buckets[0].start).day, 27); // 27 июля
  assert.equal(mskParts(buckets[0].start).month, 7);

  for (const bucket of buckets) {
    assert.equal(bucket.end.getTime() - bucket.start.getTime(), 7 * 24 * 60 * 60 * 1000);
  }
});

test("countByWeek раскладывает даты по корзинам, границы — [start, end)", () => {
  const now = msk(2026, 7, 21, 12, 0);
  const buckets = buildWeekBuckets(now, 3); // 3, 10, 17 августа

  const counts = countByWeek(
    [
      msk(2026, 7, 3, 0, 0), // ровно старт первой корзины → входит
      msk(2026, 7, 9, 23, 59), // конец первой недели → входит в первую
      msk(2026, 7, 10, 0, 0), // ровно старт второй → входит во вторую
      msk(2026, 7, 21, 18, 0), // текущая неделя
      msk(2026, 6, 1, 12, 0), // старше диапазона → не считается
      msk(2026, 7, 24, 0, 0) // следующая неделя (будущее) → не считается
    ],
    buckets
  );

  assert.deepEqual(counts, [2, 1, 1]);
});

test("getDayOfWeekIndex: Пн = 0 … Вс = 6 для ключа дня", () => {
  assert.equal(getDayOfWeekIndex("2026-08-17"), 0); // понедельник
  assert.equal(getDayOfWeekIndex("2026-08-21"), 4); // пятница
  assert.equal(getDayOfWeekIndex("2026-08-23"), 6); // воскресенье
});
