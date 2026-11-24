// Pure rules of the homework deadline blocks (docs/spec/02-student-study.md S1, S4, §4.5, §4.9): which
// homeworks are "upcoming", how the month grid is marked and which day the calendar opens on. No React.
import type { HomeworkDeadlineSummary } from "@/api/types";
import { formatDayKey, formatMonthLabel } from "@/domain/dates";
import { calendarDaysBetweenMsk, dayKeyToDate, mskDate, mskDayKey, mskMonthGrid, mskParts, mskWeekdayIndex, parseDayKey } from "@/domain/moscow-time";
import { isHomeworkOverdue } from "@/domain/statuses";
import { mapStudentHomeworksToDeadlineItems } from "@/domain/student-deadline-groups";
import type { Locale } from "@/lib/i18n";

/** One homework with a deadline: `{ id, label, assignmentId, deadlineAt, totalNumbers, solvedNumbers, status }`. */
export type DeadlineItem = ReturnType<typeof mapStudentHomeworksToDeadlineItems>[number];

/** The site's `UpcomingDeadlinesCard limit={4}`: one hero + up to three list cards. */
export const UPCOMING_LIMIT = 4;

/** Homeworks that have a deadline, sorted by it; the label «ДЗ 2 · Тема» is built in the UI language. */
export function toDeadlineItems(items: readonly HomeworkDeadlineSummary[], locale: Locale): DeadlineItem[] {
  return mapStudentHomeworksToDeadlineItems([...items], locale);
}

/** Unfinished homeworks by deadline, nearest first. Overdue ones are included and therefore lead. */
export function selectUpcoming(items: readonly DeadlineItem[], limit: number = UPCOMING_LIMIT): DeadlineItem[] {
  return items
    .filter((item) => item.status !== "DONE")
    .sort((left, right) => new Date(left.deadlineAt).getTime() - new Date(right.deadlineAt).getTime())
    .slice(0, limit);
}

// ───────────────────────────── calendar ─────────────────────────────

/** A calendar month; `month` is 1–12. */
export type CalendarMonth = { year: number; month: number };

/** The Moscow month an instant falls in. */
export function monthOfInstant(now: number): CalendarMonth {
  const parts = mskParts(now);
  return { year: parts.year, month: parts.month };
}

/** `delta` months later (negative = earlier); unbounded in both directions, as on the site. */
export function shiftMonth(month: CalendarMonth, delta: number): CalendarMonth {
  const index = month.year * 12 + (month.month - 1) + delta;
  return { year: Math.floor(index / 12), month: (((index % 12) + 12) % 12) + 1 };
}

/** Deadlines bucketed by their MOSCOW calendar day (§4.9: «20 Nov 23:59 MSK» is the 20th for everyone). */
export function groupByMskDay(items: readonly DeadlineItem[]): Map<string, DeadlineItem[]> {
  const grouped = new Map<string, DeadlineItem[]>();
  for (const item of items) {
    const key = mskDayKey(item.deadlineAt);
    const list = grouped.get(key);
    if (list) list.push(item);
    else grouped.set(key, [item]);
  }
  return grouped;
}

/**
 * The mark of one homework in its day cell: `late` — not done and the deadline has passed (red), `due` —
 * not done, still ahead (ink), `done` (muted).
 */
export type DayMarkTone = "late" | "due" | "done";

/** A day cell draws at most this many marks; a busier day draws one fewer and «+N». */
export const MAX_DAY_MARKS = 3;

const MARK_ORDER: Record<DayMarkTone, number> = { late: 0, due: 1, done: 2 };

/** The instant decides, like the caption of a homework row: due today at 20:00 is overdue at 20:01. */
export function markToneOf(item: DeadlineItem, now: number): DayMarkTone {
  if (item.status === "DONE") return "done";
  return isHomeworkOverdue(item.deadlineAt, false, now) ? "late" : "due";
}

/** The marks of a day, the most urgent first, and how many homeworks are left without a mark of their own. */
export function dayMarks(items: readonly DeadlineItem[], now: number): { marks: DayMarkTone[]; more: number } {
  const tones = items.map((item) => markToneOf(item, now)).sort((left, right) => MARK_ORDER[left] - MARK_ORDER[right]);
  if (tones.length <= MAX_DAY_MARKS) return { marks: tones, more: 0 };
  const marks = tones.slice(0, MAX_DAY_MARKS - 1);
  return { marks, more: tones.length - marks.length };
}

export type CalendarCell = {
  /** Moscow day key, "YYYY-MM-DD". */
  key: string;
  /** Day of the month, 1–31. */
  day: number;
  /** A day of the displayed month. A neighbouring month's day is dimmed, never marked and never pressed. */
  inMonth: boolean;
  /** Today's ring: only inside the displayed month. */
  isToday: boolean;
  /** Homeworks due that day; empty for a day of a neighbouring month, even with deadlines on it. */
  items: DeadlineItem[];
  marks: DayMarkTone[];
  /** Homeworks without a mark of their own: drawn as «+N». */
  more: number;
};

/** The 42 cells (6 × 7, Monday first) of a month with their marks; `now` is the server-corrected clock. */
export function buildCalendarCells(
  month: CalendarMonth,
  byDay: ReadonlyMap<string, DeadlineItem[]>,
  now: number,
): CalendarCell[] {
  const today = mskDayKey(now);
  return mskMonthGrid(month.year, month.month).map((key) => {
    const parts = parseDayKey(key);
    const day = parts?.day ?? 0;
    const inMonth = parts !== null && parts.year === month.year && parts.month === month.month;
    if (!inMonth) return { key, day, inMonth, isToday: false, items: [], marks: [], more: 0 };
    const items = byDay.get(key) ?? [];
    return { key, day, inMonth, isToday: key === today, items, ...dayMarks(items, now) };
  });
}

/**
 * The day a tablet shows next to the month before anything is picked: today when something is due on it,
 * else the nearest day with a homework (a tie goes to the day ahead), else today.
 */
export function nearestDeadlineDay(items: readonly DeadlineItem[], today: string): string {
  let best: string | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const item of items) {
    const key = mskDayKey(item.deadlineAt);
    const distance = calendarDaysBetweenMsk(dayKeyToDate(today), dayKeyToDate(key));
    const closer = Math.abs(distance) < Math.abs(bestDistance) || (Math.abs(distance) === Math.abs(bestDistance) && distance > bestDistance);
    if (closer) {
      best = key;
      bestDistance = distance;
    }
  }
  return best ?? today;
}

/** «Ноябрь» inside the current year, «Январь 2027» outside it (dates are short: no year when it is this one). */
export function monthTitle(month: CalendarMonth, now: number, locale: Locale): string {
  const label = formatMonthLabel(mskDate({ year: month.year, month: month.month, day: 1 }), locale);
  const name = label.replace(/\s*\d{4}.*$/, "");
  return month.year === mskParts(now).year ? name : `${name} ${month.year}`;
}

/** «среда, 26 ноября» — the title of a day's homeworks; `weekdays` are nominative, Monday first. */
export function dayTitle(dayKey: string, weekdays: readonly string[], locale: Locale): string {
  const date = formatDayKey(dayKey, "dayMonth", locale) ?? dayKey;
  const weekday = weekdays[mskWeekdayIndex(dayKeyToDate(dayKey))];
  return weekday ? `${weekday}, ${date}` : date;
}
