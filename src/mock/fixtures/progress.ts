/**
 * Per-student progress — docs/spec/09-data-i18n-math.md §2.6 with the pinned rows of 90-addendum-6 §6.2 and
 * §6.6. Runs AFTER the lessons (whose results were mirrored onto the statuses) and pins the exact rows the
 * personas need; also writes the 25-event history of (Илья, 118).
 */
import type {
  HomeworkNumberStatus,
  IsoDateTime,
  ProgressDecisionReason,
  ProgressEventContext,
  ProgressSource,
} from "@/api/types";
import { HOUR_MS } from "@/domain/moscow-time";

import type { FixtureBuilder } from "./builder";
import { USER, numberId } from "./ids";

type Mark = [label: string, status: HomeworkNumberStatus, day: number, hour?: number, minute?: number];

function markAll(b: FixtureBuilder, studentId: string, marks: Mark[]): void {
  for (const [label, status, day, hour = 18, minute = 0] of marks) b.mark(studentId, label, status, b.at(day, hour, minute));
}

export function addProgress(b: FixtureBuilder): void {
  // ── Илья: solvedToday 1, currentStreak 5 (today … −4 d), nothing closed on day −5, bestStreak 9 (−40 … −32).
  markAll(b, USER.ilya, [
    ["112", "GREEN", -20, 19, 30],
    ["113", "YELLOW", -19, 18, 1],
    ["121", "GREEN", -1, 17],
    ["127", "YELLOW", -7, 16],
    ["130", "RED", -6, 16],
    ["204", "GREEN", -12, 17],
    ["215", "YELLOW", -10, 17],
    ["301", "YELLOW", -9, 17],
    ["010204", "GREEN", -3],
    ["010205", "GREEN", -2, 17],
    ["010206", "GREEN", -1],
    ["010209", "RED", -2, 19, 30],
    ["401", "GREEN", -40, 17],
    ["402", "YELLOW", -39, 17],
    ["403", "GREEN", -38, 17],
    ["404", "YELLOW", -37, 17],
    ["405", "GREEN", -36, 17],
    ["501", "GREEN", -35, 17],
    ["502", "GREEN", -34, 17],
    ["503", "GREEN", -33, 17],
    ["504", "GREEN", -32, 17],
  ]);
  // The latest homework check answered INCORRECT for 118 (see `hw_ilya_overdue`).
  b.mark(USER.ilya, "118", "RED", b.plusMinutes(b.at(-2, 18), 0.15));
  // Solved two hours before the seed (never earlier than today's midnight, so it stays "today").
  b.mark(USER.ilya, "010207", "GREEN", b.earlierToday(2 * HOUR_MS));
  // A fresh manual clear by the teacher: the row must survive deadline / note clean-up.
  b.mark(USER.ilya, "124", null, b.at(-6, 15));
  b.note(USER.ilya, "113", "Перепутал знак при раскрытии скобок", b.at(-19, 18, 30));
  // Status null with a note.
  b.note(USER.ilya, "120", "Спросить на занятии про проверку корня.", b.at(-3, 20));
  for (const label of ["211", "218", "220", "302", "305", "010208", "010210"]) b.unmark(USER.ilya, label);

  // ── Мария: every assigned number is closed; last change −2 d → streak 0, best 4 (−12 … −9).
  markAll(b, USER.maria, [
    ["120", "GREEN", -15],
    ["121", "GREEN", -14],
    ["112", "GREEN", -12],
    ["113", "YELLOW", -11],
    ["118", "GREEN", -10, 19],
    ["301", "GREEN", -9],
    ["302", "YELLOW", -7, 19],
    ["204", "GREEN", -7],
    ["207", "GREEN", -5],
    ["211", "YELLOW", -4],
    ["215", "GREEN", -2],
  ]);

  // ── Артём: strong (≈ 85 % GREEN); pinned for `hp_conflict`: 120 no row, 124 RED, 127 GREEN, 130 YELLOW.
  markAll(b, USER.artem, [
    ["124", "RED", -8],
    ["127", "GREEN", -1, 12],
    ["130", "YELLOW", -1, 12, 5],
    ["501", "GREEN", -34],
    ["502", "GREEN", -33],
    ["503", "GREEN", -32],
    ["504", "GREEN", -31],
    ["505", "GREEN", -30],
    ["506", "GREEN", -29],
  ]);
  b.unmark(USER.artem, "120");

  // ── Полина: average (≈ 60 % GREEN).
  markAll(b, USER.polina, [
    ["501", "GREEN", -50],
    ["502", "GREEN", -49],
    ["503", "GREEN", -48],
    ["504", "GREEN", -47],
    ["512", "GREEN", -46],
    ["513", "GREEN", -45],
  ]);

  // ── Кирилл: weak (≈ 35 % GREEN, many RED), last change −9 d; pinned for `hp_conflict`: 112 RED, 113 / 118 no row.
  markAll(b, USER.kirill, [
    ["401", "GREEN", -40],
    ["402", "GREEN", -39],
    ["403", "YELLOW", -38],
    ["404", "GREEN", -37],
    ["405", "YELLOW", -36],
    ["501", "GREEN", -34],
    ["502", "RED", -33],
    ["503", "RED", -32],
    ["504", "GREEN", -31],
    ["505", "GREEN", -30],
    ["112", "RED", -12],
    ["301", "RED", -9],
  ]);
  b.unmark(USER.kirill, "113");
  b.unmark(USER.kirill, "118");

  // ── Даша: three coloured rows (two from her past lesson).
  markAll(b, USER.dasha, [["127", "RED", -3, 17]]);

  // ── Софья (Igor's student): one GREEN on each of the days −3, −2, −1, nothing today → streak 3, solvedToday 0.
  markAll(b, USER.sofia, [
    ["301", "GREEN", -3],
    ["302", "GREEN", -2],
    ["305", "GREEN", -1],
  ]);
  markAll(b, USER.egor, [
    ["112", "GREEN", -20],
    ["113", "RED", -18],
  ]);

  addIlya118History(b);
}

