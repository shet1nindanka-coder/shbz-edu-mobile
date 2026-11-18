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
import { addDaysToDayKey } from "@/domain/moscow-time";
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

/**
 * The streak as it reads on the Moscow day `today` (pass `mskToday(now)`, with the server-corrected `now`
 * when there is one). The streak query is persisted, so a cold start offline on a later day restores a
 * response whose last day — the server's "today" — is already over. Shown as is, «Сегодня сделано» would
 * repeat that day's count and the week would mark that day as today.
 *
 * When the last entry is older than `today` the window is moved on to end at `today`: the days the cache
 * knows nothing about count 0 (it is all the screen can know), `solvedToday` is 0, and the weekly sums and
 * `currentStreak` follow the site's `buildStudentStreak` over the shifted days — a streak survives an empty
 * today only through yesterday, so it is kept on the next day when the cached day was active and is 0 two
 * days later. `bestStreak` stays. A response for `today` (fresh server data) or for a later day (a device
 * clock behind the server's) is returned unchanged.
 */
export function streakForDay(streak: StudentStreak, today: string): StudentStreak {
  const last = streak.dailyActivity.at(-1);
  // Day keys are "YYYY-MM-DD": their string order is the calendar order.
  if (!last || !(last.date < today)) return streak;
  const known = new Map(streak.dailyActivity.map((day) => [day.date, day]));
  const length = streak.dailyActivity.length;
  const dailyActivity = Array.from({ length }, (_, index) => {
    const date = addDaysToDayKey(today, index - (length - 1));
    const day = known.get(date);
    return { date, dayLabel: day?.dayLabel ?? "", count: day?.count ?? 0 };
  });
  const yesterday = addDaysToDayKey(today, -1);
  return {
    ...streak,
    currentStreak: last.date === yesterday && last.count > 0 ? streak.currentStreak : 0,
    solvedToday: 0,
    solvedThisWeek: dailyActivity.reduce((sum, day) => sum + day.count, 0),
    activeDaysThisWeek: dailyActivity.filter((day) => day.count > 0).length,
    dailyActivity,
  };
}
