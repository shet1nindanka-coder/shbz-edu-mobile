// Ported from the site (tests/report-period.test.ts): the same cases against the ported module.
// [MOBILE] Dates are built as Moscow wall-clock moments (`mskDate`) instead of device-local ones, so the
// cases hold in any process time zone.
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
import test from "node:test";
import assert from "node:assert/strict";
import { mskDate } from "@/domain/moscow-time";
import { academicYearStart, parseReportPeriod, reportPeriodStart } from "@/domain/report-period";

test("academicYearStart: с сентября — текущий год, до сентября — прошлый", () => {
  const september2026 = mskDate({ year: 2026, month: 9, day: 1 });
  const september2025 = mskDate({ year: 2025, month: 9, day: 1 });

  assert.equal(academicYearStart(mskDate({ year: 2026, month: 9, day: 4 })).getTime(), september2026.getTime());
  assert.equal(academicYearStart(mskDate({ year: 2026, month: 4, day: 10 })).getTime(), september2025.getTime());
  // The boundary is Moscow midnight: 31 August 23:59 MSK is still the previous school year.
  assert.equal(
    academicYearStart(mskDate({ year: 2026, month: 8, day: 31, hour: 23, minute: 59 })).getTime(),
    september2025.getTime()
  );
  assert.equal(academicYearStart(september2026).getTime(), september2026.getTime());
  assert.equal(september2026.toISOString(), "2026-08-31T21:00:00.000Z");
});

test("parseReportPeriod: неизвестное значение — 7 дней", () => {
  assert.equal(parseReportPeriod("30d"), "30d");
  assert.equal(parseReportPeriod("year"), "year");
  assert.equal(parseReportPeriod("garbage"), "7d");
  assert.equal(parseReportPeriod(null), "7d");
});

test("reportPeriodStart: 7 и 30 дней назад, учебный год — 1 сентября", () => {
  const now = mskDate({ year: 2026, month: 10, day: 15, hour: 12 });

  assert.equal(reportPeriodStart("7d", now).getTime(), now.getTime() - 7 * 86_400_000);
  assert.equal(reportPeriodStart("30d", now).getTime(), now.getTime() - 30 * 86_400_000);
  assert.equal(reportPeriodStart("year", now).getTime(), mskDate({ year: 2026, month: 9, day: 1 }).getTime());
});
