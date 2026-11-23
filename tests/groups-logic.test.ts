// Pure decisions of the groups screens (src/screens/groups/logic.ts): card texts, the add-member search,
// statistics labels and the attendance matrix helpers.
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
import test from "node:test";
import assert from "node:assert/strict";

import type { GroupAttendanceResponse, GroupCandidate, GroupStatisticsResponse } from "@/api/types";
import { getDictionary } from "@/i18n/get-dictionary";
import {
  activityLabel,
  aiNoteForRequest,
  applyAttendanceMark,
  applyPendingMarks,
  attendanceTotalText,
  attentionLabels,
  defaultAttendanceLessonId,
  hasActiveLesson,
  isInOtherGroup,
  lessonCells,
  memberAttendanceSummary,
  normalizeGroupName,
  parseGradeInput,
  speedLabel,
  suggestCandidates,
  summaryTiles,
} from "@/screens/groups/logic";

const ru = getDictionary("ru").planner;

// ───────────────────────────── groups list ─────────────────────────────

test("normalizeGroupName: one line, trimmed, cut at 120", () => {
  assert.equal(normalizeGroupName("  8А \n алгебра  "), "8А алгебра");
  assert.equal(normalizeGroupName("   "), "");
  assert.equal(normalizeGroupName("я".repeat(200)).length, 120);
});

test("parseGradeInput: empty is no grade, 1..11 is a grade, anything else is refused", () => {
  assert.deepEqual(parseGradeInput(""), { ok: true, grade: null });
  assert.deepEqual(parseGradeInput("  "), { ok: true, grade: null });
  assert.deepEqual(parseGradeInput("1"), { ok: true, grade: 1 });
  assert.deepEqual(parseGradeInput(" 11 "), { ok: true, grade: 11 });
  assert.deepEqual(parseGradeInput("0"), { ok: false });
  assert.deepEqual(parseGradeInput("12"), { ok: false });
  assert.deepEqual(parseGradeInput("8.5"), { ok: false });
  assert.deepEqual(parseGradeInput("-3"), { ok: false });
  assert.deepEqual(parseGradeInput("восемь"), { ok: false });
});

// ───────────────────────────── members ─────────────────────────────

const students: GroupCandidate[] = [
  { id: "s1", name: "Артём Кузнецов", email: "artem@example.com", groupId: "g1" },
  { id: "s2", name: "Илья Смирнов", email: "ilya@example.com", groupId: null },
  { id: "s3", name: "Кирилл Зайцев", email: "kirill@example.com", groupId: "g2" },
  { id: "s4", name: "Мария Волкова", email: "maria@example.com", groupId: "g1" },
];

test("suggestCandidates: members of this group are never offered; the search is by name, case-insensitive", () => {
  // Nothing is offered before the first letter.
  assert.deepEqual(suggestCandidates(students, "g1", ""), []);
  assert.deepEqual(suggestCandidates(students, "g1", "   "), []);
  assert.deepEqual(suggestCandidates(students, "g1", "и").map((row) => row.id), ["s2", "s3"]);
  assert.deepEqual(suggestCandidates(students, "g1", "  ЗАЙ ").map((row) => row.id), ["s3"]);
  // The login is not searched.
  assert.deepEqual(suggestCandidates(students, "g1", "example.com"), []);
  assert.deepEqual(suggestCandidates(students, "g1", "волк"), []);
  assert.deepEqual(suggestCandidates(students, "g2", "волк").map((row) => row.id), ["s4"]);
});

test("suggestCandidates: at most eight", () => {
  const many: GroupCandidate[] = Array.from({ length: 12 }, (_, index) => ({ id: `m${index}`, name: `Ученик ${index}`, email: "", groupId: null }));
  assert.equal(suggestCandidates(many, "g1", "уч").length, 8);
  assert.equal(suggestCandidates(many, "g1", "уч", 3).length, 3);
});

test("isInOtherGroup: only a student of a different group will be moved", () => {
  assert.equal(isInOtherGroup(students[0]!, "g2"), true);
  assert.equal(isInOtherGroup(students[0]!, "g1"), false);
  assert.equal(isInOtherGroup(students[1]!, "g1"), false);
});

