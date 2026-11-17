// Pure rules of the student study screens (02 S1, S3, S4): upcoming homeworks, deadline card texts, the
// month grid in Moscow days, the streak texts and the note editor's decisions.
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { HomeworkDeadlineSummary, StudentStreak } from "../src/api/types";
import { getDictionary } from "../src/i18n/get-dictionary";
import {
  buildCalendarCells,
  describeDeadline,
  groupByMskDay,
  isSameMonth,
  monthOfInstant,
  selectUpcoming,
  shiftMonth,
  splitUpcoming,
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
import { hexWithAlpha, streakMotionKind, streakTexts, weekCells } from "../src/screens/student/study/streak-model";
import { longestWordLength, theoryTitleBasis } from "../src/screens/student/study/theory-layout";

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

  it("splits into the hero and up to three list cards", () => {
    const blocks = splitUpcoming(items);
    assert.equal(blocks.hero?.id, "late");
    assert.deepEqual(blocks.list.map((item) => item.id), ["a", "b", "c"]);
    assert.equal(blocks.showList, true);
  });

  it("with exactly one upcoming homework the list block is absent", () => {
    const blocks = splitUpcoming(items.filter((item) => item.id === "a" || item.id === "done"));
    assert.equal(blocks.hero?.id, "a");
    assert.deepEqual(blocks.list, []);
    assert.equal(blocks.showList, false);
  });

  it("with nothing upcoming there is no hero and the list block shows its empty chip", () => {
    const blocks = splitUpcoming(items.filter((item) => item.id === "done"));
    assert.equal(blocks.hero, null);
    assert.deepEqual(blocks.list, []);
    assert.equal(blocks.showList, true);
  });
});

