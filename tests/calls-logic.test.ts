// Pure decisions of the parent-calls screen (src/screens/calls/logic.ts): the chip, the caption and the
// spoken texts of a student row, the day of a history entry and the paging of the history sheet.
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
  attentionChip,
  callMetaLine,
  callMetaParts,
  callRowCaption,
  earlierHistoryCursor,
  historyEntryDay,
  historyEntryTime,
  mergeHistory,
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

const shortChips = { due: "пора", overdue: "просрочено" };

test("attentionChip: one word for the eye, the site's label for the ear, nothing for a recent call", () => {
  assert.deepEqual(attentionChip("overdue", ru, shortChips), { tone: "red", label: "просрочено", full: "Просрочено" });
  assert.deepEqual(attentionChip("due", ru, shortChips), { tone: "yellow", label: "пора", full: "Пора позвонить" });
  assert.equal(attentionChip("ok", en, shortChips), null);
});

test("callRowCaption: the days since the parents were reached, only while a call is due", () => {
  const due = student({
    lastReachedAt: "2026-10-25T09:00:00.000Z",
    reminder: { state: "due", daysSinceAnchor: 30, daysUntilDue: 0, hasReachedCall: true },
    // The unanswered attempt is not the caption: it is in the history behind the row.
    attemptAfterLastReached: true,
    attemptDaysAgo: 3,
  });
  assert.equal(callRowCaption(due, ru, "не звонили", false), "30 дн. назад");
  const never = student({ reminder: { state: "overdue", daysSinceAnchor: 50, daysUntilDue: 0, hasReachedCall: false } });
  assert.equal(callRowCaption(never, ru, "не звонили", false), "не звонили");
  assert.equal(callRowCaption(student({ lastReachedAt: "2026-11-05T10:00:00.000Z" }), ru, "не звонили", false), undefined);
});

test("callRowCaption: a developer reads the owning teacher's name and nothing else", () => {
  const due = student({ reminder: { state: "due", daysSinceAnchor: 30, daysUntilDue: 0, hasReachedCall: false } });
  assert.equal(callRowCaption(due, ru, "не звонили", true), "Анна Петрова");
  assert.equal(callRowCaption(student({ teacherName: null }), ru, "не звонили", true), undefined);
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

test("historyEntryDay: the day alone, with the year only for a call of another year", () => {
  assert.equal(historyEntryDay(entry("c1"), "2026-11-24T09:00:00.000Z", "ru"), "5 нояб.");
  assert.equal(historyEntryDay(entry("c1"), "2026-11-24T09:00:00.000Z", "en"), "5 Nov");
  assert.equal(historyEntryDay(entry("c1"), "2027-01-10T09:00:00.000Z", "ru"), "5 ноября 2026");
});

test("historyEntryTime: Moscow wall clock", () => {
  // 15:30 UTC = 18:30 in Moscow.
  assert.equal(historyEntryTime(entry("c1"), "ru"), "5 ноября в 18:30");
  assert.equal(historyEntryTime(entry("c1"), "en"), "5 November at 18:30");
});