type EventSpec = {
  at: IsoDateTime;
  source: ProgressSource;
  previous: HomeworkNumberStatus | null;
  requested: HomeworkNumberStatus | null;
  status: HomeworkNumberStatus | null;
  decision: ProgressDecisionReason;
  /** `"anna"` = the teacher's manual action; `null` = the system (checks, end of lesson). */
  actor: "anna" | null;
  context?: ProgressEventContext;
};

/**
 * 25 events of (Илья, 118): the history sheet paginates (20 + 5) and shows every source with its
 * representative decisions. Two events link to an existing lesson, two to an existing homework, three to a
 * lesson that no longer exists (no link). The last WRITTEN event leaves the status RED, as stored.
 */
function addIlya118History(b: FixtureBuilder): void {
  const oldHomework = "hw_ilya_cancelled";
  const removedLesson = "les_removed";
  const oldCheck = (index: number, startedAt: IsoDateTime, verdict: "CORRECT" | "INCORRECT" | "UNCERTAIN"): ProgressEventContext => ({
    assignmentId: oldHomework,
    checkId: `chk_ilya_cancelled_${index}`,
    verdict,
    checkStartedAt: startedAt,
  });

  const events: EventSpec[] = [
    { at: b.at(-60, 17, 5), source: "teacher", previous: null, requested: "RED", status: "RED", decision: "changed", actor: "anna" },
    { at: b.at(-60, 17, 6), source: "teacher", previous: "RED", requested: "RED", status: "RED", decision: "reaffirmed", actor: "anna" },
    { at: b.at(-56, 19), source: "homework_check", previous: "RED", requested: "YELLOW", status: "YELLOW", decision: "changed", actor: null, context: oldCheck(1, b.at(-56, 18, 59), "CORRECT") },
    { at: b.at(-55, 19), source: "homework_check", previous: "YELLOW", requested: "YELLOW", status: "YELLOW", decision: "unchanged", actor: null, context: oldCheck(2, b.at(-55, 18, 59), "CORRECT") },
    { at: b.at(-54, 19), source: "homework_check", previous: "YELLOW", requested: "RED", status: "YELLOW", decision: "downgrade_blocked", actor: null, context: oldCheck(3, b.at(-54, 18, 59), "INCORRECT") },
    { at: b.at(-53, 19), source: "homework_check", previous: "YELLOW", requested: null, status: "YELLOW", decision: "uncertain", actor: null, context: oldCheck(4, b.at(-53, 18, 59), "UNCERTAIN") },
    { at: b.at(-50, 18), source: "teacher", previous: "YELLOW", requested: "RED", status: "RED", decision: "changed", actor: "anna" },
    // The check started two minutes before the teacher's mark: the fresher mark wins.
    { at: b.at(-50, 18, 2), source: "homework_check", previous: "RED", requested: "YELLOW", status: "RED", decision: "newer_status", actor: null, context: oldCheck(5, b.at(-50, 17, 58), "CORRECT") },
    { at: b.at(-45, 16, 20), source: "lesson_check", previous: "RED", requested: "GREEN", status: "GREEN", decision: "changed", actor: null, context: { lessonId: removedLesson, itemId: "li_removed_118", submissionId: "sub_removed_118_1", verdict: "CORRECT", lessonResult: "SOLVED" } },
    { at: b.at(-45, 16, 30), source: "lesson_check", previous: "GREEN", requested: null, status: "GREEN", decision: "lesson_result_preserved", actor: null, context: { lessonId: removedLesson, itemId: "li_removed_118", submissionId: "sub_removed_118_2", verdict: "INCORRECT", lessonResult: null } },
    { at: b.at(-45, 16, 50), source: "lesson_teacher", previous: "GREEN", requested: "YELLOW", status: "YELLOW", decision: "changed", actor: "anna", context: { lessonId: removedLesson, itemId: "li_removed_118", lessonResult: "PARTIAL" } },
    { at: b.at(-38, 18), source: "teacher", previous: "YELLOW", requested: "GREEN", status: "GREEN", decision: "changed", actor: "anna" },
    { at: b.at(-34, 19), source: "homework_check", previous: "GREEN", requested: null, status: "GREEN", decision: "uncertain", actor: null, context: oldCheck(6, b.at(-34, 18, 59), "UNCERTAIN") },
    { at: b.at(-30, 18), source: "teacher", previous: "GREEN", requested: "GREEN", status: "GREEN", decision: "reaffirmed", actor: "anna" },
    { at: b.at(-25, 18), source: "teacher", previous: "GREEN", requested: "RED", status: "RED", decision: "changed", actor: "anna" },
    { at: b.at(-24, 18), source: "teacher", previous: "RED", requested: null, status: null, decision: "changed", actor: "anna" },
    { at: b.at(-20, 18), source: "teacher", previous: null, requested: "YELLOW", status: "YELLOW", decision: "changed", actor: "anna" },
    { at: b.at(-18, 19), source: "homework_check", previous: "YELLOW", requested: "YELLOW", status: "YELLOW", decision: "unchanged", actor: null, context: oldCheck(7, b.at(-18, 18, 59), "CORRECT") },
    { at: b.at(-15, 18), source: "teacher", previous: "YELLOW", requested: null, status: null, decision: "changed", actor: "anna" },
    // les_d1: handed in, not recognised → left unmarked → "not solved" when the lesson ended (actor null → «система»).
    { at: b.at(-11, 16, 20), source: "lesson_check", previous: null, requested: null, status: null, decision: "uncertain", actor: null, context: { lessonId: "les_d1", itemId: "li_les_d1_ilya_118", submissionId: "sub_les_d1_ilya_118_1", verdict: "UNCERTAIN", lessonResult: null } },
    { at: b.at(-11, 17), source: "lesson_end", previous: null, requested: "RED", status: "RED", decision: "changed", actor: null, context: { lessonId: "les_d1", itemId: "li_les_d1_ilya_118", lessonResult: "NOT_SOLVED" } },
    { at: b.at(-10, 18), source: "teacher", previous: "RED", requested: null, status: null, decision: "changed", actor: "anna" },
    // An earlier check of the current homework (its row has since been pruned) could not read the solution.
    { at: b.at(-8, 19), source: "homework_check", previous: null, requested: null, status: null, decision: "uncertain", actor: null, context: { assignmentId: "hw_ilya_overdue", checkId: "chk_ilya_overdue_0", verdict: "UNCERTAIN", checkStartedAt: b.at(-8, 18, 59) } },
    // les_d2: the teacher marked "not reached" — no change of the overall progress.
    { at: b.at(-4, 16, 30), source: "lesson_teacher", previous: null, requested: null, status: null, decision: "no_status", actor: "anna", context: { lessonId: "les_d2", itemId: "li_les_d2_ilya_118", lessonResult: "SKIPPED" } },
    { at: b.plusMinutes(b.at(-2, 18), 0.15), source: "homework_check", previous: null, requested: "RED", status: "RED", decision: "changed", actor: null, context: { assignmentId: "hw_ilya_overdue", checkId: "chk_ilya_overdue_1", verdict: "INCORRECT", checkStartedAt: b.at(-2, 18) } },
  ];

  events.forEach((event, index) => {
    b.add("progressEvents", {
      id: `pse_ilya_118_${String(index + 1).padStart(2, "0")}`,
      createdAt: event.at,
      studentId: USER.ilya,
      homeworkNumberId: numberId("118"),
      source: event.source,
      previousStatus: event.previous,
      requestedStatus: event.requested,
      status: event.status,
      decision: event.decision,
      actorId: event.actor ? USER.anna : null,
      actorName: event.actor ? "Анна Петрова" : null,
      actorRole: event.actor ? "TEACHER" : null,
      context: event.context ?? {},
    });
  });
}
