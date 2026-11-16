// Ported from the site (tests/lesson-plan-candidates.test.ts): the same cases against the ported module.
// [MOBILE] The site-settings case (`aiShortlistModel` default) is not ported: settings are server state.
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPlanCandidates,
  buildShortlistCandidates,
  trimToTopicHeads,
  type AvailableNumber
} from "@/domain/lesson-plan";

const now = new Date("2026-11-05T12:00:00Z");

function candidate(topicId: string, number: string, extra: Partial<AvailableNumber> = {}): AvailableNumber {
  return {
    id: `${topicId}-${number}`,
    number,
    topicId,
    topicTitle: `Тема ${topicId}`,
    topicDisplayOrder: 1,
    displayOrder: Number(number),
    estimatedMinutes: null,
    conditionLatex: null,
    status: null,
    note: null,
    deadlineAt: null,
    statusChangedAt: null,
    assignedBefore: false,
    attemptedInLesson: false,
    ...extra
  };
}

test("trimToTopicHeads keeps the head of each topic plus every gap, in order", () => {
  const available = [
    candidate("a", "1"),
    candidate("a", "2"),
    candidate("a", "3"),
    candidate("a", "4", { status: "RED" }),
    candidate("a", "5", { assignedBefore: true }),
    candidate("a", "6", { deadlineAt: new Date("2026-11-01T00:00:00Z") }),
    candidate("a", "7"),
    candidate("b", "1"),
    candidate("b", "2"),
    candidate("b", "3", { attemptedInLesson: true })
  ];

  assert.deepEqual(
    trimToTopicHeads(available, 2, now).map((entry) => entry.id),
    ["a-1", "a-2", "a-4", "a-5", "a-6", "b-1", "b-2", "b-3"]
  );
});

test("buildShortlistCandidates groups by topic and encodes facts compactly", () => {
  const groups = buildShortlistCandidates(
    [
      candidate("a", "1", { estimatedMinutes: 8 }),
      candidate("a", "2", {
        status: "RED",
        assignedBefore: true,
        statusChangedAt: new Date("2026-10-26T12:00:00Z"),
        note: "путает знак"
      }),
      candidate("b", "7", { attemptedInLesson: true, deadlineAt: new Date("2026-11-01T00:00:00Z") })
    ],
    now
  );

  assert.deepEqual(groups, [
    { topic: "Тема a", rows: [[0, "1", 8], [1, "2", null, "RA", 10, "путает знак"]] },
    { topic: "Тема b", rows: [[2, "7", null, "LO"]] }
  ]);
});

test("buildPlanCandidates drops null and false fields but keeps index 0 and conditions", () => {
  const [first, second] = buildPlanCandidates(
    [
      candidate("a", "1", { conditionLatex: "x^2=4", estimatedMinutes: 0 }),
      candidate("a", "2", { status: "RED", assignedBefore: true, statusChangedAt: now })
    ],
    now
  );

  assert.deepEqual(first, { index: 0, topic: "Тема a", number: "1", bankMinutes: 0, condition: "x^2=4" });
  assert.deepEqual(second, {
    index: 1,
    topic: "Тема a",
    number: "2",
    status: "RED",
    daysSinceStatus: 0,
    assignedBefore: true
  });
});
