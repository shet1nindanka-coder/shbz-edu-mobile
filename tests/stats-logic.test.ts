// Pure decisions of the statistics screen (src/screens/stats/logic.ts): metric cards, the donut, the
// rankings, the platform numbers, the drilldown and the "by teacher" cards.
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
import test from "node:test";
import assert from "node:assert/strict";

import type { DeveloperStatistics, StatsStudent, StatsTopic, TeacherLessonEntry, TeacherTopicsOverview } from "@/api/types";
import { getDictionary } from "@/i18n/get-dictionary";
import {
  EMPTY_DRILLDOWN_METRICS,
  MAX_GAPS_SHOWN,
  PICKER_SEARCH_FROM,
  WHOLE_TOPIC,
  bankInsight,
  bankUsageRows,
  contentRows,
  donutArcs,
  drilldownInsight,
  drilldownMetrics,
  filterPickerOptions,
  gapLine,
  homeworkOptions,
  issuedInsight,
  issuedSegments,
  issuedSolvedPercent,
  moreGapsLine,
  nearestPointIndex,
  platformMetricCards,
  platformSummary,
  progressMetricCards,
  recentLessonLine,
  resolveHomeworkSelection,
  slotIndexAt,
  stepChartSelection,
  studentRankings,
  topicBarRatios,
  topicRankings,
  unattributedLine,
  weekBarTitle,
  weekBars,
  weekChartSummary,
} from "@/screens/stats/logic";

const ru = getDictionary("ru").planner;
const en = getDictionary("en").planner;

function homework(patch: Partial<DeveloperStatistics["homework"]> = {}): DeveloperStatistics["homework"] {
  return {
    total: 10,
    completedCount: 4,
    overdueCount: 3,
    inProgressCount: 3,
    withPhotosCount: 5,
    photosTotal: 17,
    issuedNumbersTotal: 40,
    issuedNumbersSolved: 22,
    issuedNumbersGreen: 15,
    issuedNumbersYellow: 7,
    issuedNumbersRed: 6,
    issuedNumbersUnmarked: 12,
    ...patch,
  };
}

function statsStudent(id: string, name: string, green: number, yellow: number, red: number): StatsStudent {
  return { id, name, email: `${id}@example.com`, greenCount: green, yellowCount: yellow, redCount: red, markedCount: green + yellow + red, solvedCount: green + yellow };
}

function statsTopic(id: string, title: string, green: number, yellow: number, red: number, totalSlots: number, studentsWithActivity: number): StatsTopic {
  return {
    id,
    title,
    greenCount: green,
    yellowCount: yellow,
    redCount: red,
    markedCount: green + yellow + red,
    totalStudents: 4,
    totalNumbers: totalSlots / 4,
    totalSlots,
    studentsWithActivity,
    progressPercent: 0,
  };
}

function overview(patch: Partial<TeacherTopicsOverview> = {}): TeacherTopicsOverview {
  return {
    students: [
      statsStudent("s1", "Илья", 10, 2, 1),
      statsStudent("s2", "Мария", 5, 5, 4),
      statsStudent("s3", "Тимур", 0, 0, 0),
      statsStudent("s4", "Кирилл", 10, 0, 0),
    ],
    topics: [
      statsTopic("t1", "Линейные уравнения", 12, 4, 2, 40, 3),
      statsTopic("t2", "Логарифмы", 10, 3, 3, 20, 2),
      statsTopic("t3", "Производная", 3, 0, 0, 40, 1),
      statsTopic("t4", "Пустая тема", 0, 0, 0, 0, 0),
    ],
    stats: { totalTopics: 4, totalStudents: 4, totalFiles: 6, totalNumbers: 25, totalMarked: 37 },
    ...patch,
  };
}

// ───────────────────────────── metric cards ─────────────────────────────

test("progressMetricCards: values, notes and tones of the four cards", () => {
  const cards = progressMetricCards(homework(), ru.statistics);
  assert.deepEqual(
    cards.map((card) => [card.key, card.value, card.note, card.tone]),
    [
      ["solvedOfIssued", "22 / 40", "55% выданных номеров", "green"],
      ["homeworkDone", "4", "из 10 выданных ДЗ", "green"],
      ["homeworkOverdue", "3", "30% выданных ДЗ", "red"],
      ["needHelp", "6", "15% выданных номеров", "red"],
    ],
  );
});

