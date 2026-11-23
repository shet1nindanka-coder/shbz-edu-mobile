// Numbers of a homework without growing the screen: counts, the strip, the focused number, the groups of
// «Все номера» (docs/design/glass-over-paper.md §7, principle 5).
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  commonPrefixLength,
  countByStatus,
  groupByStatus,
  leftCount,
  pickFocusNumberId,
  shortNumber,
  stripNumbers,
  type FocusNumber,
} from "@/domain/number-focus";

const n = (number: string, status: FocusNumber["status"]): FocusNumber => ({ id: `id-${number}`, number, status });

const numbers: FocusNumber[] = [n("051001", "GREEN"), n("051002", null), n("051003", "YELLOW"), n("051004", "RED"), n("051005", null), n("051017", "RED")];

describe("number focus", () => {
  it("counts the numbers by status", () => {
    const counts = countByStatus(numbers);
    assert.deepEqual(counts, { green: 1, yellow: 1, red: 2, none: 2 });
    assert.equal(leftCount(counts), 4);
  });

  it("puts «нужна помощь» first in the strip, then the unmarked, and nothing that is closed", () => {
    assert.deepEqual(
      stripNumbers(numbers).map((entry) => entry.number),
      ["051004", "051017", "051002", "051005"],
    );
  });

  it("shows every number in the strip when nothing is left", () => {
    const closed = [n("051001", "GREEN"), n("051002", "YELLOW")];
    assert.deepEqual(stripNumbers(closed), closed);
  });

  it("focuses the picked number, else the first that needs help, else the first unmarked, else the first", () => {
    assert.equal(pickFocusNumberId(numbers), "id-051004");
    assert.equal(pickFocusNumberId(numbers, "id-051003"), "id-051003");
    assert.equal(pickFocusNumberId(numbers, "gone"), "id-051004");
    assert.equal(pickFocusNumberId([n("1", "GREEN"), n("2", null)]), "id-2");
    assert.equal(pickFocusNumberId([n("1", "GREEN"), n("2", "YELLOW")]), "id-1");
    assert.equal(pickFocusNumberId([]), null);
  });

  it("groups «Все номера» by status: help, left, corrected, solved", () => {
    assert.deepEqual(
      groupByStatus(numbers).map((group) => [group.status, group.numbers.map((entry) => entry.number)]),
      [
        ["RED", ["051004", "051017"]],
        ["none", ["051002", "051005"]],
        ["YELLOW", ["051003"]],
        ["GREEN", ["051001"]],
      ],
    );
    assert.deepEqual(groupByStatus([n("1", "GREEN")]).map((group) => group.status), ["GREEN"]);
  });

  it("shortens the tiles to the last three digits only when every number shares the rest", () => {
    const prefix = commonPrefixLength(numbers);
    assert.equal(prefix, 3);
    assert.equal(shortNumber("051004", prefix), "004");
    // Leading zeros are part of the number: it stays a string, never a numeric value.
    assert.equal(shortNumber("051004", 0), "051004");
    assert.equal(commonPrefixLength([n("051004", null), n("064010", null)]), 0);
    assert.equal(commonPrefixLength([n("118", null), n("120", null)]), 0);
    assert.equal(commonPrefixLength([n("051004", null)]), 0);
    assert.equal(commonPrefixLength([n("051004", null), n("0510100", null)]), 0);
  });
});
