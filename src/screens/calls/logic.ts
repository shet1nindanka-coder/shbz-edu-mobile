/**
 * Pure decisions of the parent-calls screen (docs/spec/06-teacher-groups-calls-stats.md §1.4, §4.4): the
 * texts of a student row, the rows of the list, the paging of the history sheet. No React, no React
 * Native — unit-tested in `tests/calls-logic.test.ts`.
 *
 * Days ("today", "3 d ago") are never computed here: they arrive from the server, counted in Moscow
 * calendar days (06 §7 Q11).
 */
import type { Locale, ParentCallEntry, ParentCallReminderState, ParentCallStudentOverview } from "@/api/types";
import { LIMITS } from "@/api/types";
import { formatMsk } from "@/domain/dates";
import { format, type Dictionary } from "@/lib/i18n";

type CallsDict = Dictionary["planner"]["calls"];

/**
 * Entries per request of the history sheet (the overview itself carries the newest 20).
 * SPEC-GAP: the contract only caps a page at 100; the sheet pages by the overview's own 20.
 */
export const HISTORY_PAGE_SIZE = LIMITS.parentCallHistoryShown;

// ───────────────────────────── a student row ─────────────────────────────

/** «сегодня» for 0, «3 дн. назад» otherwise. */
export function agoLabel(days: number, t: CallsDict): string {
  return days === 0 ? t.today : format(t.daysAgo, { n: days });
}

/**
 * The parts of the meta line under the name, in the site's order: the last successful call (or «звонков
 * ещё не было · ученик добавлен …»), then the unanswered attempt made after it.
 */
export function callMetaParts(student: ParentCallStudentOverview, t: CallsDict, locale: Locale): string[] {
  const parts: string[] = [];

  if (student.lastReachedAt) {
    parts.push(
      format(t.lastCall, {
        date: formatMsk(student.lastReachedAt, "dayMonth", locale) ?? "",
        ago: agoLabel(student.reminder.daysSinceAnchor, t),
      }),
    );
  } else {
    parts.push(format(t.noCalls, { date: formatMsk(student.studentCreatedAt, "dayMonth", locale) ?? "" }));
  }

  if (student.attemptAfterLastReached && student.attemptDaysAgo !== null) {
    parts.push(format(t.attempted, { ago: agoLabel(student.attemptDaysAgo, t) }));
  }

  return parts;
}

/** The meta line as the site prints it. */
export function callMetaLine(student: ParentCallStudentOverview, t: CallsDict, locale: Locale): string {
  return callMetaParts(student, t, locale).join(" · ");
}

/** «Учитель: Анна Петрова» (developer only); a student without a teacher gets a dash. */
export function teacherLine(student: Pick<ParentCallStudentOverview, "teacherName">, t: CallsDict): string {
  return format(t.teacher, { name: student.teacherName ?? "—" });
}

export type ReminderChip = { tone: "red" | "yellow" | "muted"; label: string };

/** Status chip of a row. `ok` is shown for a brand-new student without calls as well. */
export function reminderChip(state: ParentCallReminderState, t: CallsDict): ReminderChip {
  if (state === "overdue") return { tone: "red", label: t.overdue };
  if (state === "due") return { tone: "yellow", label: t.due };
  return { tone: "muted", label: t.ok };
}

/** The chip of a list row: only a state that needs attention gets one; «созвонились недавно» is no news. */
export function attentionChip(state: ParentCallReminderState, t: CallsDict): ReminderChip | null {
  const chip = reminderChip(state, t);
  return chip.tone === "muted" ? null : chip;
}

/**
 * The one caption of a list row: the latest fact of the meta line — the unanswered attempt when there was
 * one after the last successful call, that call otherwise — led by the owning teacher's name for a
 * developer. The whole line is in the row's spoken name and in the history behind the row. Call comments
 * never go into it: a row can be read over a shoulder, a comment only in the opened history.
 */
