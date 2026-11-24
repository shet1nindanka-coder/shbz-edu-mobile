// Pure rules of the student study screens (02 S1, S3, S4): upcoming homeworks, the month grid in Moscow
// days with a mark per homework, the day a tablet opens on, the streak texts and the note editor's decisions.
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { HomeworkDeadlineSummary, StudentStreak } from "../src/api/types";
import { getDictionary } from "../src/i18n/get-dictionary";
import {
  buildCalendarCells,
  dayMarks,
  dayTitle,
  groupByMskDay,
  monthOfInstant,
  monthTitle,
  nearestDeadlineDay,
  selectUpcoming,
  shiftMonth,
  toDeadlineItems,
} from "../src/screens/student/study/deadline-model";
import { correctedNow } from "@/domain/server-clock";
import {
  NOTE_MAX_LENGTH,
  adoptServerNote,
  initialNoteText,
  isNoteDirty,
  normalizeNoteDraft,
  noteStatus,
} from "../src/screens/student/study/note-model";
import { streakTexts, weekCells } from "../src/screens/student/study/streak-model";

const ru = getDictionary("ru");
const en = getDictionary("en");

function homework(patch: Partial<HomeworkDeadlineSummary> & { id: string }): HomeworkDeadlineSummary {
  return { title: null, orderInTopic: 1, topicTitle: "Логарифмы", deadlineAt: "2026-11-20T20:59:00.000Z", totalNumbers: 8, solvedCount: 0, ...patch };
}

describe("upcoming homeworks (S1)", () => {
  const items = toDeadlineItems(
    [
      homework({ id: "done", deadlineAt: "2026-11-10T17:00:00.000Z", solvedCount: 8 }),
      homework({ id: "late", deadlineAt: "2026-11-12T17:00:00.000Z", solvedCount: 3, orderInTopic: 2 }),
      homework({ id: "none", deadlineAt: null }),
      homework({ id: "c", deadlineAt: "2026-11-25T17:00:00.000Z", title: "Подготовка к контрольной" }),
      homework({ id: "a", deadlineAt: "2026-11-18T17:00:00.000Z" }),
      homework({ id: "b", deadlineAt: "2026-11-21T17:00:00.000Z" }),
      homework({ id: "d", deadlineAt: "2026-11-28T17:00:00.000Z" }),
      homework({ id: "e", deadlineAt: "2026-11-30T17:00:00.000Z" }),
    ],
    "ru",
  );

  it("drops homeworks without a deadline and builds the label in the UI language", () => {
    assert.equal(items.some((item) => item.id === "none"), false);
    assert.equal(items.find((item) => item.id === "late")?.label, "ДЗ 2 · Логарифмы");
    assert.equal(items.find((item) => item.id === "c")?.label, "Подготовка к контрольной · Логарифмы");
    const english = toDeadlineItems([homework({ id: "x", orderInTopic: 3 })], "en");
    assert.equal(english[0]?.label, "Homework 3 · Логарифмы");
  });

  it("takes the four nearest unfinished ones; an overdue one leads, a done one never appears", () => {
    assert.deepEqual(
      selectUpcoming(items).map((item) => item.id),
      ["late", "a", "b", "c"],
    );
  });
});

describe("server clock", () => {
  it("corrects the device clock by the server's", () => {
    const received = 1_000_000;
    // The device is 5 minutes behind the server.
    const serverNow = new Date(received + 300_000).toISOString();
    assert.equal(correctedNow(serverNow, received, received + 60_000), received + 360_000);
    assert.equal(correctedNow(null, received, 42), 42);
    assert.equal(correctedNow("garbage", received, 42), 42);
    assert.equal(correctedNow(serverNow, 0, 42), 42);
  });
});

