// Pure decisions of the parent-calls screen (src/screens/calls/logic.ts): the texts of a student row and the
// paging of the history sheet.
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
import test from "node:test";
import assert from "node:assert/strict";

import type { ParentCallEntry, ParentCallStudentOverview } from "@/api/types";
import { getDictionary } from "@/i18n/get-dictionary";
import {
  HISTORY_PAGE_SIZE,
  agoLabel,
  callMetaLine,
  callMetaParts,
  earlierHistoryCursor,
  historyEntryTime,
  mergeHistory,
  reminderChip,
  summaryLine,
  teacherLine,
} from "@/screens/calls/logic";

const ru = getDictionary("ru").planner.calls;
const en = getDictionary("en").planner.calls;

function entry(id: string, calledAt = "2026-11-05T15:30:00.000Z"): ParentCallEntry {
  return { id, outcome: "REACHED", comment: null, calledAt, teacherName: "Анна Петрова" };
}

function student(patch: Partial<ParentCallStudentOverview> = {}): ParentCallStudentOverview {
  return {
    studentId: "usr_1",
    studentName: "Кирилл Орлов",
    teacherId: "usr_anna",
    teacherName: "Анна Петрова",
    reminder: { state: "ok", daysSinceAnchor: 0, daysUntilDue: 30, hasReachedCall: true },
    studentCreatedAt: "2026-08-01T09:00:00.000Z",
    lastReachedAt: null,
    attemptAfterLastReached: false,
    attemptDaysAgo: null,
    totalCalls: 0,
    history: [],
    ...patch,
  };
}

// ───────────────────────────── a student row ─────────────────────────────

test("agoLabel: today for 0, days otherwise", () => {
  assert.equal(agoLabel(0, ru), "сегодня");
  assert.equal(agoLabel(3, ru), "3 дн. назад");
  assert.equal(agoLabel(3, en), "3 d ago");
});

test("callMetaParts: last reached call with the server's day count, in Moscow time", () => {
  const row = student({
    // 21:30 UTC on 4 November is already 5 November in Moscow.
    lastReachedAt: "2026-11-04T21:30:00.000Z",
    reminder: { state: "due", daysSinceAnchor: 31, daysUntilDue: 0, hasReachedCall: true },
  });
  assert.deepEqual(callMetaParts(row, ru, "ru"), ["Последний звонок: 5 ноября (31 дн. назад)"]);
  assert.deepEqual(callMetaParts(row, en, "en"), ["Last call: 5 November (31 d ago)"]);
});

test("callMetaParts: a call made today", () => {
  const row = student({ lastReachedAt: "2026-11-05T10:00:00.000Z" });
  assert.deepEqual(callMetaParts(row, ru, "ru"), ["Последний звонок: 5 ноября (сегодня)"]);
});

test("callMetaParts: no successful call yet names the day the student was added", () => {
  assert.deepEqual(callMetaParts(student(), ru, "ru"), ["Звонков ещё не было · ученик добавлен 1 августа"]);
});

test("callMetaLine: an unanswered attempt after the last reached call is appended", () => {
  const row = student({
    lastReachedAt: "2026-09-16T09:00:00.000Z",
    reminder: { state: "overdue", daysSinceAnchor: 50, daysUntilDue: 0, hasReachedCall: true },
    attemptAfterLastReached: true,
    attemptDaysAgo: 3,
  });
  assert.equal(callMetaLine(row, ru, "ru"), "Последний звонок: 16 сентября (50 дн. назад) · Пытались дозвониться 3 дн. назад");
});

test("callMetaParts: the attempt is not shown without its day count", () => {
  const row = student({ attemptAfterLastReached: true, attemptDaysAgo: null });
  assert.equal(callMetaParts(row, ru, "ru").length, 1);
});

test("teacherLine: a student without a teacher gets a dash", () => {
  assert.equal(teacherLine({ teacherName: "Игорь Смирнов" }, ru), "Учитель: Игорь Смирнов");
  assert.equal(teacherLine({ teacherName: null }, en), "Teacher: —");
});

test("reminderChip: tone and label per state", () => {
  assert.deepEqual(reminderChip("overdue", ru), { tone: "red", label: "Просрочено" });
  assert.deepEqual(reminderChip("due", ru), { tone: "yellow", label: "Пора позвонить" });
  assert.deepEqual(reminderChip("ok", en), { tone: "muted", label: "Called recently" });
});

test("summaryLine: the site's sentence", () => {
  assert.equal(summaryLine({ overdue: 1, due: 2, total: 7 }, ru), "Просрочено: 1 · Пора позвонить: 2 · Всего учеников: 7");
});

// ───────────────────────────── history ─────────────────────────────

test("earlierHistoryCursor: null while the overview carries the whole history", () => {
  assert.equal(earlierHistoryCursor({ history: [], totalCalls: 0 }), null);
  assert.equal(earlierHistoryCursor({ history: [entry("c2"), entry("c1")], totalCalls: 2 }), null);
});

test("earlierHistoryCursor: the oldest shown call when the total is larger", () => {
  const history = Array.from({ length: HISTORY_PAGE_SIZE }, (_item, index) => entry(`c${HISTORY_PAGE_SIZE - index}`));
  assert.equal(earlierHistoryCursor({ history, totalCalls: 23 }), "c1");
});

test("mergeHistory: overview entries, then earlier pages, each call once", () => {
  const merged = mergeHistory([entry("c5"), entry("c4")], [[entry("c4"), entry("c3")], [entry("c2")]]);
  assert.deepEqual(
    merged.map((item) => item.id),
    ["c5", "c4", "c3", "c2"],
  );
});

test("mergeHistory: nothing loaded yet", () => {
  assert.deepEqual(mergeHistory([entry("c1")], []).map((item) => item.id), ["c1"]);
});

test("historyEntryTime: Moscow wall clock", () => {
  // 15:30 UTC = 18:30 in Moscow.
  assert.equal(historyEntryTime(entry("c1"), "ru"), "5 ноября в 18:30");
  assert.equal(historyEntryTime(entry("c1"), "en"), "5 November at 18:30");
});

