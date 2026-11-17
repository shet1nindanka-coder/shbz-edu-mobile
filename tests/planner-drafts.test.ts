// Homework-draft screens: list card, create form, set editing, generation poll and issue outcome
// (05 §1.5–§1.7, §3.13, §3.15, §4.10; 90-addendum-6 §6.2).
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
import test from "node:test";
import assert from "node:assert/strict";
import type { HomeworkPlanBoardModel, HomeworkPlanItem, HomeworkPlanParticipant, LessonBoardItem } from "@/api/types";
import {
  buildDraftInput,
  clampDailyMinutes,
  countIssuable,
  countIssued,
  draftBudget,
  draftCreatedAt,
  draftSourceKey,
  draftSourceOf,
  freeTopicNumbers,
  idsWith,
  idsWithout,
  initialTopicId,
  issueOutcomeOf,
  issueStampSignature,
  issuedChipTone,
  markDraftParticipantPending,
  reasonTone,
  replaceDraftItems,
  sortDrafts,
  toDraftItems,
  validateDraftForm,
  numberGridColumns,
} from "@/screens/planner/drafts/drafts-logic";
import { planSignature, statusRowsOnBoard } from "@/screens/planner/shared/plan-state";

const NOW = Date.parse("2026-11-16T12:00:00.000Z"); // 15:00 Moscow
const iso = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();
const DAY = 86_400_000;

const item = (id: string, patch: Partial<HomeworkPlanItem> = {}): HomeworkPlanItem => ({
  id: `item_${id}`,
  homeworkNumberId: `num_${id}`,
  number: id,
  conditionLatex: null,
  reason: "NEW",
  minutes: null,
  comment: null,
  studentStatus: null,
  ...patch,
});

const participant = (id: string, patch: Partial<HomeworkPlanParticipant> = {}): HomeworkPlanParticipant => ({
  id,
  studentId: `usr_${id}`,
  studentName: id,
  planSummary: null,
  planGeneratedAt: iso(-DAY),
  planError: null,
  issuedAssignmentId: null,
  issuedAt: null,
  createdAt: iso(-2 * DAY),
  items: [],
  ...patch,
});

const boardOf = (participants: HomeworkPlanParticipant[]): HomeworkPlanBoardModel => ({
  serverNow: iso(0),
  id: "hp_1",
  title: "Draft",
  topicId: "top_1",
  topicTitle: "Topic",
  deadlineAt: iso(5 * DAY),
  daysUntilDeadline: 5,
  group: null,
  sourceLesson: null,
  aiAvailable: true,
  participants,
  topicNumbers: [],
});

// ───────────────────────────── list ─────────────────────────────

test("issuedChipTone: green only when every participant has the homework", () => {
  assert.equal(issuedChipTone({ issuedCount: 2, participantsCount: 2 }), "green");
  assert.equal(issuedChipTone({ issuedCount: 1, participantsCount: 2 }), "yellow");
  assert.equal(issuedChipTone({ issuedCount: 0, participantsCount: 3 }), "yellow");
  // An empty draft is never "all issued".
  assert.equal(issuedChipTone({ issuedCount: 0, participantsCount: 0 }), "yellow");
});

test("sortDrafts: newest first, stable by id, input untouched", () => {
  const plans = [
    { id: "b", createdAt: iso(-2 * DAY) },
    { id: "c", createdAt: iso(-DAY) },
    { id: "a", createdAt: iso(-2 * DAY) },
  ];
  assert.deepEqual(
    sortDrafts(plans).map((plan) => plan.id),
    ["c", "a", "b"],
  );
  assert.equal(plans[0]?.id, "b");
});

// ───────────────────────────── new draft ─────────────────────────────

