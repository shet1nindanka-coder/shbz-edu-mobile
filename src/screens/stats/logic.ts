/**
 * Pure decisions of the statistics screen (docs/spec/06-teacher-groups-calls-stats.md §1.6, §4.5 – §4.8):
 * the numbers of the metric cards, the donut, the rankings, the drilldown and the "by teacher" cards.
 * Ported from the site's `teacher/statistics/page.tsx`, `teacher-statistics-drilldown.tsx` and
 * `teacher-stats-section.tsx`. No React, no React Native — unit-tested in `tests/stats-logic.test.ts`.
 */
import type {
  DeveloperStatistics,
  DrilldownResponse,
  Locale,
  StatisticsTeachersResponse,
  TeacherLessonEntry,
  TeacherTopicsOverview,
} from "@/api/types";
import { formatDate, formatMsk } from "@/domain/dates";
import { completionPercent } from "@/domain/statuses";
import { format, plural, type Dictionary } from "@/lib/i18n";

type StatsDict = Dictionary["planner"]["statistics"];
type DrilldownDict = Dictionary["planner"]["drilldown"];
type TeacherStatsDict = Dictionary["planner"]["teacherStats"];
type PlannerCommon = Dictionary["planner"]["common"];

type Homework = DeveloperStatistics["homework"];
type Content = DeveloperStatistics["content"];

/** The three views of the screen; the keys are the site's `?view=` values. */
export const STATS_VIEWS = ["teacher", "teachers", "developer"] as const;
export type StatsView = (typeof STATS_VIEWS)[number];

/**
 * The view and the timeline student a link opens (site `teacher/statistics/page.tsx`): `view` is
 * "teachers" or "developer", anything else is the progress view; `studentId` filters the timeline of the
 * progress view only.
 */
export function initialStatsState(
  view: string | undefined,
  studentId: string | undefined,
): { view: StatsView; timelineStudentId: string | undefined } {
  const resolved: StatsView = view === "developer" ? "developer" : view === "teachers" ? "teachers" : "teacher";
  const timelineStudentId = resolved === "teacher" && studentId ? studentId : undefined;
  return { view: resolved, timelineStudentId };
}

/** Rankings show the first five rows. */
export const RANKING_SIZE = 5;
/** «Пробелы в контенте» lists the first six topics, then «И ещё N тем с пробелами». */
export const MAX_GAPS_SHOWN = 6;

// ───────────────────────────── metric cards ─────────────────────────────

/** What the number says about the school; only `red` is drawn (a non-zero count that needs attention). */
export type NoteTone = "green" | "red" | "accent" | "muted";

/**
 * A summary figure: the label and the figure are drawn; `note` (the site's line under the figure) is only
 * read out by a screen reader. A ratio that matters is part of the figure itself («26/65»).
 */
export type MetricCardModel = { key: string; label: string; value: string; note: string; tone: NoteTone };

/** View "Student progress": four cards about the issued homework. */
export function progressMetricCards(homework: Homework, t: StatsDict): MetricCardModel[] {
  const issuedTotal = homework.issuedNumbersTotal;
  return [
    {
      key: "solvedOfIssued",
      label: t.solvedOfIssued,
      value: `${homework.issuedNumbersSolved}/${issuedTotal}`,
      note: format(t.percentIssuedNumbers, { n: completionPercent(homework.issuedNumbersSolved, issuedTotal) }),
      tone: "green",
    },
    {
      key: "homeworkDone",
      label: t.homeworkDone,
      value: `${homework.completedCount}/${homework.total}`,
      note: format(t.ofIssuedHomework, { n: homework.total }),
      tone: "green",
    },
    {
      key: "homeworkOverdue",
      label: t.homeworkOverdue,
      value: String(homework.overdueCount),
      note: format(t.percentIssuedHomework, { n: completionPercent(homework.overdueCount, homework.total) }),
      tone: "red",
    },
    {
      key: "needHelp",
      label: t.needHelp,
      value: String(homework.issuedNumbersRed),
      note: format(t.percentIssuedNumbers, { n: completionPercent(homework.issuedNumbersRed, issuedTotal) }),
      tone: "red",
    },
  ];
}

// ───────────────────────────── donut: how issued homework is solved ─────────────────────────────

export type SegmentKey = "green" | "yellow" | "red" | "empty";

export type DistributionSegment = {
  key: SegmentKey;
  label: string;
  note: string;
  value: number;
  /** Share of all issued numbers, whole percent. */
  percent: number;
};

