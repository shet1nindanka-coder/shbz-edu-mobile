// Lesson board: set parts, live monitoring, schedule timers, handout names (05 §1.3, §4.8, §5.3).
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
import test from "node:test";
import assert from "node:assert/strict";
import type { LessonBoardItem, LessonBoardModel, LessonBoardSubmission } from "@/api/types";
import {
  availableNumbers,
  hasScheduleMovedOn,
  itemOrdinal,
  markParticipantPending,
  minutesAgo,
  needsSchedule,
  nextScheduleRefreshDelay,
  participantLive,
  patchBoardItem,
  replaceParticipantItems,
  scheduledStatus,
  setIdsOf,
  splitParts,
  withNumber,
  withoutNumber,
} from "@/screens/planner/lessons/board-logic";
import { handoutFileId, handoutFileName } from "@/components/lessons/handout-file";

const START = Date.parse("2026-11-16T14:00:00.000Z");
const MINUTE = 60_000;
const iso = (ms: number) => new Date(ms).toISOString();

function submission(submittedAt: number, patch: Partial<LessonBoardSubmission> = {}): LessonBoardSubmission {
  return {
    status: "DONE",
    verdict: "CORRECT",
    submittedAt: iso(submittedAt),
    checkedAt: iso(submittedAt + 8000),
    injectionSuspected: false,
    injectionNote: null,
    photoFileIds: [],
    ...patch,
  };
}

function item(id: string, patch: Partial<LessonBoardItem> = {}): LessonBoardItem {
  return {
    id,
    homeworkNumberId: `num_${id}`,
    number: id,
    conditionLatex: null,
    reason: "NEW",
    minutes: null,
    comment: null,
    isExtra: false,
    result: null,
    topicTitle: "Тема",
    studentStatus: null,
    submission: null,
    ...patch,
  };
}

function board(patch: Partial<LessonBoardModel> = {}): LessonBoardModel {
  return {
    serverNow: iso(START),
    id: "les",
    title: "Урок",
    kind: "LESSON",
    status: "ACTIVE",
    startsAt: iso(START),
    createdAt: iso(START - 24 * 60 * MINUTE),
    finishedAt: null,
    durationMinutes: 90,
    group: null,
    participants: [
      {
        id: "p1",
        studentId: "s1",
        studentName: "Артём",
        speed: null,
        planSummary: "…",
        planGeneratedAt: iso(START - MINUTE),
        planError: "plan-error:failed",
        createdAt: iso(START - 2 * MINUTE),
        joinedAt: null,
        items: [item("1"), item("2", { isExtra: true })],
      },
      { id: "p2", studentId: "s2", studentName: "Полина", speed: null, planSummary: null, planGeneratedAt: null, planError: null, createdAt: iso(START), joinedAt: null, items: [] },
    ],
    aiAvailable: true,
    idleWarnMinutes: 8,
    idleAlertMinutes: 15,
    ...patch,
  };
}

test("set parts and the id lists of a save", () => {
  const items = [item("1"), item("2", { isExtra: true }), item("3"), item("4", { isExtra: true })];
  const parts = splitParts(items);
  assert.deepEqual(parts.main.map((entry) => entry.id), ["1", "3"]);
  assert.deepEqual(parts.extra.map((entry) => entry.id), ["2", "4"]);
  const ids = setIdsOf(items);
  assert.deepEqual(ids, { mainIds: ["num_1", "num_3"], extraIds: ["num_2", "num_4"] });
  assert.deepEqual(withoutNumber(ids, "num_3"), { mainIds: ["num_1"], extraIds: ["num_2", "num_4"] });
  assert.deepEqual(withoutNumber(ids, "num_4"), { mainIds: ["num_1", "num_3"], extraIds: ["num_2"] });
  assert.deepEqual(withNumber(ids, "num_9", false), { mainIds: ["num_1", "num_3", "num_9"], extraIds: ["num_2", "num_4"] });
  assert.deepEqual(withNumber(ids, "num_9", true), { mainIds: ["num_1", "num_3"], extraIds: ["num_2", "num_4", "num_9"] });
});