test("draftSourceOf: lesson first (optionally narrowed to a student), then group, then student; none → null", () => {
  assert.deepEqual(draftSourceOf({ lessonId: "les_1" }), { lessonId: "les_1" });
  assert.deepEqual(draftSourceOf({ lessonId: "les_1", studentId: "usr_1" }), { lessonId: "les_1", studentId: "usr_1" });
  assert.deepEqual(draftSourceOf({ lessonId: "les_1", groupId: "grp_1" }), { lessonId: "les_1" });
  assert.deepEqual(draftSourceOf({ groupId: "grp_1", studentId: "usr_1" }), { groupId: "grp_1" });
  assert.deepEqual(draftSourceOf({ studentId: "usr_1" }), { studentId: "usr_1" });
  assert.equal(draftSourceOf({}), null);
  assert.equal(draftSourceOf({ lessonId: "  ", groupId: "" }), null);
});

test("draftSourceKey: different sources have different keys", () => {
  const keys = [
    draftSourceKey({ lessonId: "x" }),
    draftSourceKey({ lessonId: "x", studentId: "s" }),
    draftSourceKey({ groupId: "x" }),
    draftSourceKey({ studentId: "x" }),
  ];
  assert.equal(new Set(keys).size, keys.length);
});

test("initialTopicId: the lesson's dominant topic, else the first topic, else nothing", () => {
  const topics = [
    { id: "t1", title: "One" },
    { id: "t2", title: "Two" },
  ];
  assert.equal(initialTopicId({ defaultTopicId: "t2", topics }), "t2");
  assert.equal(initialTopicId({ defaultTopicId: null, topics }), "t1");
  // A default that is no longer in the bank falls back to the first topic.
  assert.equal(initialTopicId({ defaultTopicId: "gone", topics }), "t1");
  assert.equal(initialTopicId({ defaultTopicId: null, topics: [] }), null);
});

test("validateDraftForm: topic first, then the deadline", () => {
  assert.equal(validateDraftForm({ topicId: null, deadlineAt: "" }), "pickTopic");
  assert.equal(validateDraftForm({ topicId: "t1", deadlineAt: "" }), "pickDeadline");
  assert.equal(validateDraftForm({ topicId: "t1", deadlineAt: "2026-11-20T18:00" }), null);
});

test("clampDailyMinutes: 15..240, default 60 for garbage", () => {
  assert.equal(clampDailyMinutes(5), 15);
  assert.equal(clampDailyMinutes(500), 240);
  assert.equal(clampDailyMinutes(62.4), 62);
  assert.equal(clampDailyMinutes(Number.NaN), 60);
});

test("buildDraftInput: Moscow wall clock → ISO instant, optional fields only when present", () => {
  const state = { topicId: "t1", deadlineAt: "2026-11-20T18:00", dailyMinutes: 45, teacherNote: "  без параметров  ", studentIds: ["a", "b"] };
  assert.deepEqual(buildDraftInput(state, { defaultTitle: "", groupId: null, sourceLessonId: null }), {
    topicId: "t1",
    deadlineAt: "2026-11-20T15:00:00.000Z",
    teacherNote: "без параметров",
    dailyMinutes: 45,
    studentIds: ["a", "b"],
  });
  assert.deepEqual(buildDraftInput(state, { defaultTitle: " ДЗ по итогам «Урок» ", groupId: "grp_1", sourceLessonId: "les_1" }), {
    topicId: "t1",
    deadlineAt: "2026-11-20T15:00:00.000Z",
    title: "ДЗ по итогам «Урок»",
    teacherNote: "без параметров",
    dailyMinutes: 45,
    sourceLessonId: "les_1",
    groupId: "grp_1",
    studentIds: ["a", "b"],
  });
});

test("draftBudget: minutes × days until the deadline, days clamped to 1..60; nothing without a future deadline", () => {
  assert.equal(draftBudget(60, "", NOW), null);
  assert.equal(draftBudget(60, "2026-11-16T14:00", NOW), null); // 14:00 Moscow is in the past
  assert.deepEqual(draftBudget(60, "2026-11-16T20:00", NOW), { days: 1, minutes: 60, total: 60 });
  assert.deepEqual(draftBudget(45, "2026-11-21T15:00", NOW), { days: 5, minutes: 45, total: 225 });
  assert.deepEqual(draftBudget(30, "2027-06-01T10:00", NOW), { days: 60, minutes: 30, total: 1800 });
  assert.deepEqual(draftBudget(1000, "2026-11-18T15:00", NOW), { days: 2, minutes: 240, total: 480 });
});

