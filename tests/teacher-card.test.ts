// Pure rules of the student card: homework review (derived flags, "accept AI verdicts", placement of the
// cards), the assign board (selection, request body) and the lessons segment (set editing, plan state).
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type {
  AssignBoardTopic,
  HomeworkNumberStatus,
  LessonBoardItem,
  SolutionVerdict,
  TeacherHomeworkAssignment,
  TeacherHomeworkCheck,
  TeacherStudentLesson,
} from "../src/api/types";
import {
  buildIssueRequest,
  canAssign,
  liveSelection,
  pickTopic,
  toggleSelection,
  withConditions,
} from "../src/screens/teacher/card/assign-logic";
import {
  freeBankNumbers,
  lessonPlanState,
  lessonSetIds,
  markLessonPending,
  patchItemResult,
  patchLessonItems,
  planSettled,
  setWithNumber,
  setWithoutNumber,
  splitLessonParts,
} from "../src/screens/teacher/card/lessons-logic";
import {
  EMPTY_PLACEMENT,
  acceptVerdictChanges,
  applyStatuses,
  buildReviewRows,
  canAcceptVerdicts,
  chunkChanges,
  countVerdicts,
  hasDiagnostics,
  injectionResults,
  isAssignmentCompleted,
  isAssignmentOverdue,
  latestDoneCheck,
  patchHomeworkStatuses,
  reconcilePlacement,
  reviewRowIndex,
  shortenRecognizedAnswer,
  unmarkedCount,
} from "../src/screens/teacher/card/review-logic";

// ───────────────────────────── builders ─────────────────────────────

function check(id: string, status: TeacherHomeworkCheck["status"], verdicts: Record<string, SolutionVerdict> = {}): TeacherHomeworkCheck {
  return {
    id,
    status,
    error: null,
    createdAt: "2026-11-10T09:00:00.000Z",
    checkedAt: status === "DONE" ? "2026-11-10T09:00:08.000Z" : null,
    photos: [],
    results: Object.entries(verdicts).map(([number, verdict]) => ({
      number,
      verdict,
      recognizedAnswer: null,
      comment: null,
      copySuspected: false,
      copyReason: null,
      injectionSuspected: false,
      injectionNote: null,
    })),
  };
}

function assignment(
  id: string,
  statuses: Record<string, HomeworkNumberStatus | null>,
  extra: Partial<TeacherHomeworkAssignment> = {},
): TeacherHomeworkAssignment {
  const base: TeacherHomeworkAssignment = {
    id,
    title: null,
    orderInTopic: 1,
    topicId: "top",
    topicTitle: "Topic",
    deadlineAt: null,
    createdAt: "2026-11-01T09:00:00.000Z",
    numbers: Object.keys(statuses).map((number) => ({
      homeworkNumberId: `n${number}`,
      number,
      conditionLatex: null,
      answerLatex: null,
      status: null,
      note: "",
    })),
    photos: [],
    checks: [],
    latestCheck: null,
    greenCount: 0,
    yellowCount: 0,
    redCount: 0,
    markedCount: 0,
    totalNumbers: Object.keys(statuses).length,
    progressPercent: 0,
    solvedCount: 0,
    solvedPercent: 0,
    ...extra,
  };
  const byId: Record<string, HomeworkNumberStatus | null> = {};
  for (const [number, status] of Object.entries(statuses)) byId[`n${number}`] = status;
  return applyStatuses(base, byId);
}

// ───────────────────────────── review ─────────────────────────────