export function callRowCaption(student: ParentCallStudentOverview, t: CallsDict, locale: Locale, showTeacher: boolean): string {
  const parts = callMetaParts(student, t, locale);
  const latest = parts[parts.length - 1] ?? "";
  return showTeacher ? `${student.teacherName ?? "—"} · ${latest}` : latest;
}

/** «История (23)»; «История (—)» when there is nothing to open (the button is then disabled). */
export function historyButtonLabel(totalCalls: number, t: CallsDict): string {
  return format(t.history, { n: totalCalls === 0 ? "—" : totalCalls });
}

/** The site's summary line, read out for the three counters. */
export function summaryLine(counts: { overdue: number; due: number; total: number }, t: CallsDict): string {
  return format(t.summary, counts);
}

// ───────────────────────────── the list ─────────────────────────────

/** The sticky counters come first, then one row per student in the server's order. */
export type CallListRow = { type: "summary" } | { type: "student"; student: ParentCallStudentOverview };

export function buildCallRows(students: readonly ParentCallStudentOverview[]): CallListRow[] {
  // No students: the list shows its empty state, without counters of zeros above it.
  if (students.length === 0) return [];
  return [{ type: "summary" }, ...students.map((student) => ({ type: "student" as const, student }))];
}

/** Index of a student's row for scroll-to (a notification link); -1 when the student is not listed. */
export function rowIndexOfStudent(rows: readonly CallListRow[], studentId: string | null | undefined): number {
  if (!studentId) return -1;
  return rows.findIndex((row) => row.type === "student" && row.student.studentId === studentId);
}

// ───────────────────────────── history ─────────────────────────────

/**
 * Cursor of the first "earlier" request: the oldest entry the overview already carries. Null when the
 * overview holds the whole history (the button shows the total, the overview at most 20 — 06 §7 Q10).
 */
export function earlierHistoryCursor(student: Pick<ParentCallStudentOverview, "history" | "totalCalls">): string | null {
  const last = student.history[student.history.length - 1];
  return last && student.totalCalls > student.history.length ? last.id : null;
}

/** The overview's entries followed by the loaded earlier pages, newest first, each call once. */
export function mergeHistory(shown: readonly ParentCallEntry[], earlierPages: readonly (readonly ParentCallEntry[])[]): ParentCallEntry[] {
  const seen = new Set<string>();
  const merged: ParentCallEntry[] = [];
  for (const entry of [...shown, ...earlierPages.flat()]) {
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    merged.push(entry);
  }
  return merged;
}

/** A call of the journal with the student it was about. */
export type JournalEntry = { entry: ParentCallEntry; studentId: string; studentName: string };

/**
 * The journal of the read-only view: the calls of every student, newest first, assembled from the
 * histories the overview already carries. A student's history is cut at its newest 20, so the journal
 * stops at the newest cut — below it calls of that student would be missing between the others.
 */
export function buildCallJournal(students: readonly ParentCallStudentOverview[]): JournalEntry[] {
  let cutoff = "";
  const entries: JournalEntry[] = [];
  for (const student of students) {
    const oldest = student.history[student.history.length - 1];
    if (oldest && student.totalCalls > student.history.length && oldest.calledAt > cutoff) cutoff = oldest.calledAt;
    for (const entry of student.history) entries.push({ entry, studentId: student.studentId, studentName: student.studentName });
  }
  // ISO instants in UTC compare as strings.
  return entries.filter((row) => row.entry.calledAt >= cutoff).sort((left, right) => (left.entry.calledAt < right.entry.calledAt ? 1 : -1));
}

/** «5 ноября в 18:30» — Moscow time, whatever the device zone is. */
export function historyEntryTime(entry: Pick<ParentCallEntry, "calledAt">, locale: Locale): string {
  return formatMsk(entry.calledAt, "dayMonthTime", locale) ?? "";
}

/**
 * Length of the longest word of a label, at least 4. The summary counters share their row in this
 * proportion, so a one-word label gets the room it cannot give up by wrapping.
 */
export function longestWordLength(label: string): number {
  return label.split(/\s+/).reduce((longest, word) => Math.max(longest, word.length), 4);
}