export function issuedSegments(homework: Homework, t: StatsDict): DistributionSegment[] {
  const total = homework.issuedNumbersTotal;
  const segment = (key: SegmentKey, value: number): DistributionSegment => ({
    key,
    label: t.segments[key].label,
    note: t.segments[key].note,
    value,
    percent: completionPercent(value, total),
  });
  return [
    segment("green", homework.issuedNumbersGreen),
    segment("yellow", homework.issuedNumbersYellow),
    segment("red", homework.issuedNumbersRed),
    segment("empty", homework.issuedNumbersUnmarked),
  ];
}

export type DonutArc = { key: SegmentKey; /** Fractions of the full circle, clockwise from the top. */ start: number; length: number };

/**
 * Arcs of the donut (`buildConicGradient` on the site): each segment's share of `total`, in order.
 * Empty when there is nothing to draw — the caller then shows a single neutral ring.
 */
export function donutArcs(segments: readonly Pick<DistributionSegment, "key" | "value">[], total: number): DonutArc[] {
  if (!total || segments.every((segment) => segment.value <= 0)) return [];
  const arcs: DonutArc[] = [];
  let start = 0;
  for (const segment of segments) {
    if (segment.value <= 0) continue;
    const length = segment.value / total;
    arcs.push({ key: segment.key, start, length });
    start += length;
  }
  return arcs;
}

/** Share of issued numbers that are solved — the text in the middle of the donut. */
export function issuedSolvedPercent(homework: Homework): number {
  return completionPercent(homework.issuedNumbersSolved, homework.issuedNumbersTotal);
}

export function issuedInsight(homework: Homework, t: StatsDict): string {
  if (homework.issuedNumbersUnmarked > homework.issuedNumbersSolved) return t.insightUnmarked;
  if (homework.issuedNumbersRed > 0) return t.insightRed;
  return t.insightGood;
}

// ───────────────────────────── rankings ─────────────────────────────

/** `brand` — accent; `emerald` — mastered; `rose` — needs help. */
export type RankingTone = "brand" | "emerald" | "rose";

export type RankingItem = {
  key: string;
  title: string;
  subtitle: string;
  valueLabel: string;
  /** 0..100 */
  progress: number;
  tone: RankingTone;
};

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

/** «Самые вовлеченные» and «Нужен разбор»: students against the whole bank of numbers. */
export function studentRankings(overview: TeacherTopicsOverview, t: StatsDict): { engaged: RankingItem[]; review: RankingItem[] } {
  const totalNumbers = overview.stats.totalNumbers;
  const students = overview.students.map((student) => ({
    ...student,
    solvedPercent: completionPercent(student.solvedCount, totalNumbers),
    redPercent: completionPercent(student.redCount, totalNumbers),
  }));

  const engaged = students
    .filter((student) => student.markedCount > 0)
    .sort((left, right) => right.solvedCount - left.solvedCount || right.markedCount - left.markedCount)
    .slice(0, RANKING_SIZE)
    .map<RankingItem>((student) => ({
      key: student.id,
      title: student.name,
      subtitle: format(t.engagedSubtitle, { solved: student.solvedCount, marked: student.markedCount }),
      valueLabel: `${student.solvedPercent}%`,
      progress: clampPercent(student.solvedPercent),
      tone: "brand",
    }));

  const review = students
    .filter((student) => student.redCount > 0)
    .sort((left, right) => right.redCount - left.redCount || right.redPercent - left.redPercent)
    .slice(0, RANKING_SIZE)
    .map<RankingItem>((student) => ({
      key: student.id,
      title: student.name,
      subtitle: format(t.reviewSubtitle, { red: student.redCount, solved: student.solvedCount }),
      valueLabel: `${student.redPercent}%`,
      progress: clampPercent(student.redPercent),
      tone: "rose",
    }));

  return { engaged, review };
}