describe("calendar (S4)", () => {
  it("turns months without bounds", () => {
    assert.deepEqual(shiftMonth({ year: 2026, month: 12 }, 1), { year: 2027, month: 1 });
    assert.deepEqual(shiftMonth({ year: 2026, month: 1 }, -1), { year: 2025, month: 12 });
    assert.deepEqual(shiftMonth({ year: 2026, month: 11 }, -23), { year: 2024, month: 12 });
  });

  it("takes the current month from the Moscow clock", () => {
    // 30 Nov 22:00 UTC is 1 Dec 01:00 in Moscow.
    assert.deepEqual(monthOfInstant(new Date("2026-11-30T22:00:00.000Z").getTime()), { year: 2026, month: 12 });
  });

  const items = toDeadlineItems(
    [
      homework({ id: "late", deadlineAt: "2026-11-20T20:59:00.000Z", solvedCount: 3 }),
      homework({ id: "same-day-done", deadlineAt: "2026-11-20T15:00:00.000Z", solvedCount: 8 }),
      homework({ id: "done1", deadlineAt: "2026-11-10T15:00:00.000Z", solvedCount: 8 }),
      homework({ id: "done2", deadlineAt: "2026-11-10T17:00:00.000Z", solvedCount: 8 }),
      // 23:30 Moscow time on 30 Nov = 20:30 UTC.
      homework({ id: "edge", deadlineAt: "2026-11-30T20:30:00.000Z" }),
      // Falls into November's overflow cells: 1 December.
      homework({ id: "overflow", deadlineAt: "2026-12-01T09:00:00.000Z" }),
    ],
    "ru",
  );
  const byDay = groupByMskDay(items);
  // Monday 16 November 2026, noon in Moscow.
  const now = new Date("2026-11-16T09:00:00.000Z").getTime();
  const november = buildCalendarCells({ year: 2026, month: 11 }, byDay, now);

  it("buckets deadlines by their Moscow day", () => {
    assert.deepEqual(byDay.get("2026-11-20")?.map((item) => item.id).sort(), ["late", "same-day-done"]);
    assert.deepEqual(byDay.get("2026-11-30")?.map((item) => item.id), ["edge"]);
    // 22:00 UTC belongs to the next Moscow day.
    const [night] = toDeadlineItems([homework({ id: "night", deadlineAt: "2026-11-20T22:00:00.000Z" })], "ru");
    assert.ok(night);
    assert.deepEqual([...groupByMskDay([night]).keys()], ["2026-11-21"]);
  });

  it("always builds 42 cells from the Monday on or before the 1st", () => {
    assert.equal(november.length, 42);
    // 1 November 2026 is a Sunday: the grid starts on Monday 26 October.
    assert.equal(november[0]?.key, "2026-10-26");
    assert.equal(november[6]?.key, "2026-11-01");
    assert.equal(november[41]?.key, "2026-12-06");
  });

  it("gives every homework of a day its mark: due before done, nothing on a free day", () => {
    const cell = (key: string) => november.find((entry) => entry.key === key);
    assert.deepEqual(cell("2026-11-20")?.marks, ["due", "done"]);
    assert.equal(cell("2026-11-20")?.items.length, 2);
    assert.deepEqual(cell("2026-11-10")?.marks, ["done", "done"]);
    assert.deepEqual(cell("2026-11-30")?.marks, ["due"]);
    assert.deepEqual(cell("2026-11-17")?.marks, []);
    assert.deepEqual(cell("2026-11-17")?.items, []);
    assert.equal(cell("2026-11-20")?.more, 0);
  });

  it("turns an unfinished homework red at the instant its deadline passes; a done one never", () => {
    // 20 November, 23:59 Moscow time is the deadline of «late»: a minute later it is overdue, the same day.
    const after = new Date("2026-11-20T21:00:00.000Z").getTime();
    const cells = buildCalendarCells({ year: 2026, month: 11 }, byDay, after);
    assert.deepEqual(cells.find((entry) => entry.key === "2026-11-20")?.marks, ["late", "done"]);
    assert.deepEqual(cells.find((entry) => entry.key === "2026-11-10")?.marks, ["done", "done"]);
    assert.deepEqual(cells.find((entry) => entry.key === "2026-11-30")?.marks, ["due"]);
  });

  it("draws at most three marks: a busier day keeps the two most urgent and counts the rest", () => {
    const busy = toDeadlineItems(
      [
        homework({ id: "a", deadlineAt: "2026-11-18T10:00:00.000Z", solvedCount: 8 }),
        homework({ id: "b", deadlineAt: "2026-11-18T11:00:00.000Z" }),
        homework({ id: "c", deadlineAt: "2026-11-18T12:00:00.000Z", solvedCount: 8 }),
        homework({ id: "d", deadlineAt: "2026-11-18T13:00:00.000Z" }),
        homework({ id: "e", deadlineAt: "2026-11-18T14:00:00.000Z" }),
      ],
      "ru",
    );
    assert.deepEqual(dayMarks(busy.slice(0, 3), now), { marks: ["due", "done", "done"], more: 0 });
    assert.deepEqual(dayMarks(busy.slice(0, 4), now), { marks: ["due", "due"], more: 2 });
    // «b» is overdue at 11:30 UTC on the 18th, «d» and «e» are still ahead.
    const midday = new Date("2026-11-18T11:30:00.000Z").getTime();
    assert.deepEqual(dayMarks(busy, midday), { marks: ["late", "due"], more: 3 });
    assert.deepEqual(dayMarks([], now), { marks: [], more: 0 });
  });

  it("never marks a day of a neighbouring month, even with deadlines on it", () => {
    const overflow = november.find((entry) => entry.key === "2026-12-01");
    assert.equal(overflow?.inMonth, false);
    assert.deepEqual(overflow?.items, []);
    assert.deepEqual(overflow?.marks, []);
    assert.equal(overflow?.day, 1);
    // The same day is marked once its own month is displayed.
    const december = buildCalendarCells({ year: 2026, month: 12 }, byDay, now);
    assert.deepEqual(december.find((entry) => entry.key === "2026-12-01")?.marks, ["due"]);
    // …and November's last day is an unmarked overflow cell there.
    assert.equal(december.find((entry) => entry.key === "2026-11-30")?.inMonth, false);
    assert.deepEqual(december.find((entry) => entry.key === "2026-11-30")?.marks, []);
  });

  it("rings today only inside the displayed month", () => {
    assert.deepEqual(
      november.filter((entry) => entry.isToday).map((entry) => entry.key),
      ["2026-11-16"],
    );
    // 1 November is an overflow cell of October's grid.
    const october = buildCalendarCells({ year: 2026, month: 10 }, byDay, new Date("2026-11-01T09:00:00.000Z").getTime());
    assert.equal(october.some((entry) => entry.key === "2026-11-01"), true);
    assert.equal(october.some((entry) => entry.isToday), false);
  });

  it("opens a tablet on today when something is due, else on the nearest day with a homework", () => {
    assert.equal(nearestDeadlineDay(items, "2026-11-20"), "2026-11-20");
    // The 10th is six days back, the 20th four days ahead.
    assert.equal(nearestDeadlineDay(items, "2026-11-16"), "2026-11-20");
    assert.equal(nearestDeadlineDay(items, "2026-11-12"), "2026-11-10");
    // Five days either way: the day ahead wins.
    assert.equal(nearestDeadlineDay(items, "2026-11-15"), "2026-11-20");
    assert.equal(nearestDeadlineDay(items, "2027-03-01"), "2026-12-01");
    assert.equal(nearestDeadlineDay([], "2026-11-16"), "2026-11-16");
  });

  it("names the month without the year inside the current year", () => {
    assert.equal(monthTitle({ year: 2026, month: 11 }, now, "ru"), "Ноябрь");
    assert.equal(monthTitle({ year: 2027, month: 1 }, now, "ru"), "Январь 2027");
    assert.equal(monthTitle({ year: 2026, month: 11 }, now, "en"), "November");
    assert.equal(monthTitle({ year: 2025, month: 12 }, now, "en"), "December 2025");
  });

  it("titles a day with its weekday", () => {
    const weekdays = ["понедельник", "вторник", "среда", "четверг", "пятница", "суббота", "воскресенье"];
    assert.equal(dayTitle("2026-11-26", weekdays, "ru"), "четверг, 26 ноября");
    assert.equal(dayTitle("2026-11-01", weekdays, "ru"), "воскресенье, 1 ноября");
    assert.equal(dayTitle("2026-11-26", [], "en"), "26 November");
  });
});