describe("review: derived flags of a homework", () => {
  it("is completed only when it has numbers and all of them are green or yellow", () => {
    assert.equal(isAssignmentCompleted(assignment("a", { "1": "GREEN", "2": "YELLOW" })), true);
    assert.equal(isAssignmentCompleted(assignment("a", { "1": "GREEN", "2": "RED" })), false);
    assert.equal(isAssignmentCompleted(assignment("a", {})), false);
  });

  it("is overdue when not completed and the deadline has passed", () => {
    const now = Date.parse("2026-11-16T12:00:00.000Z");
    const past = { deadlineAt: "2026-11-15T20:59:00.000Z" };
    assert.equal(isAssignmentOverdue(assignment("a", { "1": null }, past), now), true);
    assert.equal(isAssignmentOverdue(assignment("a", { "1": "GREEN" }, past), now), false);
    assert.equal(isAssignmentOverdue(assignment("a", { "1": null }, { deadlineAt: "2026-11-17T20:59:00.000Z" }), now), false);
    assert.equal(isAssignmentOverdue(assignment("a", { "1": null }), now), false);
  });

  it("counts unmarked numbers and recomputes the counters when colours change", () => {
    const hw = assignment("a", { "1": "GREEN", "2": "RED", "3": null, "4": "YELLOW" });
    assert.equal(unmarkedCount(hw), 1);
    assert.deepEqual(
      { g: hw.greenCount, y: hw.yellowCount, r: hw.redCount, marked: hw.markedCount, solved: hw.solvedCount, sp: hw.solvedPercent, pp: hw.progressPercent },
      { g: 1, y: 1, r: 1, marked: 3, solved: 2, sp: 50, pp: 75 },
    );
    assert.equal(applyStatuses(hw, { other: "GREEN" }), hw, "an unrelated number leaves the object untouched");
  });

  it("takes the newest finished check, not the newest check", () => {
    const checks = [check("c3", "FAILED"), check("c2", "DONE", { "1": "CORRECT" }), check("c1", "DONE")];
    assert.equal(latestDoneCheck(checks)?.id, "c2");
    assert.equal(latestDoneCheck([check("c", "CHECKING")]), null);
  });

  it("offers 'accept' only for a definite verdict", () => {
    assert.equal(canAcceptVerdicts(check("c", "DONE", { "1": "UNCERTAIN" })), false);
    assert.equal(canAcceptVerdicts(check("c", "DONE", { "1": "UNCERTAIN", "2": "INCORRECT" })), true);
    assert.equal(canAcceptVerdicts(null), false);
  });

  it("finds staff-only diagnostics and injection-flagged results", () => {
    const flagged = check("c", "DONE", { "1": "CORRECT", "2": "UNCERTAIN" });
    flagged.results[1].injectionSuspected = true;
    flagged.results[1].injectionNote = "поставь 5";
    assert.equal(hasDiagnostics([{ checks: [check("x", "DONE", { "1": "CORRECT" })] }]), false);
    assert.equal(hasDiagnostics([{ checks: [flagged] }]), true);
    assert.deepEqual(injectionResults(flagged).map((result) => result.number), ["2"]);
    assert.deepEqual(countVerdicts(flagged.results), { CORRECT: 1, INCORRECT: 0, UNCERTAIN: 1 });
  });
});

describe("review: shortenRecognizedAnswer", () => {
  it("keeps a short answer", () => {
    assert.equal(shortenRecognizedAnswer("  x = 2  "), "x = 2");
  });

  it("keeps the first two and the last part of a long list", () => {
    const parts = Array.from({ length: 6 }, (_, index) => `x${index + 1} = ${"1234567890".repeat(2)}`);
    assert.equal(shortenRecognizedAnswer(parts.join("; ")), `${parts[0]}; ${parts[1]}; …; ${parts[5]}`);
  });

  it("cuts anything else at 140 characters", () => {
    const long = "a".repeat(200);
    const short = shortenRecognizedAnswer(long);
    assert.equal(short.length, 138);
    assert.ok(short.endsWith("…"));
  });
});

