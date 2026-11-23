// Pure rules of the student card: homework review (derived flags, "accept AI verdicts", placement of the
// cards), the assign board (selection, request body) and the lessons segment (set editing, plan state).
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getMobileDictionary } from "../src/i18n/mobile";

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
import * as store from "../src/screens/teacher/card/kept-reports";
import {
  bankNumbersGap,
  freeBankNumbers,
  lessonPlanState,
  planRequestDeviceAnchor,
  syncPendingSince,
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
  acceptVerdictChanges,
  applyStatuses,
  buildReviewRows,
  canAcceptVerdicts,
  completedAssignmentIds,
  chunkChanges,
  claimWrites,
  countVerdicts,
  hasDiagnostics,
  injectionResults,
  isAssignmentCompleted,
  latestDoneCheck,
  patchHomeworkStatuses,
  releaseWrites,
  reviewRowIndex,
  sendStatusChunks,
  shortenRecognizedAnswer,
  StatusBatchError,
  statusBatchFailure,
  undoEntriesAfterAccept,
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

  it("sends a long batch chunk by chunk and returns every result", async () => {
    const entries = Array.from({ length: 205 }, (_, index) => ({ homeworkNumberId: `n${index}`, status: "GREEN" as const }));
    const sizes: number[] = [];
    const results = await sendStatusChunks(entries, async (chunk) => {
      sizes.push(chunk.length);
      return { results: chunk };
    });
    assert.deepEqual(sizes, [100, 100, 5]);
    assert.equal(results.length, 205);
  });

  it("a batch that fails on its first request reports nothing applied (#412)", async () => {
    const boom = new Error("503");
    const entries = [{ homeworkNumberId: "n1", status: "GREEN" as const }];
    const failure = await sendStatusChunks(entries, async () => {
      throw boom;
    }).then(
      () => assert.fail("must reject"),
      (error: unknown) => error,
    );
    assert.ok(failure instanceof StatusBatchError);
    const { reason, applied, appliedIds } = statusBatchFailure(failure);
    assert.equal(reason, boom);
    assert.deepEqual(applied, []);
    assert.deepEqual(appliedIds, []);
    // The queued undo of that accept sends nothing.
    assert.deepEqual(undoEntriesAfterAccept([{ homeworkNumberId: "n1", status: null }], new Set(appliedIds)), []);
  });

  it("a batch that fails on its second request reports the first one as applied (#412)", async () => {
    const entries = Array.from({ length: 150 }, (_, index) => ({ homeworkNumberId: `n${index}`, status: "RED" as const }));
    let calls = 0;
    const failure = await sendStatusChunks(entries, async (chunk) => {
      calls += 1;
      if (calls === 2) throw new Error("503");
      return { results: chunk.map((entry) => ({ ...entry, status: "YELLOW" as const })) };
    }).then(
      () => assert.fail("must reject"),
      (error: unknown) => error,
    );
    const { applied, appliedIds } = statusBatchFailure(failure);
    assert.equal(appliedIds.length, 100);
    assert.deepEqual(appliedIds.slice(0, 2), ["n0", "n1"]);
    assert.equal(applied[0].status, "YELLOW");
    const previous = entries.map((entry) => ({ homeworkNumberId: entry.homeworkNumberId, status: null }));
    const undo = undoEntriesAfterAccept(previous, new Set(appliedIds));
    assert.deepEqual(undo.map((entry) => entry.homeworkNumberId), appliedIds);
  });

  it("a plain error is a failure with nothing applied", () => {
    const error = new Error("x");
    assert.deepEqual(statusBatchFailure(error), { reason: error, applied: [], appliedIds: [] });
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

  it("keeps the server order and folds completed homework under the disclosure", () => {
    const completed = completedAssignmentIds([active, done]);
    assert.deepEqual([...completed], ["done"]);
    const rows = buildReviewRows([active, done], completed, false);
    assert.deepEqual(rows.map((row) => row.key), ["active", "completed-toggle"]);
    assert.equal(reviewRowIndex(rows, "done"), -1);
    const open = buildReviewRows([active, done], completed, true);
    assert.deepEqual(open.map((row) => row.key), ["active", "completed-toggle", "done"]);
    assert.equal(reviewRowIndex(open, "done"), 2);
    const toggle = open[1];
    assert.ok(toggle.kind === "completedToggle" && toggle.count === 1 && toggle.open);
  });

  it("does not move a card while its mark is only optimistic", () => {
    // The server still says "not completed"; the displayed homework already carries the in-flight colour.
    const optimistic = applyStatuses(active, { n1: "GREEN" });
    const rows = buildReviewRows([optimistic, done], completedAssignmentIds([active, done]), false);
    assert.deepEqual(rows.map((row) => row.key), ["active", "completed-toggle"]);
    assert.ok(rows[0].kind === "assignment" && rows[0].assignment.solvedCount === 1);
  });

  it("regroups and re-sorts as soon as the server's answer changes", () => {
    const completedNow = assignment("active", { "1": "GREEN" });
    const added = assignment("new", { "1": null });
    // The settled write is in the cache: the card leaves the active block, the counter grows.
    const settled = buildReviewRows([completedNow, done], completedAssignmentIds([completedNow, done]), false);
    assert.deepEqual(settled.map((row) => row.key), ["completed-toggle"]);
    assert.ok(settled[0].kind === "completedToggle" && settled[0].count === 2);
    // A refetch brings a new homework first (attention order) and drops a cancelled one.
    const refetched = buildReviewRows([added, completedNow], completedAssignmentIds([added, completedNow]), true);
    assert.deepEqual(refetched.map((row) => row.key), ["new", "completed-toggle", "active"]);
  });

  it("shows no disclosure without completed homework", () => {
    assert.deepEqual(buildReviewRows([active], completedAssignmentIds([active]), true).map((row) => row.kind), ["assignment"]);
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

  it("tells a topic with no numbers apart from one whose numbers are all in the set", () => {
    const empty = { topicId: "e", topicTitle: "E", numbers: [] };
    const full = { topicId: "t", topicTitle: "T", numbers: [{ id: "1", number: "1" }] };
    assert.equal(bankNumbersGap(empty, freeBankNumbers(empty, []).length), "topicEmpty");
    assert.equal(bankNumbersGap(full, freeBankNumbers(full, ["1"]).length), "allInSet");
    assert.equal(bankNumbersGap(full, freeBankNumbers(full, []).length), null);
    assert.equal(bankNumbersGap(undefined, 0), null);
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
    assert.equal(lessonPlanState(lesson(), created, undefined), "ready");
    assert.equal(lessonPlanState(lesson({ planError: "plan-error:failed" }), created, undefined), "failed");
    // The 15 minutes run from when this client first saw the plan pending, not from lesson.createdAt.
    const seen = created + 60 * 60_000;
    assert.equal(lessonPlanState(lesson({ planPending: true }), seen, undefined), "pending", "not stamped yet: pending");
    assert.equal(lessonPlanState(lesson({ planPending: true }), seen + 60_000, seen), "pending", "an old lesson seen pending a minute ago");
    assert.equal(lessonPlanState(lesson({ planPending: true }), seen + 16 * 60_000, seen), "stale");
    // A retry accepted a minute ago restarts the 15 minutes.
    const retried = seen + 15 * 60_000;
    assert.equal(lessonPlanState(lesson({ planPending: true }), seen + 16 * 60_000, seen, retried), "pending");
    assert.equal(lessonPlanState(lesson({ planPending: true }), seen + 31 * 60_000, seen, retried), "stale");
  });

  it("keeps one clock: a Retry is compared on device time, so the card and the board turn stale together", () => {
    const MIN = 60_000;
    const server = Date.parse("2026-11-17T10:00:00Z");
    const raw = new Date(server).toISOString();
    for (const skew of [0, -30 * MIN, -120 * MIN, 30 * MIN]) {
      // skew = device minus server; the board's offset is server minus device.
      const deviceAtRetry = server + skew;
      const seen = deviceAtRetry - 60 * MIN;
      const fromBoard = planRequestDeviceAnchor(undefined, raw, -skew, deviceAtRetry + 5 * MIN);
      assert.equal(fromBoard?.deviceMs, deviceAtRetry, `skew ${skew / MIN}: the board's offset converts exactly`);
      for (const [elapsed, expected] of [
        [14 * MIN, "pending"],
        [16 * MIN, "stale"],
        [40 * MIN, "stale"],
      ] as const) {
        assert.equal(
          lessonPlanState(lesson({ planPending: true }), deviceAtRetry + elapsed, seen, fromBoard?.deviceMs),
          expected,
          `skew ${skew / MIN} min, ${elapsed / MIN} min after the Retry`,
        );
      }
    }
  });

  it("converts a Retry to device time once, falling back to when the card first saw it", () => {
    const raw = "2026-11-17T10:00:00.000Z";
    const observed = Date.parse("2026-11-17T08:05:00Z");
    assert.equal(planRequestDeviceAnchor(undefined, null, 0, observed), undefined);
    assert.equal(planRequestDeviceAnchor(undefined, "not a date", 0, observed), undefined);
    const first = planRequestDeviceAnchor(undefined, raw, null, observed);
    assert.deepEqual(first, { raw, deviceMs: observed }, "no server offset known: never earlier than the card saw it");
    assert.equal(planRequestDeviceAnchor(first, raw, 0, observed + 60_000), first, "the same Retry keeps its stamp");
    const own = { raw, deviceMs: 42 };
    assert.equal(planRequestDeviceAnchor(own, raw, 7_200_000, observed), own, "a Retry made on the card keeps its device time");
    const next = "2026-11-17T10:20:00.000Z";
    assert.deepEqual(planRequestDeviceAnchor(first, next, 7_200_000, observed), { raw: next, deviceMs: Date.parse(next) - 7_200_000 });
  });

  it("stamps the first time a lesson is seen pending and forgets it once it leaves", () => {
    const since = new Map<string, number>();
    syncPendingSince(since, ["a", "b"], 1_000);
    syncPendingSince(since, ["a", "b", "c"], 5_000);
    assert.deepEqual([...since.entries()], [["a", 1_000], ["b", 1_000], ["c", 5_000]], "an existing stamp is kept");
    syncPendingSince(since, ["c"], 9_000);
    assert.deepEqual([...since.entries()], [["c", 5_000]]);
    syncPendingSince(since, ["a", "c"], 12_000);
    assert.equal(since.get("a"), 12_000, "pending again: a fresh stamp");
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

describe("student report viewer titles", () => {
  it("names the report for every period, in both languages", () => {
    // The site's period buttons read «Отчёт: 7 дней» · «30 дней» · «Учебный год»: only the first one alone
    // says it is a report, so the file viewer has its own titles.
    const ru = getMobileDictionary("ru").teacher.report;
    const en = getMobileDictionary("en").teacher.report;
    assert.deepEqual([ru.title7d, ru.title30d, ru.titleYear], ["Отчёт: 7 дней", "Отчёт: 30 дней", "Отчёт: учебный год"]);
    for (const title of [en.title7d, en.title30d, en.titleYear]) assert.match(title, /^Report: /);
  });
});

describe("review: who may release a number's in-flight colour (#317)", () => {
  it("an accept that settles after its undo started does not release the undo's numbers", () => {
    const owners = new Map<string, number>();
    claimWrites(owners, ["n1", "n2"], 1); // accept
    claimWrites(owners, ["n1", "n2"], 2); // undo, sent while the accept is in flight
    assert.deepEqual(releaseWrites(owners, ["n1", "n2"], 1), []);
    assert.deepEqual([...owners.entries()], [["n1", 2], ["n2", 2]]);
    assert.deepEqual(releaseWrites(owners, ["n1", "n2"], 2), ["n1", "n2"]);
    assert.equal(owners.size, 0);
  });

  it("releases only the numbers the write still owns", () => {
    const owners = new Map<string, number>();
    claimWrites(owners, ["n1", "n2", "n3"], 1);
    claimWrites(owners, ["n2"], 2); // a tap on one number of the batch
    assert.deepEqual(releaseWrites(owners, ["n1", "n2", "n3"], 1), ["n1", "n3"]);
    assert.deepEqual(releaseWrites(owners, ["n2"], 2), ["n2"]);
  });
});

describe("student card: a finished report outlives the card (#324)", () => {
  const report = { period: "7d" as const, file: { uri: "file:///cache/r.pdf", fileName: "r.pdf" } };

  it("is kept by student and offered until it is opened or dismissed", () => {
    let calls = 0;
    const unsubscribe = store.subscribeKeptReports(() => {
      calls += 1;
    });
    store.keepReport("usr_ilya", 3, report);
    assert.equal(calls, 1);
    assert.deepEqual(store.keptReportOf("usr_ilya", 3), { ...report, generation: 3 });
    // The snapshot keeps its identity while nothing changes (useSyncExternalStore).
    assert.equal(store.keptReportOf("usr_ilya", 3), store.keptReportOf("usr_ilya", 3));
    assert.equal(store.keptReportOf("usr_maria", 3), null);
    store.forgetReport("usr_ilya");
    assert.equal(calls, 2);
    assert.equal(store.keptReportOf("usr_ilya", 3), null);
    store.forgetReport("usr_ilya");
    assert.equal(calls, 2);
    unsubscribe();
  });

  it("is never offered in another session (sign-out, another account)", () => {
    store.keepReport("usr_ilya", 3, report);
    assert.equal(store.keptReportOf("usr_ilya", 4), null);
  });
});
