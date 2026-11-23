// Lessons list and "new lesson" forms: pure rules (05 §1.1, §1.2).
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
import test from "node:test";
import assert from "node:assert/strict";
import type { LessonListItem } from "@/api/types";
import { mskDate } from "@/domain/moscow-time";
import {
  groupLessons,
  hasScheduleAdvanced,
  lessonAudience,
  lessonChips,
  lessonDateOf,
} from "@/screens/planner/lessons/lessons-list-logic";
import {
  buildAiLessonInput,
  buildManualLessonInput,
  clampDuration,
  composeStatement,
  filterByName,
  filterTopics,
  checkedMemberIds,
  currentSpeeds,
  stepDuration,
  toggleId,
} from "@/screens/planner/lessons/new-lesson-logic";

const at = (day: number, hour: number, minute = 0) => mskDate({ year: 2026, month: 11, day, hour, minute }).toISOString();
const NOW = Date.parse(at(16, 12));

function lesson(patch: Partial<LessonListItem> & { id: string }): LessonListItem {
  return {
    title: patch.id,
    status: "PLANNED",
    durationMinutes: 60,
    createdAt: at(10, 9),
    startsAt: null,
    groupId: null,
    groupName: null,
    soloStudentName: null,
    resultsTotal: 0,
    resultsMarked: 0,
    participantsCount: 1,
    readyCount: 1,
    failedCount: 0,
    ...patch,
  };
}

test("groupLessons: today by Moscow day, upcoming ascending, past descending, empty sections dropped", () => {
  const sections = groupLessons(
    [
      lesson({ id: "past_old", status: "FINISHED", startsAt: at(1, 17) }),
      lesson({ id: "today_late", status: "PLANNED", startsAt: at(16, 23, 30) }),
      lesson({ id: "upcoming_far", startsAt: at(20, 16) }),
      lesson({ id: "today_finished", status: "FINISHED", startsAt: at(16, 0, 5) }),
      lesson({ id: "past_new", status: "FINISHED", startsAt: at(12, 17) }),
      lesson({ id: "upcoming_near", startsAt: at(17, 16) }),
      // Unscheduled and never finished: its date is createdAt, so it is "upcoming" although it is in the past.
      lesson({ id: "unscheduled", createdAt: at(9, 10) }),
    ],
    NOW,
  );
  assert.deepEqual(
    sections.map((section) => [section.key, section.lessons.map((item) => item.id)]),
    [
      ["today", ["today_finished", "today_late"]],
      ["upcoming", ["unscheduled", "upcoming_near", "upcoming_far"]],
      ["past", ["past_new", "past_old"]],
    ],
  );
  assert.deepEqual(groupLessons([lesson({ id: "only", startsAt: at(18, 10) })], NOW).map((section) => section.key), ["upcoming"]);
  assert.deepEqual(groupLessons([], NOW), []);
});

test("groupLessons: the Moscow day decides, not the UTC day", () => {
  // 00:30 Moscow on the 17th is still the 16th in UTC.
  const sections = groupLessons([lesson({ id: "after_midnight", startsAt: at(17, 0, 30) })], NOW);
  assert.equal(sections[0]?.key, "upcoming");
});

test("lesson card facts: date, audience, chips", () => {
  assert.equal(lessonDateOf({ startsAt: at(18, 10), createdAt: at(1, 1) }), at(18, 10));
  assert.equal(lessonDateOf({ startsAt: null, createdAt: at(1, 1) }), at(1, 1));
  assert.equal(lessonAudience({ groupName: "8А", soloStudentName: null }), "8А");
  assert.equal(lessonAudience({ groupName: null, soloStudentName: "Илья" }), "Илья");
  assert.equal(lessonAudience({ groupName: null, soloStudentName: null }), null);
  assert.deepEqual(lessonChips({ failedCount: 0, readyCount: 3, participantsCount: 3 }), { errors: null, selecting: null });
  // A failed participant is not "ready", so the selection chip stays next to the error chip.
  assert.deepEqual(lessonChips({ failedCount: 2, readyCount: 1, participantsCount: 3 }), { errors: 2, selecting: { ready: 1, total: 3 } });
});

test("hasScheduleAdvanced: only a forward move of the schedule asks for a re-read", () => {
  const planned = { startsAt: at(16, 13), durationMinutes: 60, status: "PLANNED" as const };
  assert.equal(hasScheduleAdvanced([planned], NOW), false);
  assert.equal(hasScheduleAdvanced([planned], Date.parse(at(16, 13, 1))), true);
  const active = { startsAt: at(16, 11, 30), durationMinutes: 60, status: "ACTIVE" as const };
  assert.equal(hasScheduleAdvanced([active], NOW), false);
  assert.equal(hasScheduleAdvanced([active], Date.parse(at(16, 12, 31))), true);
  // Finished early by the teacher: the schedule still says "running", which is not a move forward.
  assert.equal(hasScheduleAdvanced([{ ...active, status: "FINISHED" as const }], NOW), false);
  // No time — nothing to follow.
  assert.equal(hasScheduleAdvanced([{ startsAt: null, durationMinutes: 60, status: "PLANNED" as const }], NOW), false);
});

