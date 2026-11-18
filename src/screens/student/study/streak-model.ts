// Pure rules of the «Огонёк и ритм» block (docs/spec/02-student-study.md S1, §4.3, §4.4): the texts of
// the hero and the two panels, the seven week cells, and which animation a counter change plays. No React.
import type { StudentStreak } from "@/api/types";
import { getStudentStreakColorMeta } from "@/domain/student-streak-colors";
import { getDayOfWeekIndex } from "@/domain/week-buckets";
import { format, plural, type Locale } from "@/lib/i18n";

/** `dict.student.weekly` fields the block reads. */
export type WeeklyCopy = {
  dayForms: readonly string[];
  solvedForms: readonly string[];
  noSolvedToday: string;
  daysToGo: string;
  maxColor: string;
  goalHint: string;
  streakHeadline: string;
  igniteFirst: string;
  weekSummary: string;
  dayActiveAria: string;
  dayEmptyAria: string;
};

// Moved to `@/domain/student-streak` so the app bar's streak pill reads the same day as the home widget.
export { streakForDay } from "@/domain/student-streak";

export type StreakTexts = {
  /** «3 дня подряд» / «Зажгите первый день». */
  headline: string;
  /** «2 номера» / «Без закрытых номеров». */
  solvedToday: string;
  /** «Ещё 7 дней» / «Максимальный цвет». */
  goalTitle: string;
  /** «до нового цвета огонька (10 дней)»; null at the top colour. */
  goalHint: string | null;
  /** «5 номеров закрыто за последние 7 дней.» */
  weekSummary: string;
};

export function streakTexts(streak: StudentStreak, copy: WeeklyCopy, locale: Locale): StreakTexts {
  const meta = getStudentStreakColorMeta(streak.currentStreak);
  return {
    headline:
      streak.currentStreak > 0
        ? format(copy.streakHeadline, { days: plural(locale, streak.currentStreak, copy.dayForms) })
        : copy.igniteFirst,
    solvedToday: streak.solvedToday > 0 ? plural(locale, streak.solvedToday, copy.solvedForms) : copy.noSolvedToday,
    goalTitle: meta.daysToNextThreshold
      ? format(copy.daysToGo, { days: plural(locale, meta.daysToNextThreshold, copy.dayForms) })
      : copy.maxColor,
    goalHint: meta.nextThreshold ? format(copy.goalHint, { days: plural(locale, meta.nextThreshold, copy.dayForms) }) : null,
    weekSummary: format(copy.weekSummary, { solved: plural(locale, streak.solvedThisWeek, copy.solvedForms) }),
  };
}

export type WeekCell = {
  /** Moscow day key. */
  date: string;
  /** Short weekday in the UI language, derived from the date (the response's `dayLabel` is ignored). */
  label: string;
  /** Problems closed that day. */
  count: number;
  active: boolean;
  /** The last entry of the rolling window. */
  isToday: boolean;
  accessibilityLabel: string;
};

/** The seven cells of the rolling week, oldest first; the last one is today. */
export function weekCells(streak: StudentStreak, weekdaysShort: readonly string[], copy: WeeklyCopy): WeekCell[] {
  const todayDate = streak.dailyActivity.at(-1)?.date;
  return streak.dailyActivity.map((day) => {
    const label = weekdaysShort[getDayOfWeekIndex(day.date)] ?? "";
    const active = day.count > 0;
    return {
      date: day.date,
      label,
      count: day.count,
      active,
      isToday: day.date === todayDate,
      accessibilityLabel: active
        ? format(copy.dayActiveAria, { day: label, count: day.count })
        : format(copy.dayEmptyAria, { day: label }),
    };
  });
}

/** `ignite` — 0 → above 0; `grow` — an increase; `drop` — a decrease (the site's `useStreakMotion`). */
export type StreakMotion = "ignite" | "grow" | "drop";

export function streakMotionKind(previous: number, next: number): StreakMotion | null {
  if (next === previous) return null;
  if (next > previous) return previous === 0 ? "ignite" : "grow";
  return "drop";
}

/** `#rrggbb` with an alpha as `rgba(r, g, b, a)` — the glow of the streak animation is the flame colour, thinned. */
export function hexWithAlpha(hex: string, alpha: number): string {
  const [r, g, b] = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