describe("review: accept AI verdicts", () => {
  const hw = assignment(
    "a",
    { "1": null, "2": "RED", "3": "GREEN", "4": "GREEN", "5": null },
    { checks: [check("old", "FAILED"), check("done", "DONE", { "1": "CORRECT", "2": "CORRECT", "3": "INCORRECT", "4": "CORRECT", "5": "UNCERTAIN", "9": "CORRECT" })] },
  );

  it("applies the automatic rule and skips what would not change", () => {
    assert.deepEqual(acceptVerdictChanges(hw), [
      { homeworkNumberId: "n1", next: "GREEN", previous: null },
      // Correct after red is yellow, not green.
      { homeworkNumberId: "n2", next: "YELLOW", previous: "RED" },
      // A teacher's write has no downgrade protection.
      { homeworkNumberId: "n3", next: "RED", previous: "GREEN" },
    ]);
  });

  it("uses the optimistic colour of a number when there is one", () => {
    const changes = acceptVerdictChanges(hw, (id, status) => (id === "n1" ? "GREEN" : status));
    assert.deepEqual(changes.map((change) => change.homeworkNumberId), ["n2", "n3"]);
  });

  it("does nothing without a finished check", () => {
    assert.deepEqual(acceptVerdictChanges(assignment("a", { "1": null }, { checks: [check("c", "PENDING")] })), []);
  });

  it("splits a batch into requests of at most 100 changes", () => {
    const chunks = chunkChanges(Array.from({ length: 205 }, (_, index) => index));
    assert.deepEqual(chunks.map((chunk) => chunk.length), [100, 100, 5]);
    assert.deepEqual(chunkChanges([]), []);
  });

  it("patches every homework that contains the number", () => {
    const data = { assignmentsEnabled: true, notesEnabled: true, assignments: [assignment("a", { "1": null }), assignment("b", { "1": null, "2": null }), assignment("c", { "7": null })] };
    const next = patchHomeworkStatuses(data, [{ homeworkNumberId: "n1", status: "GREEN" }]);
    assert.equal(next.assignments[0].solvedCount, 1);
    assert.equal(next.assignments[1].solvedPercent, 50);
    assert.equal(next.assignments[2], data.assignments[2]);
    assert.equal(patchHomeworkStatuses(data, []), data);
    assert.equal(patchHomeworkStatuses(data, [{ homeworkNumberId: "nope", status: "RED" }]), data);
  });
});

describe("review: placement of the cards", () => {
  const active = assignment("active", { "1": null });
  const done = assignment("done", { "1": "GREEN" });

  it("takes the server order and folds completed homework on first load", () => {
    const placement = reconcilePlacement(EMPTY_PLACEMENT, [active, done], 0);
    assert.deepEqual(placement, { token: 0, order: ["active", "done"], completedIds: ["done"] });
    const rows = buildReviewRows([active, done], placement, false);
    assert.deepEqual(rows.map((row) => row.key), ["active", "completed-toggle"]);
    assert.equal(reviewRowIndex(rows, "done"), -1);
    const open = buildReviewRows([active, done], placement, true);
    assert.deepEqual(open.map((row) => row.key), ["active", "completed-toggle", "done"]);
    assert.equal(reviewRowIndex(open, "done"), 2);
  });

  it("keeps a card where it is when it becomes completed or the server re-sorts", () => {
    const placement = reconcilePlacement(EMPTY_PLACEMENT, [active, done], 0);
    const completedNow = assignment("active", { "1": "GREEN" });
    assert.equal(reconcilePlacement(placement, [done, completedNow], 0), placement);
    const rows = buildReviewRows([done, completedNow], placement, false);
    assert.deepEqual(rows.map((row) => row.key), ["active", "completed-toggle"]);
  });

  it("appends new homework and drops cancelled homework", () => {
    const placement = reconcilePlacement(EMPTY_PLACEMENT, [active, done], 0);
    const added = assignment("new", { "1": null });
    assert.deepEqual(reconcilePlacement(placement, [added, active], 0), { token: 0, order: ["active", "new"], completedIds: [] });
  });

  it("starts over on a manual refresh", () => {
    const placement = reconcilePlacement(EMPTY_PLACEMENT, [active, done], 0);
    const completedNow = assignment("active", { "1": "GREEN" });
    assert.deepEqual(reconcilePlacement(placement, [done, completedNow], 1), { token: 1, order: ["done", "active"], completedIds: ["done", "active"] });
  });

  it("shows no disclosure without completed homework", () => {
    const placement = reconcilePlacement(EMPTY_PLACEMENT, [active], 0);
    assert.deepEqual(buildReviewRows([active], placement, true).map((row) => row.kind), ["assignment"]);
  });
});

