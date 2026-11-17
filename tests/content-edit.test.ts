// Pure rules of the topic edit screen: form drafts, the destructive-change confirmation, the pages of the
// statements-and-answers list.
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { NumbersChangePreview } from "../src/api/types";
import {
  ANSWERS_PAGE_SIZE,
  assignedNumbers,
  canConfirmRemoval,
  clampPage,
  countFilled,
  dangerousNumbers,
  draftValue,
  findNumberEntry,
  isNumbersChangePreview,
  missingRequiredField,
  nextDraft,
  numbersFieldText,
  pageCountOf,
  pageOfNumber,
  pageRange,
  pageSlice,
  previewFailureAction,
  removalConfirmation,
} from "../src/screens/content/edit/topic-edit";
import {
  clearEditorFocus,
  clearOpenedFromEditor,
  markOpenedFromEditor,
  peekEditorFocus,
  peekOpenedFromEditor,
  requestEditorFocus,
} from "../src/screens/content/shared/editor-links";

const plan = (overrides: Partial<NumbersChangePreview> = {}): NumbersChangePreview => ({
  keptCount: 4,
  added: ["130"],
  requiresConfirmation: true,
  requiresAssignedConfirmation: false,
  removed: [
    { number: "112", summary: "статус у 2 учеников", hasStudentWork: true, isAssigned: false },
    { number: "118", summary: "входит в 1 активное ДЗ", hasStudentWork: true, isAssigned: true },
    { number: "125", summary: "ничего не потеряется", hasStudentWork: false, isAssigned: false },
  ],
  ...overrides,
});

describe("topic edit form drafts", () => {
  it("prefills the numbers field with every number joined by a comma and a space", () => {
    assert.equal(numbersFieldText([]), "");
    assert.equal(numbersFieldText([{ number: "010203" }, { number: "12" }, { number: "13" }]), "010203, 12, 13");
  });

  it("follows the saved value until the user changes the field", () => {
    assert.equal(draftValue(null, "Линейные уравнения"), "Линейные уравнения");
    assert.equal(draftValue("", "Линейные уравнения"), "");
    assert.equal(draftValue("Новое", "Линейные уравнения"), "Новое");
  });

  it("drops the draft again once the typed text equals the saved one", () => {
    assert.equal(nextDraft("Линейные уравнения", "Линейные уравнения"), null);
    assert.equal(nextDraft("Линейные уравнения ", "Линейные уравнения"), "Линейные уравнения ");
    assert.equal(nextDraft("", ""), null);
  });

  it("requires the title and the numbers, not the description", () => {
    assert.equal(missingRequiredField({ title: "  ", description: "", numbers: "1-5" }), "title");
    assert.equal(missingRequiredField({ title: "Тема", description: "", numbers: " \n" }), "numbers");
    assert.equal(missingRequiredField({ title: "Тема", description: "", numbers: "1-5" }), null);
  });
});

describe("destructive change of the number set", () => {
  it("lists only removed numbers with student work", () => {
    assert.deepEqual(
      dangerousNumbers(plan()).map((entry) => entry.number),
      ["112", "118"],
    );
  });

  it("names the numbers of issued homework in the acknowledgement", () => {
    assert.deepEqual(
      assignedNumbers(plan()).map((entry) => entry.number),
      ["118"],
    );
  });

  it("gates the destructive button on the acknowledgement only when one is asked for", () => {
    assert.equal(canConfirmRemoval(plan(), false), true);
    assert.equal(canConfirmRemoval(plan({ requiresAssignedConfirmation: true }), false), false);
    assert.equal(canConfirmRemoval(plan({ requiresAssignedConfirmation: true }), true), true);
  });

  it("sends the numbers with work and the acknowledgement the user gave", () => {
    assert.deepEqual(removalConfirmation(plan(), false), { confirmNumbersRemoval: ["112", "118"], allowAssignedRemoval: false });
    assert.deepEqual(removalConfirmation(plan({ requiresAssignedConfirmation: true }), true), {
      confirmNumbersRemoval: ["112", "118"],
      allowAssignedRemoval: true,
    });
    // A tick left over from an earlier plan must not travel with a plan that does not ask for it.
    assert.equal(removalConfirmation(plan(), true).allowAssignedRemoval, false);
  });

  it("accepts a fresh preview from the error details and nothing else", () => {
    assert.equal(isNumbersChangePreview(plan()), true);
    assert.equal(isNumbersChangePreview(null), false);
    assert.equal(isNumbersChangePreview("numbersConfirm"), false);
    assert.equal(isNumbersChangePreview({ keptCount: 1, added: [], removed: [] }), false);
    assert.equal(isNumbersChangePreview({ summary: {}, lines: [] }), false);
  });

  it("stops on a refusal the save would repeat and saves anyway otherwise", () => {
    assert.equal(previewFailureAction("emptyNumbers"), "stop");
    assert.equal(previewFailureAction("numbersTwin"), "stop");
    assert.equal(previewFailureAction("topicNotFound"), "stop");
    assert.equal(previewFailureAction("rateLimited"), "saveAnyway");
    assert.equal(previewFailureAction("serviceUnavailable"), "saveAnyway");
    assert.equal(previewFailureAction("network"), "saveAnyway");
    assert.equal(previewFailureAction(undefined), "saveAnyway");
  });
});

