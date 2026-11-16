// Pure model of the teacher's overview: the three cards, the source of the calls widget, the count-up.
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getDictionary } from "../src/i18n/get-dictionary";
import { buildHomeCards, countUpFrame, homeCardA11yLabel, pickCallCounts } from "../src/screens/teacher/home/home-cards";

const stats = { totalTopics: 6, totalNumbers: 62, totalStudents: 11, totalFiles: 9, totalMarked: 140 };

describe("teacher home cards", () => {
  it("shows topics, students and calls in the site's order with the site's texts", () => {
    const t = getDictionary("ru").teacherHome;
    const cards = buildHomeCards(stats, { due: 2, overdue: 1 }, t);

    assert.deepEqual(
      cards.map((card) => card.id),
      ["topics", "students", "calls"],
    );
    assert.deepEqual(cards[0], {
      id: "topics",
      kicker: "Темы",
      title: "Материалы и ответы",
      stats: [
        { label: "Темы", value: 6 },
        { label: "Номера", value: 62 },
      ],
      link: { screen: "content.topics" },
    });
    assert.deepEqual(cards[1]?.stats, [
      { label: "Ученики", value: 11 },
      { label: "Файлы", value: 9 },
    ]);
    assert.deepEqual(cards[1]?.link, { screen: "teacher.students" });
    assert.deepEqual(cards[2]?.stats, [
      { label: "Пора позвонить", value: 2 },
      { label: "Просрочено", value: 1 },
    ]);
    assert.deepEqual(cards[2]?.link, { screen: "calls.list" });
  });

  it("never shows the marked-statuses total (the site does not render it)", () => {
    const cards = buildHomeCards(stats, { due: 0, overdue: 0 }, getDictionary("en").teacherHome);
    const values = cards.flatMap((card) => card.stats.map((stat) => stat.value));
    assert.equal(values.includes(stats.totalMarked), false);
    assert.equal(cards[2]?.title, "Parent contact");
  });

  it("builds the screen-reader label from the final numbers", () => {
    const [topics] = buildHomeCards(stats, { due: 0, overdue: 0 }, getDictionary("ru").teacherHome);
    assert.ok(topics);
    assert.equal(homeCardA11yLabel(topics), "Темы. Материалы и ответы. Темы: 6, Номера: 62");
  });
});

describe("calls widget source", () => {
  const fromHome = { data: { due: 1, overdue: 0 }, updatedAt: 1_000 };

  it("uses the home summary until the dedicated counters arrive", () => {
    assert.deepEqual(pickCallCounts(fromHome, null), { due: 1, overdue: 0 });
  });

  it("prefers whichever read is newer; a tie goes to the dedicated counters", () => {
    assert.deepEqual(pickCallCounts(fromHome, { data: { due: 0, overdue: 0 }, updatedAt: 2_000 }), { due: 0, overdue: 0 });
    assert.deepEqual(pickCallCounts(fromHome, { data: { due: 3, overdue: 2 }, updatedAt: 1_000 }), { due: 3, overdue: 2 });
    assert.deepEqual(pickCallCounts(fromHome, { data: { due: 3, overdue: 2 }, updatedAt: 500 }), { due: 1, overdue: 0 });
  });
});

describe("count-up frame", () => {
  it("starts at zero and ends on the target", () => {
    assert.equal(countUpFrame(62, 0), 0);
    assert.equal(countUpFrame(62, 1), 62);
    assert.equal(countUpFrame(0, 0.5), 0);
  });

  it("eases out: more than half of the way at half of the time", () => {
    assert.equal(countUpFrame(100, 0.5), 88);
    assert.ok(countUpFrame(100, 0.25) > 50);
  });

  it("clamps progress outside 0..1 (a late frame never overshoots)", () => {
    assert.equal(countUpFrame(40, -1), 0);
    assert.equal(countUpFrame(40, 1.7), 40);
  });
});