test("speedLabel and aiNoteForRequest", () => {
  assert.equal(speedLabel(null, ru.groups.memberEditor), "Не указана");
  assert.equal(speedLabel(8, ru.groups.memberEditor), "8 из 10");
  assert.equal(aiNoteForRequest("  теряется\nв длинных   выкладках "), "теряется в длинных выкладках");
  assert.equal(aiNoteForRequest("   "), null);
  assert.equal(aiNoteForRequest("я".repeat(400))?.length, 300);
});

// ───────────────────────────── statistics ─────────────────────────────

test("attentionLabels: one overdue homework has its own wording; the order is the server's", () => {
  assert.deepEqual(
    attentionLabels(
      [{ code: "overdue_homework", count: 1 }, { code: "idle", days: 9 }, { code: "red_month", count: 6 }],
      ru.groupStatistics,
    ),
    ["просрочено ДЗ", "без активности 9 дн.", "красных за месяц: 6"],
  );
  assert.deepEqual(
    attentionLabels([{ code: "overdue_homework", count: 3 }, { code: "not_started" }], ru.groupStatistics),
    ["просрочено ДЗ: 3", "ещё не начинал"],
  );
});

test("activityLabel: never active, today, yesterday, a date; homework in progress is appended", () => {
  const t = ru.groups.statistics;
  assert.equal(activityLabel({ lastActivityAt: null, idleDays: null, activeHomeworks: 0 }, t, "ru"), "ещё не начинал");
  assert.equal(activityLabel({ lastActivityAt: "2026-11-16T09:00:00.000Z", idleDays: 0, activeHomeworks: 0 }, t, "ru"), "сегодня");
  assert.equal(activityLabel({ lastActivityAt: "2026-11-15T09:00:00.000Z", idleDays: 1, activeHomeworks: 2 }, t, "ru"), "вчера · ДЗ в работе: 2");
  assert.equal(activityLabel({ lastActivityAt: "2026-11-07T09:00:00.000Z", idleDays: 9, activeHomeworks: 0 }, t, "ru"), "7 ноября 2026");
});

function statistics(overrides: Partial<GroupStatisticsResponse> = {}): GroupStatisticsResponse {
  const row = (id: string, name: string, closed7: number, closed30: number) => ({
    id,
    name,
    closed7,
    closed30,
    red30: 0,
    streak: 0,
    overdueHomeworks: 0,
    activeHomeworks: 0,
    lastActivityAt: null,
    rank: 1,
    idleDays: null,
    attention: [],
  });
  return {
    generatedAt: "2026-11-16T09:00:00.000Z",
    members: [row("a", "Артём", 5, 12), row("b", "Кирилл", 0, 1)],
    mostActiveId: "a",
    leastActiveId: "b",
    totals: { closed7: 5, closed30: 13, red30: 2, overdueHomeworks: 0, attentionCount: 0 },
    ...overrides,
  };
}

test("summaryTiles: leaders, group totals and the attention tile", () => {
  const tiles = summaryTiles(statistics(), ru.groups.statistics);
  assert.deepEqual(tiles.map((tile) => tile.key), ["mostActive", "leastActive", "closedByGroup", "needsAttention"]);
  assert.deepEqual(tiles[0], { key: "mostActive", label: "Самый активный", value: "Артём", hint: "5 за 7 дней · 12 за 30" });
  assert.deepEqual(tiles[1], { key: "leastActive", label: "Меньше всех активности", value: "Кирилл", hint: "0 за 7 дней · 1 за 30" });
  assert.deepEqual(tiles[2], { key: "closedByGroup", label: "Закрыто группой", value: "5 за 7 дней", hint: "13 за 30 дней · красных 2" });
  assert.deepEqual(tiles[3], { key: "needsAttention", label: "Нужно внимание", value: "никому", hint: "просроченных ДЗ нет" });
});

test("summaryTiles: no leaders in a group of one; attention counts members, the hint counts homework", () => {
  const tiles = summaryTiles(
    statistics({
      mostActiveId: null,
      leastActiveId: null,
      totals: { closed7: 0, closed30: 0, red30: 0, overdueHomeworks: 3, attentionCount: 1 },
    }),
    ru.groups.statistics,
  );
  assert.equal(tiles[0]?.value, "—");
  assert.equal(tiles[0]?.hint, "пока нет активности");
  assert.equal(tiles[1]?.value, "—");
  assert.equal(tiles[1]?.hint, undefined);
  assert.equal(tiles[3]?.value, "1 из 2");
  assert.equal(tiles[3]?.hint, "просроченных ДЗ: 3");
});