test("progressMetricCards: nothing issued → zero percents, no division by zero", () => {
  const cards = progressMetricCards(
    homework({ total: 0, completedCount: 0, overdueCount: 0, issuedNumbersTotal: 0, issuedNumbersSolved: 0, issuedNumbersRed: 0 }),
    en.statistics,
  );
  assert.equal(cards[0]?.value, "0 / 0");
  assert.equal(cards[0]?.note, "0% of assigned problems");
  assert.equal(cards[2]?.note, "0% of assigned homework");
});

// ───────────────────────────── donut ─────────────────────────────

test("issuedSegments: four segments with their share of the issued numbers", () => {
  const segments = issuedSegments(homework(), ru.statistics);
  assert.deepEqual(
    segments.map((segment) => [segment.key, segment.label, segment.value, segment.percent]),
    [
      ["green", "Зеленые", 15, 38],
      ["yellow", "Желтые", 7, 18],
      ["red", "Красные", 6, 15],
      ["empty", "Без статуса", 12, 30],
    ],
  );
  assert.equal(issuedSolvedPercent(homework()), 55);
});

test("donutArcs: consecutive shares of the circle, empty segments skipped", () => {
  const arcs = donutArcs(
    [
      { key: "green", value: 10 },
      { key: "yellow", value: 0 },
      { key: "red", value: 5 },
      { key: "empty", value: 5 },
    ],
    20,
  );
  assert.deepEqual(arcs, [
    { key: "green", start: 0, length: 0.5 },
    { key: "red", start: 0.5, length: 0.25 },
    { key: "empty", start: 0.75, length: 0.25 },
  ]);
});

test("donutArcs: nothing to draw → no arcs (a single neutral ring)", () => {
  assert.deepEqual(donutArcs([{ key: "green", value: 0 }], 0), []);
  assert.deepEqual(donutArcs([{ key: "green", value: 0 }, { key: "red", value: 0 }], 12), []);
});

test("issuedInsight: unmarked first, then red, then good", () => {
  const t = ru.statistics;
  assert.equal(issuedInsight(homework({ issuedNumbersUnmarked: 30, issuedNumbersSolved: 5 }), t), t.insightUnmarked);
  assert.equal(issuedInsight(homework({ issuedNumbersUnmarked: 5, issuedNumbersSolved: 22, issuedNumbersRed: 1 }), t), t.insightRed);
  assert.equal(issuedInsight(homework({ issuedNumbersUnmarked: 5, issuedNumbersSolved: 22, issuedNumbersRed: 0 }), t), t.insightGood);
});

// ───────────────────────────── rankings ─────────────────────────────

test("studentRankings.engaged: marked students by solved, then marked; percent of the whole bank", () => {
  const { engaged } = studentRankings(overview(), ru.statistics);
  // Илья 12 solved / 13 marked, Мария 10 / 14, Кирилл 10 / 10; Тимур has nothing marked.
  assert.deepEqual(
    engaged.map((item) => [item.title, item.valueLabel, item.subtitle]),
    [
      ["Илья", "48%", "12 решено · 13 отмечено"],
      ["Мария", "40%", "10 решено · 14 отмечено"],
      ["Кирилл", "40%", "10 решено · 10 отмечено"],
    ],
  );
  assert.ok(engaged.every((item) => item.tone === "brand"));
});

test("studentRankings.review: only students with red, most red first", () => {
  const { review } = studentRankings(overview(), ru.statistics);
  assert.deepEqual(
    review.map((item) => [item.title, item.valueLabel, item.subtitle, item.tone]),
    [
      ["Мария", "16%", "4 красных · 10 решено", "rose"],
      ["Илья", "4%", "1 красных · 12 решено", "rose"],
    ],
  );
});

test("studentRankings: at most five rows", () => {
  const students = Array.from({ length: 8 }, (_item, index) => statsStudent(`s${index}`, `Ученик ${index}`, index + 1, 0, 1));
  const { engaged, review } = studentRankings(overview({ students }), ru.statistics);
  assert.equal(engaged.length, 5);
  assert.equal(review.length, 5);
  assert.equal(engaged[0]?.title, "Ученик 7");
});

