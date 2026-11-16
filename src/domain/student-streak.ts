// Ported from the site (lib/student-streak.ts): `buildStudentStreak` is unchanged.
// [MOBILE] The site's DB wrappers (`computeStudentStreak`, `getStudentStreakSnapshot`) are replaced by the
// pure `computeStudentStreak(rows, now, locale)`, which builds the day entries from status rows first
// (see `buildProgressTimelineEntries` in ./progress-timeline).
import { type Locale } from "@/lib/i18n";
import { getDictionary } from "@/i18n/get-dictionary";
import {
  MAX_TIMELINE_DAYS,
  buildProgressTimelineEntries,
  type TimelineEntry,
  type TimelineStatusRow
} from "@/domain/progress-timeline";
import { getDayOfWeekIndex } from "@/domain/week-buckets";

/** The streak looks back this many Moscow days (today included). */
export const STREAK_WINDOW_DAYS = MAX_TIMELINE_DAYS;

export type StudentStreak = {
  currentStreak: number;
  bestStreak: number;
  solvedToday: number;
  solvedThisWeek: number;
  activeDaysThisWeek: number;
  dailyActivity: {
    date: string;
    dayLabel: string;
    count: number;
  }[];
};

export function buildStudentStreak(entries: TimelineEntry[], locale: Locale = "ru"): StudentStreak {
  const shortDayNames = getDictionary(locale).student.weekdaysShort;
  const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date));

  const todayEntry = sorted[0];
  const solvedToday = todayEntry ? todayEntry.closedCount : 0;

  // Current streak: consecutive days with closedCount > 0, starting from today/yesterday
  let currentStreak = 0;
  let streakStartIndex = 0;

  // If today has 0 solved, check if it's still early — start from yesterday
  if (sorted[0] && sorted[0].closedCount === 0) {
    streakStartIndex = 1;
  }

  for (let i = streakStartIndex; i < sorted.length; i++) {
    if (sorted[i]!.closedCount > 0) {
      currentStreak++;
    } else {
      break;
    }
  }

  // Best streak
  let bestStreak = 0;
  let tempStreak = 0;

  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i]!.closedCount > 0) {
      tempStreak++;
      bestStreak = Math.max(bestStreak, tempStreak);
    } else {
      tempStreak = 0;
    }
  }

  // Last 7 days activity
  const last7 = sorted.slice(0, 7).reverse();
  const solvedThisWeek = last7.reduce((sum, e) => sum + e.closedCount, 0);
  const activeDaysThisWeek = last7.filter((entry) => entry.closedCount > 0).length;

  const dailyActivity = last7.map((entry) => ({
    date: entry.date,
    dayLabel: shortDayNames[getDayOfWeekIndex(entry.date)]!,
    count: entry.closedCount
  }));

  return {
    currentStreak,
    bestStreak,
    solvedToday,
    solvedThisWeek,
    activeDaysThisWeek,
    dailyActivity
  };
}

/**
 * The streak of one student from their CURRENT status rows: every marked row counts once, on the Moscow day
 * its colour last changed, over the last 112 days (the site's `computeStudentStreak`).
 */
export function computeStudentStreak(
  rows: TimelineStatusRow[],
  now: Date | string | number = Date.now(),
  locale: Locale = "ru"
): StudentStreak {
  return buildStudentStreak(buildProgressTimelineEntries(rows, STREAK_WINDOW_DAYS, now), locale);
}
