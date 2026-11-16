// Ported from the site (lib/progress-timeline.ts). [MOBILE] differences:
// - day / week boundaries and labels are MOSCOW days computed with the fixed-offset helpers of
//   ./moscow-time (the site uses the process-local clock, TZ=Europe/Moscow) and labels come from ./dates
//   instead of `Intl.DateTimeFormat` — same strings, no dependency on the device zone or ICU data;
// - `buildProgressTimelineEntries` is the pure core of the site's `getProgressTimeline`
//   (lib/platform-data.ts): it turns current status rows into per-day entries.
import { HomeworkNumberStatus } from "@/domain/enums";
import { DEFAULT_LOCALE, format, type Dictionary, type Locale } from "@/lib/i18n";
import { formatMsk } from "@/domain/dates";
import {
  dayKeyToDate,
  mskAddDays,
  mskDayKey,
  mskMonday,
  mskStartOfDay,
  type DateInput
} from "@/domain/moscow-time";
import { completionPercent } from "@/domain/utils";

// Подписи графика передаются аргументом (dict.students.timeline): модуль
// работает в client-компоненте и не тянет словари в бандл.
type TimelineCopy = Dictionary["students"]["timeline"];

export type TimelineEntry = {
  date: string;
  closedCount: number;
  redCount: number;
};

/** The timeline never looks further back than this many days (the streak window). */
export const MAX_TIMELINE_DAYS = 112;

/** One current `StudentTopicNumberStatus` row, as far as the timeline cares. */
export type TimelineStatusRow = {
  status: HomeworkNumberStatus | null;
  /** When the colour last changed; rows written before that column existed fall back to `updatedAt`. */
  statusChangedAt?: Date | string | null;
  updatedAt?: Date | string | null;
};

/**
 * Per-day entries for the last `days` Moscow days, oldest first, the last one being today.
 * Every row that has a status is counted once, on the Moscow day of `statusChangedAt ?? updatedAt`:
 * GREEN / YELLOW → `closedCount`, RED → `redCount` (so re-marking a number moves it to the new day).
 * Rows outside the window or without a usable date are ignored.
 */
export function buildProgressTimelineEntries(
  rows: TimelineStatusRow[],
  days: number = MAX_TIMELINE_DAYS,
  now: DateInput = Date.now()
): TimelineEntry[] {
  const normalizedDays = Math.max(1, Math.min(MAX_TIMELINE_DAYS, Math.floor(days)));
  const timelineStart = mskAddDays(mskStartOfDay(now), -(normalizedDays - 1));
  const grouped = new Map<string, TimelineEntry>();

  for (let index = 0; index < normalizedDays; index += 1) {
    const key = mskDayKey(mskAddDays(timelineStart, index));

    grouped.set(key, { date: key, closedCount: 0, redCount: 0 });
  }

  for (const row of rows) {
    if (!row.status) {
      continue;
    }

    const changedAt = parseTimelineDate(row.statusChangedAt ?? row.updatedAt);
    const current = changedAt ? grouped.get(mskDayKey(changedAt)) : undefined;

    if (!current) {
      continue;
    }

    if (row.status === HomeworkNumberStatus.RED) {
      current.redCount += 1;
    } else {
      current.closedCount += 1;
    }
  }

  return Array.from(grouped.values());
}

export type TimelinePeriod = "7d" | "4w" | "8w";

export type TimelineChartPoint = {
  key: string;
  label: string;
  tooltip: string;
  closedCount: number;
  redCount: number;
  totalCount: number;
  isEmpty: boolean;
};

type TimelineTrend = {
  direction: "up" | "down" | "flat";
  label: string;
};

export type ProgressTimelineView = {
  period: TimelinePeriod;
  title: string;
  description: string;
  points: TimelineChartPoint[];
  closedTotal: number;
  redTotal: number;
  totalChanges: number;
  averagePerPoint: number;
  trend: TimelineTrend;
};

type TimelineStatusEntry = {
  studentId: string;
  status: HomeworkNumberStatus | null;
  updatedAt?: Date | string | null;
};

type TimelineTopic = {
  homeworkNumbers: {
    statuses: TimelineStatusEntry[];
  }[];
};

export type ProgressTimelinePoint = {
  key: string;
  label: string;
  tooltip: string;
  solved: number;
  review: number;
};