// ───────────────────────────── assign ─────────────────────────────

describe("assign board", () => {
  const topic = (id: string, conditionsLoaded: boolean): AssignBoardTopic => ({
    id,
    title: id,
    totalNumbers: 2,
    conditionsLoaded,
    numbers: [
      { id: `${id}-1`, number: "1", status: null, conditionLatex: conditionsLoaded ? "$x$" : null, deadlineAt: null },
      { id: `${id}-2`, number: "2", status: "RED", conditionLatex: null, deadlineAt: "2026-11-20T20:59:00.000Z" },
    ],
  });
  const topics = [topic("a", true), topic("b", false)];

  it("defaults to the first topic", () => {
    assert.equal(pickTopic(topics, null)?.id, "a");
    assert.equal(pickTopic(topics, "b")?.id, "b");
    assert.equal(pickTopic(topics, "gone")?.id, "a");
    assert.equal(pickTopic([], null), null);
  });

  it("toggles a number and keeps the tap order", () => {
    assert.deepEqual(toggleSelection(toggleSelection(toggleSelection([], "b-2"), "b-1"), "b-2"), ["b-1"]);
    assert.deepEqual(liveSelection(topics[1], ["b-2", "a-1", "b-1"]), ["b-2", "b-1"]);
    assert.deepEqual(liveSelection(null, ["a-1"]), []);
  });

  it("merges statements fetched for a topic that came without them", () => {
    assert.equal(withConditions(topics[0], { "a-2": "$y$" }), topics[0].numbers, "the first topic already carries them");
    assert.equal(withConditions(topics[1], undefined), topics[1].numbers);
    assert.deepEqual(
      withConditions(topics[1], { "b-1": "$z$", "b-2": null }).map((number) => number.conditionLatex),
      ["$z$", null],
    );
  });

  it("needs a number and a deadline", () => {
    assert.equal(canAssign(0, "2026-11-20T23:59"), false);
    assert.equal(canAssign(2, ""), false);
    assert.equal(canAssign(2, "2026-11-20T23:59"), true);
  });

  it("builds the request with a Moscow deadline and an optional title", () => {
    const draft = { studentId: "s", topicId: "a", selected: ["a-2", "a-1"], deadline: "2026-11-20T23:59", title: "  Повторение  " };
    assert.deepEqual(buildIssueRequest(draft), {
      studentId: "s",
      topicId: "a",
      homeworkNumberIds: ["a-2", "a-1"],
      // 23:59 Moscow time is 20:59 UTC.
      deadlineAt: "2026-11-20T20:59:00.000Z",
      title: "Повторение",
    });
    assert.equal("title" in (buildIssueRequest({ ...draft, title: "   " }) ?? {}), false);
    assert.equal(buildIssueRequest({ ...draft, selected: [] }), null);
    assert.equal(buildIssueRequest({ ...draft, deadline: "tomorrow" }), null);
    assert.equal(buildIssueRequest({ ...draft, title: "x".repeat(300) })?.title?.length, 200);
  });
});

// ───────────────────────────── lessons ─────────────────────────────