describe("statements and answers pages", () => {
  const numbers = Array.from({ length: 23 }, (_, index) => String(index + 1));

  it("shows ten numbers per page and always has a first page", () => {
    assert.equal(ANSWERS_PAGE_SIZE, 10);
    assert.equal(pageCountOf(0), 1);
    assert.equal(pageCountOf(10), 1);
    assert.equal(pageCountOf(11), 2);
    assert.equal(pageCountOf(23), 3);
  });

  it("keeps the page inside the list after numbers are removed", () => {
    assert.equal(clampPage(0, 3), 1);
    assert.equal(clampPage(7, 3), 3);
    assert.equal(clampPage(2.9, 3), 2);
    assert.equal(clampPage(Number.NaN, 3), 1);
    assert.equal(clampPage(2, 0), 1);
  });

  it("slices the current page", () => {
    assert.deepEqual(pageSlice(numbers, 1), numbers.slice(0, 10));
    assert.deepEqual(pageSlice(numbers, 3), ["21", "22", "23"]);
    assert.deepEqual(pageSlice(numbers, 9), ["21", "22", "23"]);
    assert.deepEqual(pageSlice([], 1), []);
  });

  it("reports the shown range in 1-based positions", () => {
    assert.deepEqual(pageRange(23, 1), { start: 1, end: 10 });
    assert.deepEqual(pageRange(23, 3), { start: 21, end: 23 });
    assert.deepEqual(pageRange(23, 8), { start: 21, end: 23 });
    assert.deepEqual(pageRange(0, 1), { start: 0, end: 0 });
  });

  it("counts saved statements and answers, ignoring blank text", () => {
    assert.deepEqual(
      countFilled([
        { conditionLatex: "$x$", answerLatex: "$1$" },
        { conditionLatex: "  ", answerLatex: "$2$" },
        { conditionLatex: "$y$", answerLatex: null },
        { conditionLatex: null, answerLatex: null },
      ]),
      { conditions: 2, answers: 2 },
    );
  });

  it("finds the page of a number by its normalised form, as the site's ?number=N does", () => {
    const entries = Array.from({ length: 23 }, (_, index) => ({ number: index === 11 ? "0012" : String(index + 1) }));
    assert.equal(pageOfNumber(entries, "1"), 1);
    assert.equal(pageOfNumber(entries, "10"), 1);
    assert.equal(pageOfNumber(entries, "11"), 2);
    // «12» is recorded as «0012»: both spellings point at the same entry.
    assert.equal(pageOfNumber(entries, "12"), 2);
    assert.equal(pageOfNumber(entries, "0012"), 2);
    assert.equal(findNumberEntry(entries, "012"), entries[11]);
    assert.equal(pageOfNumber(entries, "23"), 3);
    assert.equal(pageOfNumber(entries, "24"), null);
    assert.equal(pageOfNumber(entries, null), null);
    assert.equal(pageOfNumber(entries, "12a"), null);
    assert.equal(findNumberEntry([], "1"), null);
  });
});

describe("hand-overs between the topic editor and the number screen", () => {
  it("marks a number as opened from the editor until the number screen clears the mark", () => {
    assert.equal(peekOpenedFromEditor("top_a", "12"), false);
    markOpenedFromEditor("top_a", "12");
    // A render may run twice before it commits: peeking does not consume the mark.
    assert.equal(peekOpenedFromEditor("top_a", "12"), true);
    assert.equal(peekOpenedFromEditor("top_a", "12"), true);
    assert.equal(peekOpenedFromEditor("top_a", "13"), false);
    assert.equal(peekOpenedFromEditor("top_b", "12"), false);
    clearOpenedFromEditor();
    assert.equal(peekOpenedFromEditor("top_a", "12"), false);
  });

  it("hands the number to show to the editor of the same topic only", () => {
    assert.equal(peekEditorFocus("top_a"), null);
    requestEditorFocus("top_a", "0012");
    assert.equal(peekEditorFocus("top_b"), null);
    assert.equal(peekEditorFocus("top_a"), "0012");
    assert.equal(peekEditorFocus("top_a"), "0012");
    clearEditorFocus();
    assert.equal(peekEditorFocus("top_a"), null);
  });
});