test("topicRankings: mastery by solved percent of the topic's slots; help only with red", () => {
  const { mastery, help } = topicRankings(overview(), ru.statistics);
  assert.deepEqual(
    mastery.map((item) => [item.title, item.valueLabel]),
    [
      ["Логарифмы", "65%"],
      ["Линейные уравнения", "40%"],
      ["Производная", "8%"],
      ["Пустая тема", "0%"],
    ],
  );
  assert.equal(mastery[0]?.subtitle, "решено: 13 · учеников в работе: 2");
  assert.equal(mastery[0]?.tone, "emerald");
  assert.deepEqual(
    help.map((item) => [item.title, item.valueLabel, item.subtitle]),
    [
      ["Логарифмы", "15%", "красных: 3 · отмеченных статусов: 16"],
      ["Линейные уравнения", "5%", "красных: 2 · отмеченных статусов: 18"],
    ],
  );
});

// ───────────────────────────── platform ─────────────────────────────

test("platformSummary: slots, solved, red, unfilled, active topics and students", () => {
  assert.deepEqual(platformSummary(overview()), {
    totalStatusSlots: 100,
    totalSolved: 32,
    totalRed: 5,
    totalUnfilled: 63,
    activeTopics: 3,
    activeStudents: 3,
    activeTopicsPercent: 75,
    activeStudentsPercent: 75,
    solvedPercent: 32,
  });
});

test("platformMetricCards: four cards", () => {
  const cards = platformMetricCards(overview(), homework(), ru.statistics);
  assert.deepEqual(
    cards.map((card) => [card.key, card.value, card.note, card.tone]),
    [
      ["topics", "4", "3 с активностью (75%)", "accent"],
      ["bankNumbers", "25", "32% банка решено", "green"],
      ["issuedHomework", "10", "фото решений: 17", "muted"],
      ["students", "3 / 4", "75% активны", "accent"],
    ],
  );
});

test("bankUsageRows and bankInsight", () => {
  const rows = bankUsageRows(overview(), ru.statistics);
  assert.deepEqual(
    rows.map((row) => [row.key, row.value, row.percent]),
    [
      ["solvedOfBank", "32 / 100", 32],
      ["redInBank", "5 / 100", 5],
      ["topicsWithActivity", "3 / 4", 75],
      ["studentsInWork", "3 / 4", 75],
    ],
  );
  const t = ru.statistics;
  assert.equal(bankInsight(overview(), t), t.bankInsightUnmarked);
  const full = overview({ stats: { totalTopics: 4, totalStudents: 4, totalFiles: 6, totalNumbers: 10, totalMarked: 37 } });
  assert.equal(bankInsight(full, t), t.bankInsightRed);
  const noRed = overview({
    topics: [statsTopic("t1", "Тема", 30, 5, 0, 40, 4)],
    stats: { totalTopics: 1, totalStudents: 4, totalFiles: 1, totalNumbers: 10, totalMarked: 35 },
  });
  assert.equal(bankInsight(noRed, t), t.bankInsightGood);
});

const content: DeveloperStatistics["content"] = {
  totalTopics: 4,
  totalNumbers: 20,
  numbersWithCondition: 15,
  numbersWithAnswer: 10,
  topicsWithTheory: 3,
  topicsWithHomeworkFile: 2,
  gaps: [],
};

test("contentRows: done / total and the percent", () => {
  assert.deepEqual(
    contentRows(content, ru.statistics).map((row) => [row.key, row.value, row.percent]),
    [
      ["numbersWithCondition", "15 / 20", 75],
      ["numbersWithAnswer", "10 / 20", 50],
      ["topicsWithTheory", "3 / 4", 75],
      ["topicsWithHomeworkFile", "2 / 4", 50],
    ],
  );
});

test("gapLine: only what is missing, in the site's order", () => {
  const gap = { topicId: "t1", title: "Тема", noTheoryFile: true, noHomeworkFile: false, missingConditions: 3, missingAnswers: 0 };
  assert.equal(gapLine(gap, ru.statistics), "нет файла теории · без условия: 3");
  assert.equal(
    gapLine({ ...gap, noHomeworkFile: true, missingAnswers: 2 }, ru.statistics),
    "нет файла теории · нет файла заданий · без условия: 3 · без ответа: 2",
  );
});