/** «Лучшее усвоение» and «Где чаще нужна помощь»: topics against their slots (numbers × students). */
export function topicRankings(overview: TeacherTopicsOverview, t: StatsDict): { mastery: RankingItem[]; help: RankingItem[] } {
  const topics = overview.topics.map((topic) => {
    const solvedCount = topic.greenCount + topic.yellowCount;
    return {
      ...topic,
      solvedCount,
      solvedPercent: completionPercent(solvedCount, topic.totalSlots),
      redPercent: completionPercent(topic.redCount, topic.totalSlots),
    };
  });

  const mastery = [...topics]
    .sort((left, right) => right.solvedPercent - left.solvedPercent || right.solvedCount - left.solvedCount)
    .slice(0, RANKING_SIZE)
    .map<RankingItem>((topic) => ({
      key: topic.id,
      title: topic.title,
      subtitle: format(t.masterySubtitle, { solved: topic.solvedCount, students: topic.studentsWithActivity }),
      valueLabel: `${topic.solvedPercent}%`,
      progress: clampPercent(topic.solvedPercent),
      tone: "emerald",
    }));

  const help = topics
    .filter((topic) => topic.redCount > 0)
    .sort((left, right) => right.redCount - left.redCount || right.redPercent - left.redPercent)
    .slice(0, RANKING_SIZE)
    .map<RankingItem>((topic) => ({
      key: topic.id,
      title: topic.title,
      subtitle: format(t.helpSubtitle, { red: topic.redCount, marked: topic.markedCount }),
      valueLabel: `${topic.redPercent}%`,
      progress: clampPercent(topic.redPercent),
      tone: "rose",
    }));

  return { mastery, help };
}

// ───────────────────────────── platform metrics ─────────────────────────────

export type PlatformSummary = {
  /** students × numbers: every status a student could have set. */
  totalStatusSlots: number;
  totalSolved: number;
  totalRed: number;
  totalUnfilled: number;
  activeTopics: number;
  activeStudents: number;
  activeTopicsPercent: number;
  activeStudentsPercent: number;
  solvedPercent: number;
};

export function platformSummary(overview: TeacherTopicsOverview): PlatformSummary {
  const { stats, topics, students } = overview;
  const totalStatusSlots = stats.totalStudents * stats.totalNumbers;
  const totalSolved = topics.reduce((sum, topic) => sum + topic.greenCount + topic.yellowCount, 0);
  const totalRed = topics.reduce((sum, topic) => sum + topic.redCount, 0);
  const activeTopics = topics.filter((topic) => topic.studentsWithActivity > 0).length;
  const activeStudents = students.filter((student) => student.markedCount > 0).length;
  return {
    totalStatusSlots,
    totalSolved,
    totalRed,
    totalUnfilled: Math.max(totalStatusSlots - stats.totalMarked, 0),
    activeTopics,
    activeStudents,
    activeTopicsPercent: completionPercent(activeTopics, stats.totalTopics),
    activeStudentsPercent: completionPercent(activeStudents, stats.totalStudents),
    solvedPercent: completionPercent(totalSolved, totalStatusSlots),
  };
}

/** View "Platform metrics": topics, bank, issued homework, students. */
export function platformMetricCards(overview: TeacherTopicsOverview, homework: Homework, t: StatsDict): MetricCardModel[] {
  const summary = platformSummary(overview);
  return [
    {
      key: "topics",
      label: t.topics,
      value: String(overview.stats.totalTopics),
      note: format(t.topicsNote, { n: summary.activeTopics, percent: summary.activeTopicsPercent }),
      tone: "accent",
    },
    {
      key: "bankNumbers",
      label: t.bankNumbers,
      value: String(overview.stats.totalNumbers),
      note: format(t.bankNote, { n: summary.solvedPercent }),
      tone: "green",
    },
    {
      key: "issuedHomework",
      label: t.issuedHomework,
      value: String(homework.total),
      note: format(t.issuedNote, { n: homework.photosTotal }),
      tone: "muted",
    },
    {
      key: "students",
      label: t.students,
      // The share in work is the «Ученики в работе» row below; the card is the head count.
      value: String(overview.stats.totalStudents),
      note: format(t.studentsNote, { n: summary.activeStudentsPercent }),
      tone: "accent",
    },
  ];
}

export type ProgressRowModel = { key: string; label: string; value: string; percent: number };

export function bankUsageRows(overview: TeacherTopicsOverview, t: StatsDict): ProgressRowModel[] {
  const summary = platformSummary(overview);
  return [
    { key: "solvedOfBank", label: t.solvedOfBank, value: `${summary.totalSolved}/${summary.totalStatusSlots}`, percent: summary.solvedPercent },
    {
      key: "redInBank",
      label: t.redInBank,
      value: `${summary.totalRed}/${summary.totalStatusSlots}`,
      percent: completionPercent(summary.totalRed, summary.totalStatusSlots),
    },
    {
      key: "topicsWithActivity",
      label: t.topicsWithActivity,
      value: `${summary.activeTopics}/${overview.stats.totalTopics}`,
      percent: summary.activeTopicsPercent,
    },
    {
      key: "studentsInWork",
      label: t.studentsInWork,
      value: `${summary.activeStudents}/${overview.stats.totalStudents}`,
      percent: summary.activeStudentsPercent,
    },
  ];
}