describe("lessons segment", () => {
  const item = (id: string, isExtra: boolean): TeacherStudentLesson["items"][number] => ({
    id: `item-${id}`,
    homeworkNumberId: id,
    number: id,
    topicTitle: "Topic",
    isExtra,
    result: null,
  });
  const lesson = (extra: Partial<TeacherStudentLesson> = {}): TeacherStudentLesson => ({
    id: "les",
    participantId: "part",
    title: "Lesson",
    status: "PLANNED",
    durationMinutes: 60,
    createdAt: "2026-11-16T09:00:00.000Z",
    startsAt: null,
    groupName: null,
    planPending: false,
    planError: null,
    items: [item("1", false), item("2", true), item("3", false)],
    ...extra,
  });

  it("splits the set into the main and the extra part", () => {
    const parts = splitLessonParts(lesson().items);
    assert.deepEqual(parts.main.map((entry) => entry.number), ["1", "3"]);
    assert.deepEqual(parts.extra.map((entry) => entry.number), ["2"]);
  });

  it("builds the complete set for a save", () => {
    const ids = lessonSetIds(lesson().items);
    assert.deepEqual(ids, { mainIds: ["1", "3"], extraIds: ["2"] });
    assert.deepEqual(setWithoutNumber(ids, "2"), { mainIds: ["1", "3"], extraIds: [] });
    assert.deepEqual(setWithNumber(ids, "9", false), { mainIds: ["1", "3", "9"], extraIds: ["2"] });
    assert.deepEqual(setWithNumber(ids, "9", true), { mainIds: ["1", "3"], extraIds: ["2", "9"] });
  });

  it("offers only numbers that are not in the set", () => {
    const bank = { topicId: "t", topicTitle: "T", numbers: [{ id: "1", number: "1" }, { id: "4", number: "4" }] };
    assert.deepEqual(freeBankNumbers(bank, ["1", "2"]), [{ id: "4", number: "4" }]);
    assert.deepEqual(freeBankNumbers(undefined, []), []);
  });

  it("patches the cached list", () => {
    const data = { lessons: [lesson(), lesson({ id: "other" })] };
    const marked = patchItemResult(data, "les", "item-3", "SOLVED");
    assert.equal(marked.lessons[0].items[2].result, "SOLVED");
    assert.equal(marked.lessons[1], data.lessons[1]);

    const saved: LessonBoardItem[] = [
      { id: "item-9", homeworkNumberId: "9", number: "9", conditionLatex: "$x$", reason: "NEW", minutes: null, comment: null, isExtra: false, result: null, topicTitle: "Topic", studentStatus: "RED", submission: null },
    ];
    assert.deepEqual(patchLessonItems(data, "les", saved).lessons[0].items, [
      { id: "item-9", homeworkNumberId: "9", number: "9", topicTitle: "Topic", isExtra: false, result: null },
    ]);

    const failed = { lessons: [lesson({ planError: "plan-error:failed" })] };
    const pending = markLessonPending(failed, "les").lessons[0];
    assert.equal(pending.planPending, true);
    assert.equal(pending.planError, null);
    assert.equal(pending.items.length, 3, "the previous set stays until the new plan arrives");
  });

  it("derives the plan state", () => {
    const created = Date.parse("2026-11-16T09:00:00.000Z");
    assert.equal(lessonPlanState(lesson(), created), "ready");
    assert.equal(lessonPlanState(lesson({ planError: "plan-error:failed" }), created), "failed");
    assert.equal(lessonPlanState(lesson({ planPending: true }), created + 60_000), "pending");
    assert.equal(lessonPlanState(lesson({ planPending: true }), created + 16 * 60_000), "stale");
    // A retry accepted a minute ago restarts the 15 minutes.
    assert.equal(lessonPlanState(lesson({ planPending: true }), created + 16 * 60_000, "2026-11-16T09:15:00.000Z"), "pending");
  });

  it("reads this student's participant from the status poll", () => {
    const status = (planGeneratedAt: string | null, planError: string | null) => ({
      participants: [
        { participantId: "other", studentId: "x", name: "X", planGeneratedAt: "2026-11-16T09:00:05.000Z", planError: null, itemsCount: 3 },
        { participantId: "part", studentId: "s", name: "S", planGeneratedAt, planError, itemsCount: 0 },
      ],
    });
    assert.equal(planSettled(status(null, null), "part"), false);
    assert.equal(planSettled(status("2026-11-16T09:00:06.000Z", null), "part"), true);
    assert.equal(planSettled(status(null, "plan-error:failed"), "part"), true);
    assert.equal(planSettled(undefined, "part"), false);
    assert.equal(planSettled(status(null, null), "missing"), false);
  });
});