export type TeacherProgressTimeline = {
  solvedLast7Days: number;
  solvedLast30Days: number;
  reviewLast30Days: number;
  activeStudentsLast30Days: number;
  activeDaysLast30Days: number;
  solvedLast7DaysPrevious: number;
  solvedLast30DaysPrevious: number;
  daily: ProgressTimelinePoint[];
  weekly: ProgressTimelinePoint[];
};

type TimelineEvent = {
  studentId: string;
  status: HomeworkNumberStatus;
  updatedAt: Date;
};

type TeacherProgressTimelineOptions = {
  studentId?: string | null;
  locale?: Locale;
};

// Подписи периодов живут в словаре (dict.students.timeline.periods), здесь — только числа.
const PERIOD_CONFIG: Record<
  TimelinePeriod,
  {
    days: number;
    buckets: number;
    mode: "daily" | "weekly";
  }
> = {
  "7d": { days: 7, buckets: 7, mode: "daily" },
  "4w": { days: 28, buckets: 4, mode: "weekly" },
  "8w": { days: 56, buckets: 8, mode: "weekly" }
};

export function buildTeacherProgressTimeline(
  topics: TimelineTopic[],
  now = new Date(),
  options: TeacherProgressTimelineOptions = {}
): TeacherProgressTimeline {
  const locale = options.locale ?? DEFAULT_LOCALE;
  const allEvents = topics.flatMap((topic) =>
    topic.homeworkNumbers.flatMap((number) =>
      number.statuses.flatMap((status) => {
        if (!status.status) {
          return [];
        }

        const updatedAt = parseTimelineDate(status.updatedAt);

        if (!updatedAt) {
          return [];
        }

        return [
          {
            studentId: status.studentId,
            status: status.status,
            updatedAt
          } satisfies TimelineEvent
        ];
      })
    )
  );
  const events = options.studentId
    ? allEvents.filter((event) => event.studentId === options.studentId)
    : allEvents;

  const todayStart = startOfDay(now);
  const tomorrowStart = addDays(todayStart, 1);
  const last7DaysStart = addDays(todayStart, -6);
  const previous7DaysStart = addDays(last7DaysStart, -7);
  const last30DaysStart = addDays(todayStart, -29);
  const previous30DaysStart = addDays(last30DaysStart, -30);

  const currentWeekStart = startOfWeek(now);
  const daily = buildDailyTimeline(events, todayStart, 7, locale);
  const weekly = buildWeeklyTimeline(events, currentWeekStart, 8, locale);
  const activeDayKeys = new Set(
    events
      .filter((event) => isWithinRange(event.updatedAt, last30DaysStart, tomorrowStart))
      .map((event) => startOfDay(event.updatedAt).toISOString())
  );

  const activeStudentsLast30Days = new Set(
    events
      .filter((event) => isWithinRange(event.updatedAt, last30DaysStart, tomorrowStart))
      .map((event) => event.studentId)
  ).size;

  return {
    solvedLast7Days: countSolved(events, last7DaysStart, tomorrowStart),
    solvedLast30Days: countSolved(events, last30DaysStart, tomorrowStart),
    reviewLast30Days: countReview(events, last30DaysStart, tomorrowStart),
    activeStudentsLast30Days,
    activeDaysLast30Days: activeDayKeys.size,
    solvedLast7DaysPrevious: countSolved(events, previous7DaysStart, last7DaysStart),
    solvedLast30DaysPrevious: countSolved(events, previous30DaysStart, last30DaysStart),
    daily,
    weekly
  };
}

export function buildProgressTimelineView(
  entries: TimelineEntry[],
  period: TimelinePeriod,
  timeline: TimelineCopy,
  locale: Locale = DEFAULT_LOCALE
): ProgressTimelineView {
  const config = PERIOD_CONFIG[period];
  const copy = timeline.periods[period];
  const normalizedEntries = [...entries].sort((left, right) => left.date.localeCompare(right.date));
  const currentEntries = normalizedEntries.slice(-config.days);
  const previousEntries = normalizedEntries.slice(-(config.days * 2), -config.days);
  const points =
    config.mode === "daily"
      ? currentEntries.map((entry) => toDailyChartPoint(entry, locale))
      : groupEntriesByWeek(currentEntries, config.buckets, locale);
  const previousPoints =
    config.mode === "daily"
      ? previousEntries.map((entry) => toDailyChartPoint(entry, locale))
      : groupEntriesByWeek(previousEntries, config.buckets, locale);
  const closedTotal = points.reduce((sum, point) => sum + point.closedCount, 0);
  const redTotal = points.reduce((sum, point) => sum + point.redCount, 0);
  const totalChanges = closedTotal + redTotal;
  const averagePerPoint = points.length > 0 ? totalChanges / points.length : 0;
  const previousClosedTotal = previousPoints.reduce((sum, point) => sum + point.closedCount, 0);

  return {
    period,
    title: copy.title,
    description: copy.description,
    points,
    closedTotal,
    redTotal,
    totalChanges,
    averagePerPoint,
    trend: buildTimelineTrend(closedTotal, previousClosedTotal, copy.comparison, timeline.trend)
  };
}