describe("streak block (S1)", () => {
  function streak(patch: Partial<StudentStreak>): StudentStreak {
    return {
      currentStreak: 0,
      bestStreak: 0,
      solvedToday: 0,
      solvedThisWeek: 0,
      activeDaysThisWeek: 0,
      dailyActivity: [
        { date: "2026-11-10", dayLabel: "x", count: 0 },
        { date: "2026-11-11", dayLabel: "x", count: 1 },
        { date: "2026-11-12", dayLabel: "x", count: 1 },
        { date: "2026-11-13", dayLabel: "x", count: 0 },
        { date: "2026-11-14", dayLabel: "x", count: 2 },
        { date: "2026-11-15", dayLabel: "x", count: 1 },
        { date: "2026-11-16", dayLabel: "x", count: 0 },
      ],
      ...patch,
    };
  }

  it("writes the texts of a running streak", () => {
    const texts = streakTexts(streak({ currentStreak: 3, solvedToday: 2, solvedThisWeek: 5 }), ru.student.weekly, "ru");
    assert.equal(texts.headline, "3 дня подряд");
    assert.equal(texts.solvedToday, "2 номера");
    assert.equal(texts.goalTitle, "Ещё 7 дней");
    assert.equal(texts.goalHint, "до нового цвета огонька (10 дней)");
    assert.equal(texts.weekSummary, "5 номеров закрыто за последние 7 дней.");
  });

  it("writes the texts of an empty streak, in English too", () => {
    const empty = streakTexts(streak({}), ru.student.weekly, "ru");
    assert.equal(empty.headline, "Зажгите первый день");
    assert.equal(empty.solvedToday, "Без закрытых номеров");
    assert.equal(empty.goalTitle, "Ещё 10 дней");
    const english = streakTexts(streak({ currentStreak: 1, solvedToday: 1, solvedThisWeek: 1 }), en.student.weekly, "en");
    assert.equal(english.headline, "1 day in a row");
    assert.equal(english.solvedToday, "1 problem");
    assert.equal(english.goalTitle, "9 days to go");
  });

  it("has no next goal at the top colour", () => {
    const top = streakTexts(streak({ currentStreak: 1000 }), ru.student.weekly, "ru");
    assert.equal(top.goalTitle, "Максимальный цвет");
    assert.equal(top.goalHint, null);
  });

  it("derives the weekday labels from the dates and marks the last cell as today", () => {
    const cells = weekCells(streak({}), ru.student.weekdaysShort, ru.student.weekly);
    assert.deepEqual(cells.map((cell) => cell.label), ["Вт", "Ср", "Чт", "Пт", "Сб", "Вс", "Пн"]);
    assert.deepEqual(cells.map((cell) => cell.active), [false, true, true, false, true, true, false]);
    assert.deepEqual(cells.map((cell) => cell.isToday), [false, false, false, false, false, false, true]);
    assert.equal(cells[4]?.accessibilityLabel, "Сб: закрыто номеров — 2");
    assert.equal(cells[6]?.accessibilityLabel, "Пн: нет закрытых номеров");
    assert.equal(weekCells(streak({}), en.student.weekdaysShort, en.student.weekly)[0]?.label, "Tue");
  });
});