test("duration: clamp to 15..240 and step by 5 on the 5-minute grid", () => {
  assert.equal(clampDuration(5), 15);
  assert.equal(clampDuration(999), 240);
  assert.equal(clampDuration(Number.NaN), 60);
  assert.equal(stepDuration(60, 1), 65);
  assert.equal(stepDuration(60, -1), 55);
  assert.equal(stepDuration(15, -1), 15);
  assert.equal(stepDuration(240, 1), 240);
  assert.equal(stepDuration(62, 1), 65);
  assert.equal(stepDuration(62, -1), 60);
});

test("filterTopics / filterByName: case-insensitive substring, empty query keeps everything", () => {
  const topics = [
    { id: "t1", title: "Линейные уравнения" },
    { id: "t2", title: "Логарифмические уравнения" },
    { id: "t3", title: "Производная" },
  ];
  assert.deepEqual(filterTopics(topics, "  УРАВН ").map((topic) => topic.id), ["t1", "t2"]);
  assert.deepEqual(filterTopics(topics, "").length, 3);
  assert.deepEqual(filterTopics(topics, "xyz"), []);
  assert.deepEqual(filterByName([{ name: "Илья Петров" }, { name: "Мария Волкова" }], "вол").map((row) => row.name), ["Мария Волкова"]);
});

test("buildAiLessonInput: trimmed texts, Moscow wall clock → ISO, speeds of checked students only", () => {
  const input = buildAiLessonInput(
    {
      title: "  Логарифмы  ",
      durationMinutes: 90,
      startsAt: "2026-11-18T17:00",
      topicIds: ["t2"],
      teacherNote: " без стереометрии ",
      studentIds: ["s1", "s3"],
      speeds: { s1: 7, s2: 4, s3: null },
    },
    "grp_8a",
  );
  assert.deepEqual(input, {
    groupId: "grp_8a",
    studentIds: ["s1", "s3"],
    title: "Логарифмы",
    durationMinutes: 90,
    startsAt: "2026-11-18T14:00:00.000Z",
    topicIds: ["t2"],
    teacherNote: "без стереометрии",
    speeds: { s1: 7, s3: null },
  });
});

test("buildAiLessonInput: an empty title, no time and no group are left out", () => {
  const input = buildAiLessonInput(
    { title: " ", durationMinutes: 500, startsAt: "", topicIds: [], teacherNote: "", studentIds: ["s1"], speeds: {} },
    null,
  );
  assert.deepEqual(input, { studentIds: ["s1"], durationMinutes: 240, topicIds: [], teacherNote: "", speeds: { s1: null } });
});

test("buildManualLessonInput: skipPlan with the numbers in the order they were picked", () => {
  assert.deepEqual(buildManualLessonInput({ studentId: "s1", durationMinutes: 45, startsAt: "", numberIds: ["n3", "n1"] }), {
    studentIds: ["s1"],
    durationMinutes: 45,
    topicIds: [],
    teacherNote: "",
    skipPlan: true,
    numberIds: ["n3", "n1"],
  });
});

test("toggleId keeps the order of selection", () => {
  assert.deepEqual(toggleId(toggleId(toggleId([], "b"), "a"), "b"), ["a"]);
  assert.deepEqual(toggleId(["a"], "c"), ["a", "c"]);
});

test("composeStatement: inlined statements win only for a loaded topic", () => {
  assert.equal(composeStatement({ conditionsLoaded: true }, { id: "n1", conditionLatex: "$x$" }, { n1: "other" }), "$x$");
  assert.equal(composeStatement({ conditionsLoaded: true }, { id: "n1", conditionLatex: null }, { n1: "other" }), null);
  assert.equal(composeStatement({ conditionsLoaded: false }, { id: "n1", conditionLatex: null }, { n1: "$y$" }), "$y$");
  assert.equal(composeStatement({ conditionsLoaded: false }, { id: "n1", conditionLatex: null }, undefined), null);
});

test("checkedMemberIds: every current member is checked unless the teacher unchecked them", () => {
  const cached = [{ id: "s1" }, { id: "s2" }];
  assert.deepEqual(checkedMemberIds(cached, []), ["s1", "s2"]);
  assert.deepEqual(checkedMemberIds(cached, ["s2"]), ["s1"]);
  // The fresh answer replaces the cached one while the form is open: a new member is checked, a removed
  // one is not sent, the teacher's own uncheck survives.
  const fresh = [{ id: "s2" }, { id: "s3" }];
  assert.deepEqual(checkedMemberIds(fresh, []), ["s2", "s3"]);
  assert.deepEqual(checkedMemberIds(fresh, ["s2"]), ["s3"]);
  assert.deepEqual(checkedMemberIds(fresh, ["s1"]), ["s2", "s3"]);
});

test("currentSpeeds: the current profile speed unless the teacher picked one for this lesson", () => {
  const cached = [{ id: "s1", name: "A", speed: 4 }, { id: "s2", name: "B", speed: null }];
  assert.deepEqual(currentSpeeds(cached, {}), { s1: 4, s2: null });
  // The profile speed changed since the cached answer: the untouched field follows it.
  const fresh = [{ id: "s1", name: "A", speed: 7 }, { id: "s2", name: "B", speed: 3 }, { id: "s3", name: "C", speed: 9 }];
  assert.deepEqual(currentSpeeds(fresh, {}), { s1: 7, s2: 3, s3: 9 });
  // A pick wins, including an explicit "not set"; picks of students no longer listed are dropped.
  assert.deepEqual(currentSpeeds(fresh, { s1: 2, s2: null, gone: 5 }), { s1: 2, s2: null, s3: 9 });
});