/** С какой ширины экрана видна подпись даты: 0 — всегда, иначе от 360, 640 или 700px. */
export type TimelineLabelFrom = 0 | 360 | 640 | 700;

export type TimelineChartGeometry = {
  points: {
    /** Проценты ширины области построения. */
    x: number;
    /** Проценты высоты: 0 — максимум периода, 100 — ноль. */
    y: number;
    labelFrom: TimelineLabelFrom;
  }[];
  /** Линия и заливка в координатах viewBox="0 0 100 100". */
  line: string;
  area: string;
};

// Геометрия графика «Динамика прогресса» в процентах области построения: SVG
// растягивается на любую ширину (preserveAspectRatio="none"), а точки и подписи
// ставятся HTML поверх по тем же процентам. Ширина контейнера не нужна, поэтому
// серверная разметка совпадает с клиентской и при гидрации ничего не прыгает.
export function buildTimelineChartGeometry(values: number[]): TimelineChartGeometry | null {
  const count = values.length;

  if (count === 0) {
    return null;
  }

  const maxValue = Math.max(1, ...values);
  const points = values.map((value, index) => ({
    x: count === 1 ? 50 : roundChartCoordinate((100 * index) / (count - 1)),
    y: roundChartCoordinate(100 * (1 - value / maxValue)),
    labelFrom: timelineLabelFrom(index, count)
  }));
  const line = "M " + points.map((point) => `${point.x} ${point.y}`).join(" L ");
  const area = `${line} L ${points[count - 1].x} 100 L ${points[0].x} 100 Z`;

  return { points, line, area };
}

// Подпись даты (12px/600) бывает шириной до 55px («20 февр.»), поэтому соседние
// видимые подписи должны стоять не ближе 63px — тогда зазор между ними не меньше
// 8px при любых датах. Область построения на статистике: 168px при 320, 208px
// при 360, от 421px с 640 (на 641 растут поля секции) и 480px при 700; точек не
// больше 8. Отсюда: крайние даты видны всегда, при 4 точках средние — с 360px;
// при 5–8 точках средняя видна всегда, остальные — с 640px, а при 8 — с 700px.
function timelineLabelFrom(index: number, count: number): TimelineLabelFrom {
  if (count <= 3 || index === 0 || index === count - 1) {
    return 0;
  }

  if (count === 4) {
    return 360;
  }

  if (index === Math.round((count - 1) / 2)) {
    return 0;
  }

  return count <= 7 ? 640 : 700;
}

function roundChartCoordinate(value: number) {
  return Number(value.toFixed(2));
}

function buildTimelineTrend(
  current: number,
  previous: number,
  comparison: string,
  copy: TimelineCopy["trend"]
): TimelineTrend {

  if (previous === 0) {
    if (current === 0) {
      return {
        direction: "flat" as const,
        label: format(copy.noChange, { comparison })
      };
    }

    return {
      direction: "up" as const,
      label: format(copy.newActivity, { comparison })
    };
  }

  const delta = current - previous;

  if (delta === 0) {
    return {
      direction: "flat" as const,
      label: format(copy.same, { comparison })
    };
  }

  const percent = completionPercent(Math.abs(delta), previous);
  const direction: TimelineTrend["direction"] = delta > 0 ? "up" : "down";
  const sign = delta > 0 ? "+" : "-";

  return {
    direction,
    label: format(copy.delta, { sign, delta: Math.abs(delta), percent, comparison })
  };
}

function buildDailyTimeline(
  events: TimelineEvent[],
  todayStart: Date,
  days: number,
  locale: Locale
): ProgressTimelinePoint[] {
  const start = addDays(todayStart, -(days - 1));

  return Array.from({ length: days }, (_, index) => {
    const bucketStart = addDays(start, index);
    const bucketEnd = addDays(bucketStart, 1);
    const bucketEvents = events.filter((event) => isWithinRange(event.updatedAt, bucketStart, bucketEnd));

    return {
      key: bucketStart.toISOString(),
      label: formatShortDate(bucketStart, locale),
      tooltip: formatFullDate(bucketStart, locale),
      solved: bucketEvents.filter(isSolvedEvent).length,
      review: bucketEvents.filter(isReviewEvent).length
    };
  });
}