test("moreGapsLine: null up to six gaps, a plural line above", () => {
  assert.equal(moreGapsLine(MAX_GAPS_SHOWN, ru.statistics, "ru"), null);
  assert.equal(moreGapsLine(7, ru.statistics, "ru"), "И ещё 1 тема с пробелами.");
  assert.equal(moreGapsLine(8, ru.statistics, "ru"), "И ещё 2 темы с пробелами.");
  assert.equal(moreGapsLine(11, ru.statistics, "ru"), "И ещё 5 тем с пробелами.");
});

// ───────────────────────────── drilldown ─────────────────────────────

const D1 = "2026-11-10T20:59:00.000Z";
const D2 = "2026-11-20T20:59:00.000Z";
const numbers = [
  { status: "GREEN" as const, deadlineAt: D2 },
  { status: "YELLOW" as const, deadlineAt: D1 },
  { status: "RED" as const, deadlineAt: D1 },
  { status: null, deadlineAt: D2 },
  { status: null, deadlineAt: null },
];

test("homeworkOptions: numbers grouped by equal deadline, earliest first; no deadline → no group", () => {
  const options = homeworkOptions(numbers, ru.drilldown, "ru");
  assert.deepEqual(
    options.map((option) => [option.id, option.label, option.totalNumbers]),
    [
      [D1, "ДЗ 1", 2],
      [D2, "ДЗ 2", 2],
    ],
  );
  assert.equal(options[0]?.deadlineLabel, "10 ноября 2026 г.");
  assert.deepEqual(homeworkOptions([{ status: "GREEN", deadlineAt: null }], en.drilldown, "en"), []);
});

test("resolveHomeworkSelection: a vanished option resets to the whole topic", () => {
  const options = homeworkOptions(numbers, ru.drilldown, "ru");
  assert.equal(resolveHomeworkSelection(D1, options), D1);
  assert.equal(resolveHomeworkSelection("2026-01-01T00:00:00.000Z", options), WHOLE_TOPIC);
  assert.equal(resolveHomeworkSelection(WHOLE_TOPIC, options), WHOLE_TOPIC);
});

test("drilldownMetrics: the whole topic", () => {
  assert.deepEqual(drilldownMetrics(numbers, WHOLE_TOPIC), {
    totalNumbers: 5,
    greenCount: 1,
    yellowCount: 1,
    redCount: 1,
    markedCount: 3,
    solvedCount: 2,
    unmarkedCount: 2,
    solvedPercent: 40,
    markedPercent: 60,
  });
});

test("drilldownMetrics: one inferred homework", () => {
  const metrics = drilldownMetrics(numbers, D1);
  assert.equal(metrics.totalNumbers, 2);
  assert.equal(metrics.solvedCount, 1);
  assert.equal(metrics.redCount, 1);
  assert.equal(metrics.solvedPercent, 50);
  assert.deepEqual(drilldownMetrics([], WHOLE_TOPIC), EMPTY_DRILLDOWN_METRICS);
});

test("drilldownInsight: the first matching rule wins", () => {
  const t = ru.drilldown;
  const base = { studentName: "Илья", hasTopic: true, loadError: null, loading: false, homework: null, metrics: drilldownMetrics(numbers, WHOLE_TOPIC) };

  assert.equal(drilldownInsight({ ...base, studentName: null }, t), t.pickFirst);
  assert.equal(drilldownInsight({ ...base, hasTopic: false }, t), t.pickFirst);
  assert.equal(drilldownInsight({ ...base, loadError: "Слишком много запросов.", loading: true }, t), "Слишком много запросов.");
  assert.equal(drilldownInsight({ ...base, loading: true }, t), t.loading);
  assert.equal(drilldownInsight({ ...base, metrics: EMPTY_DRILLDOWN_METRICS }, t), t.noNumbersTopic);
  assert.equal(drilldownInsight({ ...base, metrics: EMPTY_DRILLDOWN_METRICS, homework: { label: "ДЗ 1" } }, t), t.noNumbersHomework);
  assert.equal(drilldownInsight(base, t), "Илья: красных статусов в теме — 1. Это хороший кандидат на ближайший разбор.");
  assert.equal(
    drilldownInsight({ ...base, homework: { label: "ДЗ 1" }, metrics: drilldownMetrics(numbers, D1) }, t),
    "Илья: красных статусов в дз 1 — 1. Это хороший кандидат на ближайший разбор.",
  );
});