describe("personal note (S3)", () => {
  it("is dirty only when the trimmed draft differs from the saved value", () => {
    assert.equal(isNoteDirty("  спросить про корень ", "спросить про корень"), false);
    assert.equal(isNoteDirty("", "   "), false);
    assert.equal(isNoteDirty("", "спросить"), true);
    assert.equal(isNoteDirty("спросить!", "спросить"), true);
  });

  it("normalises a draft like the server: trim, then cut to 240", () => {
    assert.equal(normalizeNoteDraft("  abc  "), "abc");
    assert.equal(normalizeNoteDraft(` ${"я".repeat(300)} `).length, NOTE_MAX_LENGTH);
    assert.equal(normalizeNoteDraft("   "), "");
  });

  it("starts the field with a draft that still waits for a connection", () => {
    assert.equal(initialNoteText("с сервера", null), "с сервера");
    assert.equal(initialNoteText("с сервера", undefined), "с сервера");
    assert.equal(initialNoteText("с сервера", "черновик"), "черновик");
    // A queued clearing is a draft too.
    assert.equal(initialNoteText("с сервера", ""), "");
  });

  it("shows one status at a time: saving, then queued, then the saved flash", () => {
    assert.equal(noteStatus({ saving: true, queued: true, savedFlash: true }), "saving");
    assert.equal(noteStatus({ saving: false, queued: true, savedFlash: true }), "queued");
    assert.equal(noteStatus({ saving: false, queued: false, savedFlash: true }), "saved");
    assert.equal(noteStatus({ saving: false, queued: false, savedFlash: false }), null);
  });

  it("a waiting draft on an online device is «retrying», not «will save when online»", () => {
    assert.equal(noteStatus({ saving: false, queued: true, savedFlash: false, online: true }), "retrying");
    assert.equal(noteStatus({ saving: false, queued: true, savedFlash: false, online: false }), "queued");
    assert.equal(noteStatus({ saving: true, queued: true, savedFlash: false, online: true }), "saving");
    assert.equal(noteStatus({ saving: false, queued: false, savedFlash: true, online: true }), "saved");
  });

  describe("a note that changed on the server under an open editor", () => {
    const idle = { saved: "", draft: "", writing: false, typing: false };

    it("replaces the text of an untouched field (a stale cached render followed by the refetch)", () => {
      assert.deepEqual(adoptServerNote(idle, "Заметка перед уходом"), { saved: "Заметка перед уходом", draft: "Заметка перед уходом" });
      // A note removed elsewhere empties an untouched field too.
      assert.deepEqual(adoptServerNote({ ...idle, saved: "старая", draft: "старая" }, ""), { saved: "", draft: "" });
    });

    it("keeps what the student has typed and only moves the baseline", () => {
      assert.deepEqual(adoptServerNote({ ...idle, draft: "пишу" }, "с сервера"), { saved: "с сервера", draft: "пишу" });
      // A typing pause that is still running counts as typed text, even when the draft equals the baseline again.
      assert.deepEqual(adoptServerNote({ ...idle, saved: "а", draft: "а", typing: true }, "б"), { saved: "б", draft: "а" });
    });

    it("ignores its own save coming back, so the field is never rewritten while typing", () => {
      // Saved "abc" (trimmed by the server); the field still holds the trailing space.
      assert.equal(adoptServerNote({ ...idle, saved: "abc", draft: "abc " }, "abc"), null);
      assert.equal(adoptServerNote({ ...idle, saved: "abc", draft: "abc" }, " abc "), null);
    });

    it("ignores the news while a write of this editor is in flight or queued", () => {
      assert.equal(adoptServerNote({ ...idle, draft: "новая", writing: true }, "с сервера"), null);
    });
  });
});