describe("deadline card texts", () => {
  const now = new Date("2026-11-16T09:00:00.000Z").getTime();
  const [started, untouched, done] = toDeadlineItems(
    [
      homework({ id: "started", deadlineAt: "2026-11-20T20:59:00.000Z", solvedCount: 3 }),
      homework({ id: "untouched", deadlineAt: "2026-11-21T20:59:00.000Z" }),
      homework({ id: "done", deadlineAt: "2026-11-22T20:59:00.000Z", solvedCount: 8 }),
    ],
    "ru",
  );

  it("prints the meta line, the progress label and the fraction", () => {
    assert.ok(started && untouched && done);
    const texts = describeDeadline(started, ru.student.deadlineList, "ru", now);
    assert.equal(texts.meta, "ДЗ до 20 ноября 2026 г. · Выполнено 3 из 8");
    assert.equal(texts.percent, 38);
    assert.equal(texts.progress, "Прогресс ДЗ: 38%");
    assert.equal(texts.fraction, "3/8");
    assert.equal(texts.done, false);
    assert.equal(texts.overdue, false);
    assert.equal(describeDeadline(untouched, ru.student.deadlineList, "ru", now).progress, "ДЗ ещё не начато");
    assert.equal(describeDeadline(done, ru.student.deadlineList, "ru", now).progress, "ДЗ выполнено полностью");
    assert.equal(describeDeadline(started, en.student.deadlineList, "en", now).meta, "Due 20 November 2026 · 3 of 8 done");
  });

  it("formats the deadline as a Moscow date whatever the instant's UTC day is", () => {
    // 21:30 UTC on the 20th is already the 21st in Moscow.
    const [item] = toDeadlineItems([homework({ id: "x", deadlineAt: "2026-11-20T21:30:00.000Z" })], "ru");
    assert.ok(item);
    assert.match(describeDeadline(item, ru.student.deadlineList, "ru", now).meta, /^ДЗ до 21 ноября 2026 г\./);
  });

  it("marks an unfinished homework overdue once the deadline has passed; a done one never", () => {
    assert.ok(started && done);
    const later = new Date("2026-11-23T00:00:00.000Z").getTime();
    assert.equal(describeDeadline(started, ru.student.deadlineList, "ru", later).overdue, true);
    const doneTexts = describeDeadline(done, ru.student.deadlineList, "ru", later);
    assert.equal(doneTexts.overdue, false);
    assert.equal(doneTexts.done, true);
  });

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
    assert.equal(isSameMonth(shiftMonth({ year: 2026, month: 11 }, 0), { year: 2026, month: 11 }), true);
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
  const november = buildCalendarCells({ year: 2026, month: 11 }, byDay, "2026-11-16");

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

  it("marks a day red when something is unfinished and amber when everything is done", () => {
    const cell = (key: string) => november.find((entry) => entry.key === key);
    assert.equal(cell("2026-11-20")?.state, "late");
    assert.equal(cell("2026-11-20")?.items.length, 2);
    assert.equal(cell("2026-11-10")?.state, "done");
    assert.equal(cell("2026-11-30")?.state, "late");
    assert.equal(cell("2026-11-17")?.state, "plain");
    assert.deepEqual(cell("2026-11-17")?.items, []);
  });

  it("never marks a day of a neighbouring month, even with deadlines on it", () => {
    const overflow = november.find((entry) => entry.key === "2026-12-01");
    assert.equal(overflow?.state, "out");
    assert.deepEqual(overflow?.items, []);
    assert.equal(overflow?.day, 1);
    // The same day is marked once its own month is displayed.
    const december = buildCalendarCells({ year: 2026, month: 12 }, byDay, "2026-11-16");
    assert.equal(december.find((entry) => entry.key === "2026-12-01")?.state, "late");
    // …and November's last day is an unmarked overflow cell there.
    assert.equal(december.find((entry) => entry.key === "2026-11-30")?.state, "out");
  });

  it("rings today only inside the displayed month", () => {
    assert.deepEqual(
      november.filter((entry) => entry.isToday).map((entry) => entry.key),
      ["2026-11-16"],
    );
    const october = buildCalendarCells({ year: 2026, month: 10 }, byDay, "2026-11-01");
    // 1 November is an overflow cell of October's grid.
    assert.equal(october.some((entry) => entry.key === "2026-11-01"), true);
    assert.equal(october.some((entry) => entry.isToday), false);
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

  it("chooses the animation of a counter change", () => {
    assert.equal(streakMotionKind(0, 1), "ignite");
    assert.equal(streakMotionKind(2, 3), "grow");
    assert.equal(streakMotionKind(3, 0), "drop");
    assert.equal(streakMotionKind(3, 2), "drop");
    assert.equal(streakMotionKind(3, 3), null);
  });

  it("thins the flame colour for the glow of the animation", () => {
    assert.equal(hexWithAlpha("#f2922e", 0.35), "rgba(242, 146, 46, 0.35)");
    assert.equal(hexWithAlpha("#000000", 1), "rgba(0, 0, 0, 1)");
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

describe("theory card layout (S2)", () => {
  // Card-title type and the widths measured in the web build: the button «Открыть» is 112 wide, the row
  // gap 12, and a card's inner width is the window width minus 66.
  const FONT = 17;
  const BUTTON = 112 + 12;
  const sharesRow = (titles: string[], windowWidth: number, fontScale = 1) => theoryTitleBasis(titles, FONT, fontScale) + BUTTON <= windowWidth - 66;

  it("finds the longest piece a line cannot break", () => {
    assert.equal(longestWordLength("Производная и исследование функций"), 12);
    assert.equal(longestWordLength("Логарифмические уравнения"), 15);
    // A compound word may break at its hyphen.
    assert.equal(longestWordLength("Дробно-рациональные уравнения"), 12);
    assert.equal(longestWordLength(""), 0);
  });

  it("gives the title at least the measured width of its longest word", () => {
    // Measured in the card-title type: «исследование» 133, «Логарифмические» 174, «Тригонометрические» 200.
    assert.ok(theoryTitleBasis(["Производная и исследование функций"], FONT, 1) >= 133);
    assert.ok(theoryTitleBasis(["Логарифмические уравнения"], FONT, 1) >= 174);
    assert.ok(theoryTitleBasis(["Тригонометрические уравнения"], FONT, 1) >= 200);
  });

  it("moves the button under the title where the word would not fit beside it", () => {
    // The audit's case: 320 pt, «исследование» was split in a 130 pt column.
    assert.equal(sharesRow(["Производная и исследование функций"], 320), false);
    assert.equal(sharesRow(["Производная и исследование функций"], 360), true);
    // «Логарифмические» (174) does not fit the 170 pt column of a 360 pt phone; it does at 390.
    assert.equal(sharesRow(["Логарифмические уравнения"], 360), false);
    assert.equal(sharesRow(["Логарифмические уравнения"], 390), true);
    // Short words keep the one-row card even on the narrowest phone.
    assert.equal(sharesRow(["Текстовые задачи"], 320), true);
  });

  it("takes one layout for the whole list and follows the OS font scale", () => {
    const titles = ["Текстовые задачи", "Логарифмические уравнения"];
    assert.equal(theoryTitleBasis(titles, FONT, 1), theoryTitleBasis(["Логарифмические уравнения"], FONT, 1));
    assert.equal(sharesRow(titles, 360), false);
    assert.equal(sharesRow(["Производная и исследование функций"], 360, 1.3), false);
    // An empty list (or DOCX-only) still has a sane minimum.
    assert.equal(theoryTitleBasis([], FONT, 1), 120);
    assert.equal(theoryTitleBasis([], FONT, 0.85), 120);
  });
});