test("drilldownInsight: closed, not started, in progress", () => {
  const t = ru.drilldown;
  const base = { studentName: "Мария", hasTopic: true, loadError: null, loading: false, homework: null };
  const closed = drilldownMetrics([{ status: "GREEN", deadlineAt: null }, { status: "YELLOW", deadlineAt: null }], WHOLE_TOPIC);
  const untouched = drilldownMetrics([{ status: null, deadlineAt: null }], WHOLE_TOPIC);
  const partial = drilldownMetrics([{ status: "GREEN", deadlineAt: null }, { status: null, deadlineAt: null }, { status: null, deadlineAt: null }], WHOLE_TOPIC);

  assert.equal(drilldownInsight({ ...base, metrics: closed }, t), "Мария полностью закрыл эту тему: все номера отмечены зеленым или желтым.");
  assert.equal(drilldownInsight({ ...base, metrics: closed, homework: { label: "ДЗ 2" } }, t), "Мария полностью закрыл дз 2: все номера отмечены зеленым или желтым.");
  assert.equal(drilldownInsight({ ...base, metrics: untouched, homework: { label: "ДЗ 2" } }, t), "Мария еще не начал дз 2.");
  assert.ok(drilldownInsight({ ...base, metrics: untouched }, t).startsWith("Мария еще не начал эту тему."));
  assert.equal(drilldownInsight({ ...base, metrics: partial }, t), "Мария: разобрано 1 из 3 в теме. Осталось добрать ещё 2.");
});

// ───────────────────────────── by teacher ─────────────────────────────

const WEEK_STARTS = Array.from({ length: 12 }, (_item, index) => new Date(Date.UTC(2026, 7, 30 + index * 7, 21)).toISOString());

test("weekBars: ratio to the tallest column, Monday labels on every fourth and the last", () => {
  const bars = weekBars([0, 1, 4, 0, 2, 0, 0, 0, 0, 0, 0, 3], WEEK_STARTS, "ru");
  assert.equal(bars.length, 12);
  assert.deepEqual(
    bars.map((bar) => bar.ratio),
    [0, 0.25, 1, 0, 0.5, 0, 0, 0, 0, 0, 0, 0.75],
  );
  assert.deepEqual(
    bars.filter((bar) => bar.showLabel).map((bar) => bar.index),
    [0, 4, 8, 11],
  );
  // 21:00 UTC on Sunday 30 August is Monday 31 August in Moscow.
  assert.equal(bars[0]?.weekLabel, "31 авг.");
});

test("weekBars: all zero → no bar grows, no division by zero", () => {
  assert.ok(weekBars(new Array<number>(12).fill(0), WEEK_STARTS, "en").every((bar) => bar.ratio === 0));
});

test("weekBarTitle and weekChartSummary", () => {
  const bars = weekBars([2, 0], WEEK_STARTS.slice(0, 2), "ru");
  assert.equal(weekBarTitle(bars[0]!, ru.teacherStats, ru.common, "ru"), "Неделя с 31 авг.: 2 занятия");
  assert.equal(weekChartSummary(bars, ru.teacherStats), "Занятия по неделям: 31 авг. — 2, 7 сент. — 0");
});

function lesson(patch: Partial<TeacherLessonEntry> = {}): TeacherLessonEntry {
  return {
    id: "les_1",
    title: "Занятие от 5 ноября",
    topicTitle: "Логарифмы",
    groupName: "8А",
    participantsCount: 5,
    startsAt: "2026-11-05T15:30:00.000Z",
    createdAt: "2026-11-01T09:00:00.000Z",
    status: "FINISHED",
    ...patch,
  };
}

test("recentLessonLine: scheduled group lesson", () => {
  assert.deepEqual(recentLessonLine(lesson(), ru.teacherStats, ru.common, "ru"), {
    when: "5 ноября в 18:30",
    details: "Логарифмы · группа «8А»",
    status: "проведено",
  });
});

test("recentLessonLine: no schedule → creation time with the suffix; no topic → the title; no group → the head count", () => {
  assert.deepEqual(
    recentLessonLine(lesson({ startsAt: null, topicTitle: null, groupName: null, participantsCount: 1, status: "PLANNED" }), ru.teacherStats, ru.common, "ru"),
    { when: "1 ноября в 12:00 (создано)", details: "Занятие от 5 ноября · 1 ученик", status: "запланировано" },
  );
  assert.equal(recentLessonLine(lesson({ groupName: null, participantsCount: 3, status: "ACTIVE" }), en.teacherStats, en.common, "en").status, "in progress");
});