test("itemOrdinal: the extra part continues the numbering of the main part", () => {
  assert.equal(itemOrdinal(0, false, 5), 1);
  assert.equal(itemOrdinal(4, false, 5), 5);
  assert.equal(itemOrdinal(0, true, 5), 6);
  assert.equal(itemOrdinal(1, true, 0), 2);
});

test("availableNumbers: the numbers of a topic that are not in the set yet", () => {
  const topic = { topicId: "t", topicTitle: "T", numbers: [{ id: "a", number: "1" }, { id: "b", number: "2" }, { id: "c", number: "3" }] };
  assert.deepEqual(availableNumbers(topic, ["b"]).map((entry) => entry.id), ["a", "c"]);
  assert.deepEqual(availableNumbers(undefined, []), []);
});

test("cache patches touch only the addressed participant / item", () => {
  const source = board();
  const replaced = replaceParticipantItems(source, "p1", [item("9")]);
  assert.deepEqual(replaced.participants[0]?.items.map((entry) => entry.id), ["9"]);
  assert.equal(replaced.participants[1], source.participants[1]);

  const patched = patchBoardItem(source, "p1", "2", { result: "SOLVED", studentStatus: "GREEN" });
  assert.equal(patched.participants[0]?.items[1]?.result, "SOLVED");
  assert.equal(patched.participants[0]?.items[1]?.studentStatus, "GREEN");
  assert.equal(patched.participants[0]?.items[0]?.result, null);

  const pending = markParticipantPending(source, "p1");
  assert.equal(pending.participants[0]?.planGeneratedAt, null);
  assert.equal(pending.participants[0]?.planError, null);
  // The set and the summary stay until the new plan arrives.
  assert.equal(pending.participants[0]?.items.length, 2);
  assert.equal(pending.participants[0]?.planSummary, "…");
});

test("participantLive: counts, last activity, idle level and minutes per problem", () => {
  const lesson = { status: "ACTIVE" as const, startsAt: iso(START), idleWarnMinutes: 8, idleAlertMinutes: 15 };
  const participant = {
    joinedAt: iso(START + MINUTE),
    items: [
      item("1", { submission: submission(START + 6 * MINUTE) }),
      item("2", { submission: submission(START + 16 * MINUTE) }),
      item("3"),
      item("4", { isExtra: true }),
    ],
  };
  const live = participantLive(participant, lesson, START + 25 * MINUTE);
  assert.equal(live.submittedCount, 2);
  assert.equal(live.totalCount, 4);
  assert.equal(live.lastActivityAt, START + 16 * MINUTE);
  assert.deepEqual(live.idle, { level: "warn", idleMinutes: 9 });
  assert.deepEqual(live.spentByItemId, { "1": 5, "2": 10 });
});

test("participantLive: nobody joined — idle is counted from the lesson start", () => {
  const lesson = { status: "ACTIVE" as const, startsAt: iso(START), idleWarnMinutes: 8, idleAlertMinutes: 15 };
  const live = participantLive({ joinedAt: null, items: [item("1")] }, lesson, START + 25 * MINUTE);
  assert.equal(live.lastActivityAt, null);
  assert.deepEqual(live.idle, { level: "alert", idleMinutes: 25 });
  assert.deepEqual(live.spentByItemId, {});
});

test("participantLive: no idle chip outside a live lesson, no minutes without a start time", () => {
  const participant = { joinedAt: iso(START), items: [item("1", { submission: submission(START + 5 * MINUTE) })] };
  const finished = participantLive(participant, { status: "FINISHED", startsAt: iso(START), idleWarnMinutes: 8, idleAlertMinutes: 15 }, START + 200 * MINUTE);
  assert.equal(finished.idle, null);
  assert.deepEqual(finished.spentByItemId, { "1": 5 });
  const unscheduled = participantLive(participant, { status: "PLANNED", startsAt: null, idleWarnMinutes: 8, idleAlertMinutes: 15 }, START);
  assert.equal(unscheduled.idle, null);
  assert.deepEqual(unscheduled.spentByItemId, {});
});