export function bankInsight(overview: TeacherTopicsOverview, t: StatsDict): string {
  const summary = platformSummary(overview);
  if (summary.totalUnfilled > summary.totalSolved) return t.bankInsightUnmarked;
  if (summary.totalRed > 0) return t.bankInsightRed;
  return t.bankInsightGood;
}

export function contentRows(content: Content, t: StatsDict): ProgressRowModel[] {
  const row = (key: string, label: string, done: number, total: number): ProgressRowModel => ({
    key,
    label,
    value: `${done}/${total}`,
    percent: completionPercent(done, total),
  });
  return [
    row("numbersWithCondition", t.numbersWithCondition, content.numbersWithCondition, content.totalNumbers),
    row("numbersWithAnswer", t.numbersWithAnswer, content.numbersWithAnswer, content.totalNumbers),
    row("topicsWithTheory", t.topicsWithTheory, content.topicsWithTheory, content.totalTopics),
    row("topicsWithHomeworkFile", t.topicsWithHomeworkFile, content.topicsWithHomeworkFile, content.totalTopics),
  ];
}

/** «нет файла теории, без условия: 3» — the one fact of a gap row: what the topic lacks. */
export function gapLine(gap: Content["gaps"][number], t: StatsDict): string {
  return [
    gap.noTheoryFile ? t.gapNoTheoryFile : null,
    gap.noHomeworkFile ? t.gapNoHomeworkFile : null,
    gap.missingConditions > 0 ? format(t.gapNoCondition, { n: gap.missingConditions }) : null,
    gap.missingAnswers > 0 ? format(t.gapNoAnswer, { n: gap.missingAnswers }) : null,
  ]
    .filter((part): part is string => part !== null)
    .join(", ");
}

/** «И ещё 2 темы с пробелами.» — null when every gap is listed. */
export function moreGapsLine(gapsCount: number, t: StatsDict, locale: Locale): string | null {
  const hidden = gapsCount - MAX_GAPS_SHOWN;
  return hidden > 0 ? plural(locale, hidden, t.moreGapsForms) : null;
}

// ───────────────────────────── drilldown ─────────────────────────────

/** Value of the "Whole topic" option of the homework select. */
export const WHOLE_TOPIC = "__all__";

type DrilldownNumber = DrilldownResponse["numbers"][number];

export type HomeworkOption = { id: string; label: string; deadlineLabel: string; totalNumbers: number };

/**
 * The homework options are inferred (06 §4.6, §7 Q13): numbers with the same mirrored deadline are one
 * "homework", ordered by date; numbers without a deadline belong to none.
 */
export function homeworkOptions(numbers: readonly DrilldownNumber[], t: DrilldownDict, locale: Locale): HomeworkOption[] {
  const grouped = new Map<string, number>();
  for (const number of numbers) {
    if (!number.deadlineAt) continue;
    grouped.set(number.deadlineAt, (grouped.get(number.deadlineAt) ?? 0) + 1);
  }
  return Array.from(grouped.entries())
    .sort((left, right) => new Date(left[0]).getTime() - new Date(right[0]).getTime())
    .map(([deadlineAt, totalNumbers], index) => ({
      id: deadlineAt,
      label: format(t.homeworkN, { n: index + 1 }),
      deadlineLabel: formatDate(deadlineAt, locale),
      totalNumbers,
    }));
}

/** The selection survives a reload only while its option still exists. */
export function resolveHomeworkSelection(selectedId: string, options: readonly HomeworkOption[]): string {
  return selectedId !== WHOLE_TOPIC && options.some((option) => option.id === selectedId) ? selectedId : WHOLE_TOPIC;
}

export type DrilldownMetrics = {
  totalNumbers: number;
  greenCount: number;
  yellowCount: number;
  redCount: number;
  markedCount: number;
  solvedCount: number;
  unmarkedCount: number;
  solvedPercent: number;
  markedPercent: number;
};