// ───────────────────────────── attendance ─────────────────────────────

const attendance: GroupAttendanceResponse = {
  period: "year",
  since: "2026-08-31T21:00:00.000Z",
  until: "2026-11-16T09:00:00.000Z",
  members: [
    { id: "s1", name: "Артём" },
    { id: "s2", name: "Мария" },
  ],
  lessons: [
    {
      id: "l1",
      title: "Линейные уравнения",
      startsAt: "2026-10-01T14:00:00.000Z",
      status: "FINISHED",
      participants: [{ participantId: "p1", studentId: "s1", attendance: "PRESENT", joinedAt: null }],
    },
    {
      id: "l2",
      title: "Системы",
      startsAt: "2026-10-08T14:00:00.000Z",
      status: "FINISHED",
      participants: [
        { participantId: "p2", studentId: "s1", attendance: "ABSENT", joinedAt: null },
        { participantId: "p3", studentId: "s9", attendance: "LATE", joinedAt: null },
      ],
    },
  ],
};

test("lessonCells: one cell per participant, keyed by student", () => {
  const cells = lessonCells(attendance.lessons[1]!);
  assert.deepEqual(cells.get("s1"), { participantId: "p2", attendance: "ABSENT" });
  assert.equal(cells.get("s2"), undefined);
});

test("memberAttendanceSummary: only the lessons the member took part in are counted", () => {
  assert.deepEqual(memberAttendanceSummary("s1", attendance.lessons), { counted: 2, attended: 1, late: 0, absent: 1, excused: 0, percent: 50 });
  // Мария took part in no lesson: nothing to count.
  assert.equal(memberAttendanceSummary("s2", attendance.lessons).counted, 0);
});

test("attendanceTotalText: «attended / counted · percent», no percent when all is excused, a dash for nothing", () => {
  assert.equal(attendanceTotalText({ counted: 6, attended: 5, late: 1, absent: 1, excused: 0, percent: 83 }), "5 / 6 · 83%");
  assert.equal(attendanceTotalText({ counted: 2, attended: 0, late: 0, absent: 0, excused: 2, percent: null }), "0 / 2");
  assert.equal(attendanceTotalText({ counted: 0, attended: 0, late: 0, absent: 0, excused: 0, percent: null }), "—");
});

test("applyAttendanceMark: replaces one participant's mark and leaves everything else untouched", () => {
  const next = applyAttendanceMark(attendance, "p2", "EXCUSED");
  assert.equal(next.lessons[1]?.participants[0]?.attendance, "EXCUSED");
  assert.equal(next.lessons[1]?.participants[1]?.attendance, "LATE");
  // The untouched lesson keeps its identity; the source is not mutated.
  assert.equal(next.lessons[0], attendance.lessons[0]);
  assert.equal(attendance.lessons[1]?.participants[0]?.attendance, "ABSENT");
  // An unknown participant changes nothing.
  assert.deepEqual(applyAttendanceMark(attendance, "nobody", "LATE").lessons, attendance.lessons);
});

test("hasActiveLesson and defaultAttendanceLessonId: the running lesson wins, else the latest", () => {
  assert.equal(hasActiveLesson(undefined), false);
  assert.equal(hasActiveLesson(attendance), false);
  assert.equal(defaultAttendanceLessonId(attendance.lessons), "l2");
  assert.equal(defaultAttendanceLessonId([]), null);

  const live = [
    { id: "l1", status: "FINISHED" as const },
    { id: "l2", status: "ACTIVE" as const },
    { id: "l3", status: "FINISHED" as const },
  ];
  assert.equal(defaultAttendanceLessonId(live), "l2");
  assert.equal(hasActiveLesson({ lessons: [{ ...attendance.lessons[0]!, status: "ACTIVE" }] }), true);
});

test("applyPendingMarks: a table read that predates a mark in flight keeps the optimistic mark (#222)", () => {
  assert.equal(applyPendingMarks(attendance, {}), attendance);
  const shown = applyPendingMarks(attendance, { p2: "EXCUSED" });
  assert.equal(shown.lessons[1]?.participants[0]?.attendance, "EXCUSED");
  // Already shown, or an unknown participant: the read is kept as it is.
  assert.equal(applyPendingMarks(attendance, { p2: "ABSENT" }), attendance);
  assert.equal(applyPendingMarks(attendance, { nobody: "LATE" }), attendance);
});
