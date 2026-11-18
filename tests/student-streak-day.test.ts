// A persisted streak shown on a later Moscow day (round 5, #405): «Сегодня сделано», the week's "today"
// cell and the headline streak follow the current day, not the day of the cached response.
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import type { StudentStreak } from "../src/api/types";
import { mskToday } from "../src/domain/moscow-time";
import type { TimelineEntry } from "../src/domain/progress-timeline";
import { buildStudentStreak, streakForDay as domainStreakForDay } from "../src/domain/student-streak";
import { getDictionary } from "../src/i18n/get-dictionary";
import { streakForDay, streakTexts, weekCells } from "../src/screens/student/study/streak-model";

const ru = getDictionary("ru");

/** Cached on Wednesday 18 Nov 2026: active Mon, Tue, Wed (1 problem today). */
const cached: StudentStreak = {
  currentStreak: 3,
  bestStreak: 5,
  solvedToday: 1,
  solvedThisWeek: 6,
  activeDaysThisWeek: 4,
  dailyActivity: [
    { date: "2026-11-12", dayLabel: "Чт", count: 0 },
    { date: "2026-11-13", dayLabel: "Пт", count: 2 },
    { date: "2026-11-14", dayLabel: "Сб", count: 0 },
    { date: "2026-11-15", dayLabel: "Вс", count: 0 },
    { date: "2026-11-16", dayLabel: "Пн", count: 2 },
    { date: "2026-11-17", dayLabel: "Вт", count: 1 },
    { date: "2026-11-18", dayLabel: "Ср", count: 1 },
  ],
};

function todayCell(streak: StudentStreak): string | undefined {
  return weekCells(streak, ru.student.weekdaysShort, ru.student.weekly).find((cell) => cell.isToday)?.label;
}

describe("streakForDay is one shared domain rule (review of #405)", () => {
  it("the home widget and the app-bar pill read the same function from @/domain", () => {
    // ShellAppBar imports it from the domain, the widget through streak-model: one implementation.
    assert.equal(streakForDay, domainStreakForDay);
    assert.equal(domainStreakForDay(cached, "2026-11-20").currentStreak, 0);
  });
});

describe("streakForDay", () => {
  it("leaves a response for the current day untouched (fresh server data)", () => {
    assert.equal(streakForDay(cached, "2026-11-18"), cached);
    assert.equal(streakTexts(cached, ru.student.weekly, "ru").solvedToday, "1 номер");
    assert.equal(todayCell(cached), "Ср");
  });

  it("leaves a response from a later day alone (a device clock behind the server's)", () => {
    assert.equal(streakForDay(cached, "2026-11-17"), cached);
  });

  it("moves the week on by one day the next day: nothing solved today, the streak lives through yesterday", () => {
    const next = streakForDay(cached, "2026-11-19");
    assert.equal(next.solvedToday, 0);
    assert.equal(streakTexts(next, ru.student.weekly, "ru").solvedToday, "Без закрытых номеров");
    assert.deepEqual(next.dailyActivity.map((day) => day.date), [
      "2026-11-13", "2026-11-14", "2026-11-15", "2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19",
    ]);
    assert.deepEqual(next.dailyActivity.map((day) => day.count), [2, 0, 0, 2, 1, 1, 0]);
    assert.equal(todayCell(next), "Чт");
    assert.equal(weekCells(next, ru.student.weekdaysShort, ru.student.weekly).filter((cell) => cell.isToday).length, 1);
    assert.equal(next.currentStreak, 3);
    assert.equal(next.bestStreak, 5);
    assert.equal(next.solvedThisWeek, 6);
    assert.equal(next.activeDaysThisWeek, 4);
  });

  it("drops the streak two days later, as the site's rules would", () => {
    const later = streakForDay(cached, "2026-11-20");
    assert.equal(later.currentStreak, 0);
    assert.equal(later.solvedToday, 0);
    assert.deepEqual(later.dailyActivity.map((day) => day.count), [0, 0, 2, 1, 1, 0, 0]);
    assert.equal(later.solvedThisWeek, 4);
    assert.equal(later.activeDaysThisWeek, 3);
    assert.equal(todayCell(later), "Пт");
    assert.equal(streakTexts(later, ru.student.weekly, "ru").headline, "Зажгите первый день");
  });

  it("keeps no cached day at all after a week", () => {
    const week = streakForDay(cached, "2026-11-26");
    assert.deepEqual(week.dailyActivity.map((day) => day.count), [0, 0, 0, 0, 0, 0, 0]);
    assert.equal(week.dailyActivity.at(-1)?.date, "2026-11-26");
    assert.equal(week.solvedThisWeek, 0);
  });

  it("gives a cached empty day no streak on the next day", () => {
    const emptyToday: StudentStreak = {
      ...cached,
      currentStreak: 2,
      solvedToday: 0,
      dailyActivity: cached.dailyActivity.map((day) => (day.date === "2026-11-18" ? { ...day, count: 0 } : day)),
    };
    assert.equal(streakForDay(emptyToday, "2026-11-19").currentStreak, 0);
  });

  it("agrees with the site's buildStudentStreak over the shifted days", () => {
    const entries = (until: string): TimelineEntry[] =>
      cached.dailyActivity
        .map((day) => ({ date: day.date, closedCount: day.count, redCount: 0 }))
        .concat(["2026-11-19", "2026-11-20"].filter((date) => date <= until).map((date) => ({ date, closedCount: 0, redCount: 0 })));
    for (const today of ["2026-11-19", "2026-11-20"]) {
      // Only the 7 cached days are known; the site sees more, so compare from a cache with 0 before them.
      const site = buildStudentStreak(entries(today), "ru");
      const rolled = streakForDay(cached, today);
      assert.equal(rolled.currentStreak, site.currentStreak, today);
      assert.equal(rolled.solvedToday, site.solvedToday, today);
      assert.equal(rolled.solvedThisWeek, site.solvedThisWeek, today);
      assert.equal(rolled.activeDaysThisWeek, site.activeDaysThisWeek, today);
      assert.deepEqual(rolled.dailyActivity.map((day) => day.count), site.dailyActivity.map((day) => day.count), today);
    }
  });
});

describe("streakForDay across Moscow midnight in any device zone", () => {
  const original = process.env.TZ;
  afterEach(() => {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  });

  for (const zone of ["Europe/Moscow", "America/Los_Angeles", "Asia/Tokyo", "UTC"]) {
    it(`uses the Moscow day in ${zone}`, () => {
      process.env.TZ = zone;
      // 23:59:59 MSK on Wednesday: still the cached day.
      const before = Date.parse("2026-11-18T20:59:59.000Z");
      assert.equal(mskToday(before), "2026-11-18");
      assert.equal(streakForDay(cached, mskToday(before)), cached);
      assert.equal(todayCell(streakForDay(cached, mskToday(before))), "Ср");
      // 00:00 MSK on Thursday: a new day, although Los Angeles still has Wednesday morning.
      const after = Date.parse("2026-11-18T21:00:00.000Z");
      assert.equal(mskToday(after), "2026-11-19");
      const rolled = streakForDay(cached, mskToday(after));
      assert.equal(rolled.solvedToday, 0);
      assert.equal(todayCell(rolled), "Чт");
      assert.equal(rolled.currentStreak, 3);
    });
  }
});