export const EMPTY_DRILLDOWN_METRICS: DrilldownMetrics = {
  totalNumbers: 0,
  greenCount: 0,
  yellowCount: 0,
  redCount: 0,
  markedCount: 0,
  solvedCount: 0,
  unmarkedCount: 0,
  solvedPercent: 0,
  markedPercent: 0,
};

export function drilldownMetrics(numbers: readonly DrilldownNumber[], selectedHomeworkId: string): DrilldownMetrics {
  const scoped = selectedHomeworkId === WHOLE_TOPIC ? numbers : numbers.filter((number) => number.deadlineAt === selectedHomeworkId);
  let greenCount = 0;
  let yellowCount = 0;
  let redCount = 0;
  for (const number of scoped) {
    if (number.status === "GREEN") greenCount += 1;
    else if (number.status === "YELLOW") yellowCount += 1;
    else if (number.status === "RED") redCount += 1;
  }
  const totalNumbers = scoped.length;
  const markedCount = greenCount + yellowCount + redCount;
  const solvedCount = greenCount + yellowCount;
  return {
    totalNumbers,
    greenCount,
    yellowCount,
    redCount,
    markedCount,
    solvedCount,
    unmarkedCount: Math.max(totalNumbers - markedCount, 0),
    solvedPercent: completionPercent(solvedCount, totalNumbers),
    markedPercent: completionPercent(markedCount, totalNumbers),
  };
}

export type DrilldownInsightInput = {
  /** Name of the selected student; null when nothing is selected yet. */
  studentName: string | null;
  hasTopic: boolean;
  loadError: string | null;
  loading: boolean;
  /** The selected homework option, or null for the whole topic. */
  homework: Pick<HomeworkOption, "label"> | null;
  metrics: DrilldownMetrics;
};

/** The sentence of the «Сейчас» box; the first matching rule wins (06 §4.6). */
export function drilldownInsight(input: DrilldownInsightInput, t: DrilldownDict): string {
  const { studentName: name, homework, metrics } = input;
  if (!input.hasTopic || name === null) return t.pickFirst;
  if (input.loadError) return input.loadError;
  if (input.loading) return t.loading;

  const homeworkLabel = homework ? homework.label.toLowerCase() : "";
  const scope = homework ? format(t.inHomework, { label: homeworkLabel }) : t.inTopic;

  if (metrics.totalNumbers === 0) return homework ? t.noNumbersHomework : t.noNumbersTopic;
  if (metrics.redCount > 0) return format(t.hasRed, { name, n: metrics.redCount, scope });
  if (metrics.solvedCount === metrics.totalNumbers) {
    return homework ? format(t.closedHomework, { name, label: homeworkLabel }) : format(t.closedTopic, { name });
  }
  if (metrics.markedCount === 0) {
    return homework ? format(t.notStartedHomework, { name, label: homeworkLabel }) : format(t.notStartedTopic, { name });
  }
  return format(t.progress, {
    name,
    solved: metrics.solvedCount,
    total: metrics.totalNumbers,
    scope,
    left: metrics.totalNumbers - metrics.solvedCount,
  });
}

// ───────────────────────────── by teacher ─────────────────────────────

export type WeekBar = {
  index: number;
  count: number;
  /** «5 нояб.» — the Monday the week starts on, Moscow time. */
  weekLabel: string;
  /** Height as a share of the tallest bar, 0..1 (0 for an empty week). */
  ratio: number;
  /** The x-axis names every fourth week and the last one. */
  showLabel: boolean;
};

export function weekBars(counts: readonly number[], weekStarts: readonly string[], locale: Locale): WeekBar[] {
  const maxCount = Math.max(1, ...counts);
  return counts.map((count, index) => ({
    index,
    count,
    weekLabel: formatMsk(weekStarts[index], "dayMonthShort", locale) ?? "",
    ratio: count <= 0 ? 0 : count / maxCount,
    showLabel: index % 4 === 0 || index === counts.length - 1,
  }));
}

/** «Неделя с 5 нояб.: 3 занятия» — what a bar says when it is tapped or read out. */
export function weekBarTitle(bar: Pick<WeekBar, "weekLabel" | "count">, t: TeacherStatsDict, common: PlannerCommon, locale: Locale): string {
  return format(t.weekFrom, { date: bar.weekLabel, count: plural(locale, bar.count, common.lessonForms) });
}

