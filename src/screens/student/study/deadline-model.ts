// Pure rules of the homework deadline blocks (docs/spec/02-student-study.md S1, S4, §4.5, §4.9): which
// homeworks are "upcoming", what a deadline card says, and how the month grid is marked. No React.
import type { HomeworkDeadlineSummary } from "@/api/types";
import { formatDate } from "@/domain/dates";
import { mskDayKey, mskMonthGrid, mskParts, parseDayKey } from "@/domain/moscow-time";
import { completionPercent, isHomeworkOverdue } from "@/domain/statuses";
import { mapStudentHomeworksToDeadlineItems } from "@/domain/student-deadline-groups";
import { format, type Locale } from "@/lib/i18n";

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

export type UpcomingBlocks = {
  /** «Что дальше»: the nearest unfinished homework, or null (the block is then absent). */
  hero: DeadlineItem | null;
  /** «Ближайшие ДЗ»: the next up to three. */
  list: DeadlineItem[];
  /**
   * Whether the «Ближайшие ДЗ» block is rendered at all: with a hero and nothing else it is absent; with
   * no upcoming homework it shows its title and the "no homework yet" chip.
   */
  showList: boolean;
};

/** The visibility matrix of S1 (exact, from the site's `UpcomingDeadlinesCard`). */
export function splitUpcoming(items: readonly DeadlineItem[], limit: number = UPCOMING_LIMIT): UpcomingBlocks {
  const [next, ...rest] = selectUpcoming(items, limit);
  return { hero: next ?? null, list: rest, showList: rest.length > 0 || !next };
}

/** `dict.student.deadlineList` fields the card texts need. */
export type DeadlineCardCopy = {
  meta: string;
  progress: string;
  progressDone: string;
  progressNotStarted: string;
};

export type DeadlineCardTexts = {
  /** 0–100, rounded. */
  percent: number;
  /** «ДЗ до 20 ноября 2026 г. · Выполнено 3 из 8». */
  meta: string;
  /** «Прогресс ДЗ: 38%» / «ДЗ выполнено полностью» / «ДЗ ещё не начато». */
  progress: string;
  /** «3/8». */
  fraction: string;
  done: boolean;
  /** Not done and the deadline has passed (instant comparison against the corrected clock). */
  overdue: boolean;
};

export function describeDeadline(item: DeadlineItem, copy: DeadlineCardCopy, locale: Locale, now: number): DeadlineCardTexts {
  const percent = completionPercent(item.solvedNumbers, item.totalNumbers);
  const done = item.status === "DONE";
  return {
    percent,
    meta: format(copy.meta, {
      date: formatDate(item.deadlineAt, locale),
      solved: item.solvedNumbers,
      total: item.totalNumbers,
    }),
    progress: percent === 100 ? copy.progressDone : percent === 0 ? copy.progressNotStarted : format(copy.progress, { percent }),
    fraction: `${item.solvedNumbers}/${item.totalNumbers}`,
    done,
    overdue: isHomeworkOverdue(item.deadlineAt, done, now),
  };
}

/**
 * "Now" corrected by the server clock (09 §6.2 rule 6): the response carried `serverNow` when it was
 * received (`receivedAt`, the query's `dataUpdatedAt`), so the device clock's error is their difference.
 * Falls back to the device clock when either value is missing.
 */
export function correctedNow(serverNow: string | null | undefined, receivedAt: number, deviceNow: number): number {
  const server = serverNow ? new Date(serverNow).getTime() : Number.NaN;
  if (Number.isNaN(server) || !(receivedAt > 0)) return deviceNow;
  return deviceNow + (server - receivedAt);
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

export function isSameMonth(left: CalendarMonth, right: CalendarMonth): boolean {
  return left.year === right.year && left.month === right.month;
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
 * `out` — a day of a neighbouring month (never marked, never tappable, even with deadlines);
 * `plain` — no deadlines; `done` — every homework of the day is done (amber); `late` — at least one is
 * not (red).
 */
export type CalendarCellState = "out" | "plain" | "done" | "late";

export type CalendarCell = {
  /** Moscow day key, "YYYY-MM-DD". */
  key: string;
  /** Day of the month, 1–31. */
  day: number;
  state: CalendarCellState;
  /** Today's ring: only inside the displayed month. */
  isToday: boolean;
  /** Homeworks due that day; empty for `out` and `plain`. */
  items: DeadlineItem[];
};

/** The 42 cells (6 × 7, Monday first) of a month with their marks. */
export function buildCalendarCells(
  month: CalendarMonth,
  byDay: ReadonlyMap<string, DeadlineItem[]>,
  today: string,
): CalendarCell[] {
  return mskMonthGrid(month.year, month.month).map((key) => {
    const parts = parseDayKey(key);
    const day = parts?.day ?? 0;
    const inMonth = parts !== null && parts.year === month.year && parts.month === month.month;
    if (!inMonth) return { key, day, state: "out", isToday: false, items: [] };
    const items = byDay.get(key) ?? [];
    const state: CalendarCellState =
      items.length === 0 ? "plain" : items.some((item) => item.status !== "DONE") ? "late" : "done";
    return { key, day, state, isToday: key === today, items };
  });
}
