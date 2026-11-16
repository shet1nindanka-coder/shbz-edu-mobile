// Ported from the site (lib/report-period.ts). [MOBILE] The site reads the process-local clock (TZ=Europe/Moscow);
// here every calendar-day computation goes through the fixed-offset helpers of ./moscow-time, so the result
// is the same on a device in any time zone.
// Периоды отчётов (PDF ученика, PDF посещаемости группы): 7 дней, 30 дней,
// учебный год. Чистая логика, покрыта тестами.

import { mskDate, mskParts } from "./moscow-time";

export type ReportPeriod = "7d" | "30d" | "year";

export const REPORT_PERIOD_META: Record<ReportPeriod, { title: string; fileLabel: string }> = {
  "7d": { title: "7 ДНЕЙ", fileLabel: "Неделя" },
  "30d": { title: "30 ДНЕЙ", fileLabel: "30 дней" },
  year: { title: "УЧЕБНЫЙ ГОД", fileLabel: "Учебный год" }
};

/** Начало учебного года: 1 сентября текущего года, а до сентября — прошлого. */
export function academicYearStart(now: Date) {
  const parts = mskParts(now);
  const year = parts.month >= 9 ? parts.year : parts.year - 1;

  // 1 September, 00:00 Moscow time.
  return mskDate({ year, month: 9, day: 1 });
}

export function parseReportPeriod(raw: string | null | undefined): ReportPeriod {
  return raw === "30d" || raw === "year" ? raw : "7d";
}

/** Начало периода относительно «сейчас». */
export function reportPeriodStart(period: ReportPeriod, now: Date) {
  if (period === "year") {
    return academicYearStart(now);
  }

  return new Date(now.getTime() - (period === "30d" ? 30 : 7) * 24 * 60 * 60 * 1000);
}
