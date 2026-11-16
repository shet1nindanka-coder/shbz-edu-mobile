// Pure helpers of the content browse screens: the numbers field summary, the fill status of a number,
// the reorder draft.
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { applyOrder, isSameOrder, moveInOrder, reconcileOrder } from "../src/screens/content/browse/topic-order";
import { canSaveLatexDraft, hasLatex, numberFillStatus } from "../src/screens/content/shared/number-fill-status";
import {
  compressNumbersToRanges,
  NUMBERS_PREVIEW_MAX_LENGTH,
  summarizeNumbersInput,
  truncatePreview,
} from "../src/screens/content/shared/numbers-summary";

describe("numbers field summary", () => {
  it("compresses consecutive numbers into ranges in the recorded spelling", () => {
    assert.equal(compressNumbersToRanges([]), "");
    assert.equal(compressNumbersToRanges(["7"]), "7");
    assert.equal(compressNumbersToRanges(["1", "2", "3", "8", "12", "13"]), "1-3, 8, 12-13");
    assert.equal(compressNumbersToRanges(["051001", "051002", "051003"]), "051001-051003");
  });

  it("never joins values longer than 15 digits into a range", () => {
    assert.equal(compressNumbersToRanges(["1234567890123456", "1234567890123457"]), "1234567890123456, 1234567890123457");
  });

  it("truncates the final list to 120 characters plus dots", () => {
    const long = "1, ".repeat(60);
    const cut = truncatePreview(long);
    assert.equal(cut.endsWith("..."), true);
    assert.equal(cut.length <= NUMBERS_PREVIEW_MAX_LENGTH + 3, true);
    assert.equal(truncatePreview("1-5"), "1-5");
  });

  it("reports empty, unrecognized and parsed input", () => {
    assert.deepEqual(summarizeNumbersInput("   "), { state: "empty", count: 0, first: null, last: null, preview: "" });
    assert.equal(summarizeNumbersInput("abc").state, "unrecognized");
    assert.deepEqual(summarizeNumbersInput("1-5, 8, 12-14"), { state: "ok", count: 9, first: "1", last: "14", preview: "1-5, 8, 12-14" });
  });

  it("keeps leading zeros and drops twins of one number", () => {
    const summary = summarizeNumbersInput("010203, 10203, 010204");
    assert.equal(summary.count, 2);
    assert.equal(summary.first, "010203");
    assert.equal(summary.preview, "010203-010204");
  });
});

describe("number fill status", () => {
  it("is full, partial or empty by the saved values", () => {
    assert.equal(numberFillStatus("$x$", "2"), "full");
    assert.equal(numberFillStatus("$x$", null), "partial");
    assert.equal(numberFillStatus(null, "2"), "partial");
    assert.equal(numberFillStatus("  ", ""), "empty");
    assert.equal(numberFillStatus(undefined, undefined), "empty");
  });

  it("treats blank strings as missing", () => {
    assert.equal(hasLatex(" \n "), false);
    assert.equal(hasLatex("a"), true);
    assert.equal(hasLatex(null), false);
  });

  it("offers save only for a non-blank draft that differs from the saved value", () => {
    assert.equal(canSaveLatexDraft("", null), false);
    assert.equal(canSaveLatexDraft("   ", "x"), false);
    assert.equal(canSaveLatexDraft(" x ", "x"), false);
    assert.equal(canSaveLatexDraft("x + 1", "x"), true);
    assert.equal(canSaveLatexDraft("x", null), true);
  });
});

describe("topic order", () => {
  const order = ["a", "b", "c"];

  it("moves a topic one step and leaves the edges alone", () => {
    assert.deepEqual(moveInOrder(order, "b", "up"), ["b", "a", "c"]);
    assert.deepEqual(moveInOrder(order, "b", "down"), ["a", "c", "b"]);
    assert.equal(moveInOrder(order, "a", "up"), order);
    assert.equal(moveInOrder(order, "c", "down"), order);
    assert.equal(moveInOrder(order, "zzz", "up"), order);
    assert.deepEqual(order, ["a", "b", "c"]);
  });

  it("compares orders", () => {
    assert.equal(isSameOrder(["a", "b"], ["a", "b"]), true);
    assert.equal(isSameOrder(["a", "b"], ["b", "a"]), false);
    assert.equal(isSameOrder(["a"], ["a", "b"]), false);
  });

  it("applies an id order to the cached list and keeps unknown topics at the end", () => {
    const items = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
    assert.deepEqual(
      applyOrder(items, ["c", "a", "b"]).map((item) => item.id),
      ["c", "a", "b", "d"],
    );
  });

  it("reconciles the draft with a changed server list", () => {
    assert.deepEqual(reconcileOrder(["c", "a", "b"], ["a", "b", "c"]), ["c", "a", "b"]);
    // «b» was deleted, «d» was created meanwhile.
    assert.deepEqual(reconcileOrder(["c", "a", "b"], ["a", "c", "d"]), ["c", "a", "d"]);
  });
});