function toDailyChartPoint(entry: TimelineEntry, locale: Locale): TimelineChartPoint {
  const date = dayKeyToDate(entry.date);
  const totalCount = entry.closedCount + entry.redCount;

  return {
    key: entry.date,
    label: formatShortDate(date, locale),
    tooltip: formatFullDate(date, locale),
    closedCount: entry.closedCount,
    redCount: entry.redCount,
    totalCount,
    isEmpty: totalCount === 0
  };
}

function groupEntriesByWeek(entries: TimelineEntry[], buckets: number, locale: Locale): TimelineChartPoint[] {
  if (entries.length === 0) {
    return [];
  }

  const bucketSize = Math.max(1, Math.floor(entries.length / buckets));

  return Array.from({ length: buckets }, (_, index) => {
    const startIndex = index * bucketSize;
    const endIndex = startIndex + bucketSize;
    const bucketEntries = entries.slice(startIndex, endIndex);
    const bucketStart = dayKeyToDate(bucketEntries[0]?.date ?? entries[0].date);
    const bucketEnd = dayKeyToDate(bucketEntries.at(-1)?.date ?? entries.at(-1)?.date ?? entries[0].date);
    const closedCount = bucketEntries.reduce((sum, entry) => sum + entry.closedCount, 0);
    const redCount = bucketEntries.reduce((sum, entry) => sum + entry.redCount, 0);
    const totalCount = closedCount + redCount;

    return {
      key: bucketEntries[0]?.date ?? `${index}`,
      label: formatShortDate(bucketStart, locale),
      tooltip: `${formatFullDate(bucketStart, locale)} - ${formatFullDate(bucketEnd, locale)}`,
      closedCount,
      redCount,
      totalCount,
      isEmpty: totalCount === 0
    };
  });
}

function buildWeeklyTimeline(
  events: TimelineEvent[],
  currentWeekStart: Date,
  weeks: number,
  locale: Locale
): ProgressTimelinePoint[] {
  const start = addDays(currentWeekStart, -7 * (weeks - 1));

  return Array.from({ length: weeks }, (_, index) => {
    const bucketStart = addDays(start, index * 7);
    const bucketEnd = addDays(bucketStart, 7);
    const bucketEvents = events.filter((event) => isWithinRange(event.updatedAt, bucketStart, bucketEnd));
    const bucketLastDay = addDays(bucketEnd, -1);

    return {
      key: bucketStart.toISOString(),
      label: formatShortDate(bucketStart, locale),
      tooltip: `${formatTooltipDate(bucketStart, locale)} - ${formatTooltipDate(bucketLastDay, locale)}`,
      solved: bucketEvents.filter(isSolvedEvent).length,
      review: bucketEvents.filter(isReviewEvent).length
    };
  });
}

function countSolved(events: TimelineEvent[], start: Date, end: Date) {
  return events.filter((event) => isWithinRange(event.updatedAt, start, end) && isSolvedEvent(event)).length;
}

function countReview(events: TimelineEvent[], start: Date, end: Date) {
  return events.filter((event) => isWithinRange(event.updatedAt, start, end) && isReviewEvent(event)).length;
}

function isSolvedEvent(event: TimelineEvent) {
  return event.status === HomeworkNumberStatus.GREEN || event.status === HomeworkNumberStatus.YELLOW;
}

function isReviewEvent(event: TimelineEvent) {
  return event.status === HomeworkNumberStatus.RED;
}

function isWithinRange(value: Date, start: Date, end: Date) {
  return value >= start && value < end;
}

function parseTimelineDate(value?: Date | string | null) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function formatShortDate(value: Date, locale: Locale) {
  return formatMsk(value, "dayMonthShort", locale) ?? "";
}

function formatFullDate(value: Date, locale: Locale) {
  return formatMsk(value, "fullDate", locale) ?? "";
}

function startOfDay(date: Date) {
  return mskStartOfDay(date);
}

function startOfWeek(date: Date) {
  return mskMonday(date);
}

function addDays(date: Date, days: number) {
  return mskAddDays(date, days);
}

function formatTooltipDate(value: Date, locale: Locale) {
  return formatMsk(value, "dayMonth", locale) ?? "";
}