test("unattributedLine: only the non-zero parts; null when every row has a teacher", () => {
  assert.equal(unattributedLine({ students: 0, homework: 0, calls: 0, lessons: 0 }, ru.teacherStats), null);
  assert.equal(
    unattributedLine({ students: 1, homework: 0, calls: 2, lessons: 0 }, ru.teacherStats),
    "Вне карточек учителей: учеников без учителя — 1, созвонов — 2.",
  );
  assert.equal(
    unattributedLine({ students: 1, homework: 1, calls: 1, lessons: 1 }, ru.teacherStats),
    "Вне карточек учителей: учеников без учителя — 1, ДЗ — 1, созвонов — 1, занятий — 1.",
  );
});

test("topicBarRatios: share of the most frequent topic", () => {
  assert.deepEqual(topicBarRatios([{ title: "a", count: 4 }, { title: "b", count: 1 }]), [1, 0.25]);
  assert.deepEqual(topicBarRatios([]), []);
});

// ───────────────────────────── pickers ─────────────────────────────

test("filterPickerOptions: case-insensitive substring; an empty query keeps everything", () => {
  const options = [{ label: "Илья Соколов" }, { label: "Мария Иванова" }, { label: "Кирилл Орлов" }];
  assert.equal(filterPickerOptions(options, "  ").length, 3);
  assert.deepEqual(filterPickerOptions(options, "ИВАН"), [{ label: "Мария Иванова" }]);
  assert.deepEqual(filterPickerOptions(options, "zzz"), []);
  assert.ok(PICKER_SEARCH_FROM > 1);
});

// ───────────────────────────── chart selection ─────────────────────────────

test("stepChartSelection: from nothing, next starts at the first mark and previous at the last", () => {
  assert.equal(stepChartSelection(null, 12, 1), 0);
  assert.equal(stepChartSelection(null, 12, -1), 11);
});

test("stepChartSelection: one mark per step, stopping at both ends", () => {
  assert.equal(stepChartSelection(4, 12, 1), 5);
  assert.equal(stepChartSelection(4, 12, -1), 3);
  assert.equal(stepChartSelection(11, 12, 1), 11);
  assert.equal(stepChartSelection(0, 12, -1), 0);
});

test("stepChartSelection: a selection outside the marks restarts; no marks → nothing", () => {
  // The period changed and the chart now has fewer points than the remembered index.
  assert.equal(stepChartSelection(9, 4, 1), 0);
  assert.equal(stepChartSelection(9, 4, -1), 3);
  assert.equal(stepChartSelection(Number.NaN, 4, 1), 0);
  assert.equal(stepChartSelection(null, 0, 1), null);
  assert.equal(stepChartSelection(2, 0, -1), null);
});

test("slotIndexAt: the column under the finger, clamped to the plot", () => {
  // Twelve columns across 324 pt: 27 pt each.
  assert.equal(slotIndexAt(0, 324, 12), 0);
  assert.equal(slotIndexAt(26.9, 324, 12), 0);
  assert.equal(slotIndexAt(27, 324, 12), 1);
  assert.equal(slotIndexAt(323, 324, 12), 11);
  assert.equal(slotIndexAt(324, 324, 12), 11);
  assert.equal(slotIndexAt(-5, 324, 12), 0);
  assert.equal(slotIndexAt(100, 0, 12), 0);
  assert.equal(slotIndexAt(100, 324, 0), 0);
});

test("nearestPointIndex: points spread from the side inset across the plot", () => {
  // Seven points from x = 24 to x = 264: 40 pt apart.
  assert.equal(nearestPointIndex(24, 24, 240, 7), 0);
  assert.equal(nearestPointIndex(43, 24, 240, 7), 0);
  assert.equal(nearestPointIndex(45, 24, 240, 7), 1);
  assert.equal(nearestPointIndex(264, 24, 240, 7), 6);
  // Touches in the side insets belong to the outermost points.
  assert.equal(nearestPointIndex(2, 24, 240, 7), 0);
  assert.equal(nearestPointIndex(286, 24, 240, 7), 6);
  // A single point sits in the middle: every touch selects it.
  assert.equal(nearestPointIndex(150, 24, 240, 1), 0);
});