test("minutesAgo: whole minutes, never negative", () => {
  assert.equal(minutesAgo(iso(START), START + 59_000), 0);
  assert.equal(minutesAgo(iso(START), START + 61_000), 1);
  assert.equal(minutesAgo(iso(START + MINUTE), START), 0);
  assert.equal(minutesAgo("nonsense", START), 0);
});

test("scheduledStatus: follows the schedule, keeps the arrived status without a start", () => {
  const lesson = board({ status: "PLANNED" });
  assert.equal(scheduledStatus(lesson, START - 1), "PLANNED");
  assert.equal(scheduledStatus(lesson, START), "ACTIVE");
  assert.equal(scheduledStatus(lesson, START + 90 * MINUTE), "FINISHED");
  assert.equal(scheduledStatus(board({ startsAt: null, status: "FINISHED" }), START), "FINISHED");
  assert.equal(scheduledStatus(board({ finishedAt: iso(START + 10 * MINUTE) }), START + 11 * MINUTE), "FINISHED");
});

test("hasScheduleMovedOn: only a forward move of the schedule asks for a re-read", () => {
  assert.equal(hasScheduleMovedOn(board({ status: "PLANNED" }), START - 1), false);
  assert.equal(hasScheduleMovedOn(board({ status: "PLANNED" }), START), true);
  assert.equal(hasScheduleMovedOn(board({ status: "ACTIVE" }), START + 89 * MINUTE), false);
  assert.equal(hasScheduleMovedOn(board({ status: "ACTIVE" }), START + 90 * MINUTE), true);
  // The server already says ACTIVE while the local clock is still a moment before the start.
  assert.equal(hasScheduleMovedOn(board({ status: "ACTIVE" }), START - 500), false);
  assert.equal(hasScheduleMovedOn(board({ status: "FINISHED" }), START + 10 * MINUTE), false);
  assert.equal(hasScheduleMovedOn(board({ status: "PLANNED", startsAt: null }), START + 10 * MINUTE), false);
});

test("nextScheduleRefreshDelay: the next edge of the schedule plus one second", () => {
  assert.equal(nextScheduleRefreshDelay(board({ status: "PLANNED" }), START - 10 * MINUTE), 10 * MINUTE + 1000);
  assert.equal(nextScheduleRefreshDelay(board({ status: "ACTIVE" }), START + 30 * MINUTE), 60 * MINUTE + 1000);
  assert.equal(nextScheduleRefreshDelay(board({ status: "FINISHED" }), START + 30 * MINUTE), null);
  assert.equal(nextScheduleRefreshDelay(board({ startsAt: null, status: "PLANNED" }), START), null);
  // The schedule has ended but the board still says ACTIVE: nothing to wait for, the tick re-reads it.
  assert.equal(nextScheduleRefreshDelay(board({ status: "ACTIVE" }), START + 91 * MINUTE), null);
  // Further than a timer can wait (about 24.8 days).
  assert.equal(nextScheduleRefreshDelay(board({ status: "PLANNED", startsAt: iso(START + 40 * 24 * 60 * MINUTE) }), START), null);
});

test("needsSchedule: an unscheduled lesson that is not finished", () => {
  assert.equal(needsSchedule({ startsAt: null, status: "PLANNED" }), true);
  assert.equal(needsSchedule({ startsAt: null, status: "FINISHED" }), false);
  assert.equal(needsSchedule({ startsAt: iso(START), status: "PLANNED" }), false);
});

test("handout names: the site's file names by the Moscow day of creation", () => {
  // 22:30 UTC on the 15th is already the 16th in Moscow.
  const createdAt = "2026-11-15T22:30:00.000Z";
  assert.equal(handoutFileName(createdAt), "urok-2026-11-16.pdf");
  assert.equal(handoutFileName(createdAt, { answers: true }), "otvety-2026-11-16.pdf");
  assert.equal(handoutFileName(createdAt, { format: "html" }), "urok-2026-11-16.html");
  assert.equal(handoutFileName("nonsense"), "urok.pdf");
  assert.notEqual(handoutFileId("les", {}), handoutFileId("les", { answers: true }));
  assert.notEqual(handoutFileId("les", {}), handoutFileId("les", { studentId: "s1" }));
  assert.notEqual(handoutFileId("les", {}), handoutFileId("les", { format: "html" }));
});