// ───────────────────────────── board ─────────────────────────────

test("countIssuable / countIssued: not issued with at least one problem", () => {
  const participants = [
    participant("a", { items: [item("120")] }),
    participant("b", { items: [item("112")], issuedAssignmentId: "hw_1", issuedAt: iso(-DAY) }),
    participant("c"),
  ];
  assert.equal(countIssuable(participants), 1);
  assert.equal(countIssued(participants), 1);
  assert.equal(countIssuable([]), 0);
});

test("toDraftItems: a draft shows only the main part with the draft's fields", () => {
  const rows: LessonBoardItem[] = [
    { ...item("120"), isExtra: false, result: null, topicTitle: "T", submission: null },
    { ...item("121"), isExtra: true, result: null, topicTitle: "T", submission: null },
  ];
  assert.deepEqual(toDraftItems(rows), [item("120")]);
});

test("idsWithout / idsWith: the complete set after removing or appending a number", () => {
  const items = [item("120"), item("124"), item("127")];
  assert.deepEqual(idsWithout(items, "item_124"), ["num_120", "num_127"]);
  assert.deepEqual(idsWithout(items, "missing"), ["num_120", "num_124", "num_127"]);
  assert.deepEqual(idsWith(items, "num_130"), ["num_120", "num_124", "num_127", "num_130"]);
  // A number that is already in the set is not sent twice.
  assert.deepEqual(idsWith(items, "num_124"), ["num_120", "num_124", "num_127"]);
});

test("freeTopicNumbers: numbers of the topic that are not in the set, in topic order", () => {
  const numbers = [
    { id: "num_1", number: "1" },
    { id: "num_2", number: "2" },
    { id: "num_3", number: "3" },
  ];
  assert.deepEqual(freeTopicNumbers(numbers, ["num_2"]), [numbers[0], numbers[2]]);
  assert.deepEqual(freeTopicNumbers(numbers, ["num_1", "num_2", "num_3"]), []);
});

test("replaceDraftItems / markDraftParticipantPending: only the named participant changes", () => {
  const board = boardOf([participant("a", { items: [item("120")], planError: "plan-error:failed", planGeneratedAt: null }), participant("b")]);
  const replaced = replaceDraftItems(board, "a", [item("124")]);
  assert.deepEqual(replaced.participants[0]?.items, [item("124")]);
  assert.equal(replaced.participants[1], board.participants[1]);

  const pending = markDraftParticipantPending(board, "a");
  assert.equal(pending.participants[0]?.planError, null);
  assert.equal(pending.participants[0]?.planGeneratedAt, null);
  // The set stays until the new plan arrives.
  assert.deepEqual(pending.participants[0]?.items, [item("120")]);
  assert.equal(pending.participants[1], board.participants[1]);
});

test("reasonTone: gap yellow, review neutral, new and unknown green", () => {
  assert.equal(reasonTone("GAP"), "yellow");
  assert.equal(reasonTone("REVIEW"), "muted");
  assert.equal(reasonTone("NEW"), "green");
  assert.equal(reasonTone("DIAGNOSTIC"), "green");
});

test("draftCreatedAt: the earliest participant, or the server clock for an empty draft", () => {
  const board = boardOf([participant("a", { createdAt: iso(-DAY) }), participant("b", { createdAt: iso(-3 * DAY) })]);
  assert.equal(draftCreatedAt(board), iso(-3 * DAY));
  assert.equal(draftCreatedAt(boardOf([])), iso(0));
});

// ───────────────────────────── generation poll ─────────────────────────────

