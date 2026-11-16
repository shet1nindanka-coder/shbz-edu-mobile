// Ported from the site (tests/attendance.test.ts): the same cases against the ported module.
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
import test from "node:test";
import assert from "node:assert/strict";
import {
  decideEndOfLessonAttendance,
  formatAttendanceSummary,
  nextAttendance,
  summarizeAttendance
} from "@/domain/attendance";
import { getDictionary } from "@/i18n/get-dictionary";

const attendanceRu = getDictionary("ru").planner.attendance;

test("summarizeAttendance: опоздание считается посещением, уважительная не портит процент", () => {
  const summary = summarizeAttendance(["PRESENT", "LATE", "ABSENT", "EXCUSED", "UNKNOWN"]);

  assert.deepEqual(summary, { counted: 4, attended: 2, late: 1, absent: 1, excused: 1, percent: 67 });
  assert.equal(formatAttendanceSummary(summary, attendanceRu), "был на 2 из 4 · опозданий 1 · по уважительной 1 · 67%");
});

test("summarizeAttendance: без отметок процент не считается", () => {
  assert.deepEqual(summarizeAttendance(["UNKNOWN"]), {
    counted: 0,
    attended: 0,
    late: 0,
    absent: 0,
    excused: 0,
    percent: null
  });
  assert.equal(formatAttendanceSummary(summarizeAttendance([]), attendanceRu), "занятий не было");
  // Только уважительные: делить не на что.
  assert.equal(summarizeAttendance(["EXCUSED", "EXCUSED"]).percent, null);
});

test("nextAttendance: цикл был → опоздал → не был → уважительная → был; из «не отмечено» — был", () => {
  assert.equal(nextAttendance("UNKNOWN"), "PRESENT");
  assert.equal(nextAttendance("PRESENT"), "LATE");
  assert.equal(nextAttendance("LATE"), "ABSENT");
  assert.equal(nextAttendance("ABSENT"), "EXCUSED");
  assert.equal(nextAttendance("EXCUSED"), "PRESENT");
});

test("decideEndOfLessonAttendance: только для неотмеченных; активность — был, иначе — не был", () => {
  assert.equal(decideEndOfLessonAttendance({ current: "UNKNOWN", hadActivity: true }), "PRESENT");
  assert.equal(decideEndOfLessonAttendance({ current: "UNKNOWN", hadActivity: false }), "ABSENT");
  assert.equal(decideEndOfLessonAttendance({ current: "EXCUSED", hadActivity: false }), null);
  assert.equal(decideEndOfLessonAttendance({ current: "LATE", hadActivity: true }), null);
});