/** Accessible summary of the whole chart: «Занятия по неделям: 5 нояб. — 3, …». */
export function weekChartSummary(bars: readonly WeekBar[], t: TeacherStatsDict): string {
  return format(t.chartAria, { items: bars.map((bar) => `${bar.weekLabel} — ${bar.count}`).join(", ") });
}

export type RecentLessonLine = {
  /** The row's title: the topic, or the lesson's own title when it has no topic. */
  title: string;
  /** The row's one caption: «5 нояб., 18:30» (Moscow time). */
  when: string;
  /** Group or head count — only read out. */
  who: string;
  /** The status in words — drawn as a glyph, read out as text. */
  status: string;
};

/**
 * A row of «Последние занятия». `status` is the STORED lesson status — the only place in the app where
 * it is not derived from the schedule (06 §4.8, §7 Q15): a lesson that ended but was never finalised
 * still reads «запланировано». A lesson without a schedule shows when it was created, and says so.
 */
export function recentLessonLine(lesson: TeacherLessonEntry, t: TeacherStatsDict, common: PlannerCommon, locale: Locale): RecentLessonLine {
  const at = lesson.startsAt ?? lesson.createdAt;
  const when = `${formatMsk(at, "dayMonthShort", locale) ?? ""}, ${formatMsk(at, "time", locale) ?? ""}${lesson.startsAt ? "" : t.created}`;
  const who = lesson.groupName ? format(t.group, { name: lesson.groupName }) : plural(locale, lesson.participantsCount, common.studentForms);
  return { title: lesson.topicTitle ?? lesson.title, when, who, status: t.lessonStatus[lesson.status] };
}

/** «Вне карточек учителей: учеников без учителя — 1, ДЗ — 1.» — null when every row has a teacher. */
export function unattributedLine(unattributed: StatisticsTeachersResponse["unattributed"], t: TeacherStatsDict): string | null {
  const parts = [
    unattributed.students > 0 ? format(t.unattributedStudents, { n: unattributed.students }) : null,
    unattributed.homework > 0 ? format(t.unattributedHomework, { n: unattributed.homework }) : null,
    unattributed.calls > 0 ? format(t.unattributedCalls, { n: unattributed.calls }) : null,
    unattributed.lessons > 0 ? format(t.unattributedLessons, { n: unattributed.lessons }) : null,
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? `${t.unattributed}${parts.join(", ")}.` : null;
}

/** Share of the widest bar, 0..1, for the «Темы занятий» rows. */
export function topicBarRatios(topics: readonly { title: string; count: number }[]): number[] {
  const maxCount = Math.max(1, ...topics.map((topic) => topic.count));
  return topics.map((topic) => topic.count / maxCount);
}

// ───────────────────────────── chart selection ─────────────────────────────

/**
 * The mark a "previous / next" step lands on. From nothing selected, "next" starts at the first mark and
 * "previous" at the last (the most recent week or day); at either end the selection stays where it is.
 * `null` only for a chart without marks.
 */
export function stepChartSelection(selected: number | null, count: number, delta: 1 | -1): number | null {
  if (count <= 0) return null;
  if (selected === null || !Number.isInteger(selected) || selected < 0 || selected >= count) return delta === 1 ? 0 : count - 1;
  return Math.min(count - 1, Math.max(0, selected + delta));
}

/** The column of `count` equal slots across `width` that contains `x`; clamped to the plot. */
export function slotIndexAt(x: number, width: number, count: number): number {
  if (count <= 0 || width <= 0) return 0;
  return Math.min(count - 1, Math.max(0, Math.floor((x / width) * count)));
}

/** The point nearest to `x` among `count` points spread evenly from `start` to `start + span`. */
export function nearestPointIndex(x: number, start: number, span: number, count: number): number {
  if (count <= 1 || span <= 0) return 0;
  return Math.min(count - 1, Math.max(0, Math.round(((x - start) / span) * (count - 1))));
}

// ───────────────────────────── pickers ─────────────────────────────

/** From this many options a picker gets a search field (06 §1.6 "searchable for long student lists"). */
export const PICKER_SEARCH_FROM = 9;

/** Options whose label contains the query, case-insensitively; an empty query keeps them all. */
export function filterPickerOptions<T extends { label: string }>(options: readonly T[], query: string): T[] {
  const needle = query.trim().toLocaleLowerCase();
  if (needle === "") return [...options];
  return options.filter((option) => option.label.toLocaleLowerCase().includes(needle));
}