const statusRow = (participantId: string, patch: Partial<{ planGeneratedAt: string | null; planError: string | null; issuedAssignmentId: string | null }> = {}) => ({
  participantId,
  studentId: `usr_${participantId}`,
  name: participantId,
  planGeneratedAt: null,
  planError: null,
  issuedAssignmentId: null,
  issuedAt: null,
  itemsCount: 0,
  ...patch,
});

test("statusRowsOnBoard: a participant the board hides does not take part in the comparison", () => {
  const board = [participant("a", { planGeneratedAt: null }), participant("b", { planGeneratedAt: null })];
  const rows = statusRowsOnBoard([statusRow("a"), statusRow("b"), statusRow("moved", { planError: "plan-error:failed" })], ["a", "b"]);
  assert.deepEqual(
    rows.map((row) => row.id),
    ["a", "b"],
  );
  assert.equal(planSignature(rows), planSignature(board));

  // A plan that arrived changes the signature → the board is read again.
  const ready = statusRowsOnBoard([statusRow("a", { planGeneratedAt: iso(0) }), statusRow("b")], ["a", "b"]);
  assert.notEqual(planSignature(ready), planSignature(board));
});

test("issueStampSignature: order-independent, changes when a stamp appears", () => {
  const before = issueStampSignature([statusRow("b"), statusRow("a", { issuedAssignmentId: "hw_old" })]);
  assert.equal(before, issueStampSignature([statusRow("a", { issuedAssignmentId: "hw_old" }), statusRow("b")]));
  assert.notEqual(before, issueStampSignature([statusRow("a", { issuedAssignmentId: "hw_old" }), statusRow("b", { issuedAssignmentId: "hw_new" })]));
});

// ───────────────────────────── issue ─────────────────────────────

const who = (name: string) => ({ participantId: `lp_${name}`, studentId: `usr_${name}`, name });

test("issueOutcomeOf: draft.issue.mixed — one issued, two failures", () => {
  const outcome = issueOutcomeOf({
    issued: [{ ...who("Кирилл"), assignmentId: "hw_1" }],
    failed: [
      { ...who("Артём"), code: "solvedConflict", message: "Номера 127, 130 ученик уже решил", conflictNumbers: ["127", "130"] },
      { ...who("Полина"), code: "emptySet", message: "Набор пуст — добавьте номера." },
    ],
  });
  assert.equal(outcome.notice, "issuedTo");
  assert.equal(outcome.issuedCount, 1);
  assert.deepEqual(outcome.failures, [
    { participantId: "lp_Артём", name: "Артём", message: "Номера 127, 130 ученик уже решил" },
    { participantId: "lp_Полина", name: "Полина", message: "Набор пуст — добавьте номера." },
  ]);
});

test("issueOutcomeOf: draft.issue.repeat — only failures, no success notice", () => {
  const outcome = issueOutcomeOf({ issued: [], failed: [{ ...who("Артём"), code: "solvedConflict", message: "x" }] });
  assert.equal(outcome.notice, null);
  assert.equal(outcome.failures.length, 1);
});

test("issueOutcomeOf: nobody new and nobody failed — everyone already has the homework", () => {
  assert.deepEqual(issueOutcomeOf({ issued: [], failed: [] }), { issuedCount: 0, notice: "alreadyIssued", failures: [] });
});

// Finding #121: the "add a problem" grid of a draft is virtualised with a column count from the width.
test("numberGridColumns fits as many tiles as the width allows, never fewer than one", () => {
  // 358 pt of content (390 pt phone less two 16 pt gutters), 84 pt tiles, 8 pt gaps: 4 × 84 + 3 × 8 = 360 > 358.
  assert.equal(numberGridColumns(358, 84, 8), 3);
  assert.equal(numberGridColumns(360, 84, 8), 4);
  assert.equal(numberGridColumns(84, 84, 8), 1);
  assert.equal(numberGridColumns(40, 84, 8), 1);
  // Not measured yet / nonsense input.
  assert.equal(numberGridColumns(0, 84, 8), 1);
  assert.equal(numberGridColumns(Number.NaN, 84, 8), 1);
  assert.equal(numberGridColumns(500, 0, 8), 1);
});
