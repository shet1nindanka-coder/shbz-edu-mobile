/**
 * Pure decisions of the parent-calls screen (docs/spec/06-teacher-groups-calls-stats.md §1.4, §4.4): the
 * texts of a student row, the paging of the history sheet. No React, no React
 * Native — unit-tested in `tests/calls-logic.test.ts`.
 *
 * Days ("today", "3 d ago") are never computed here: they arrive from the server, counted in Moscow
 * calendar days (06 §7 Q11).
 */
import type { Locale, ParentCallEntry, ParentCallReminderState, ParentCallStudentOverview } from "@/api/types";
import { LIMITS } from "@/api/types";
import { formatMsk } from "@/domain/dates";
import { mskParts, type DateInput } from "@/domain/moscow-time";
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

/** The chip of a list row: `label` is its one word, `full` the site's label for a screen reader. */
export type AttentionChip = { tone: "red" | "yellow"; label: string; full: string };

/**
 * The chip of a list row: only a state that needs attention gets one — «пора» or a red «просрочено»;
 * «созвонились недавно» is no news. `short` are the one-word labels of the app.
 */
export function attentionChip(state: ParentCallReminderState, t: CallsDict, short: { due: string; overdue: string }): AttentionChip | null {
  if (state === "overdue") return { tone: "red", label: short.overdue, full: t.overdue };
  if (state === "due") return { tone: "yellow", label: short.due, full: t.due };
  return null;
}

/**
 * The one caption of a list row, and only when it says something the chip does not: how long ago the
 * parents were last reached («30 дн. назад»; `never` — «не звонили» — before the first such call) on a
 * row whose call is due. A developer reads the owning teacher's name there instead. Everything else — the
 * dates, the unanswered attempt — is in the row's spoken name and in the history behind the row. Call
 * comments never go into it: a row can be read over a shoulder, a comment only in the opened history.
 */
export function callRowCaption(student: ParentCallStudentOverview, t: CallsDict, never: string, showTeacher: boolean): string | undefined {
  if (showTeacher) return student.teacherName ?? undefined;
  if (student.reminder.state === "ok") return undefined;
  return student.lastReachedAt ? agoLabel(student.reminder.daysSinceAnchor, t) : never;
}

/** The site's summary line: the spoken name of the list (the eye has the chips of the rows). */
export function summaryLine(counts: { overdue: number; due: number; total: number }, t: CallsDict): string {
  return format(t.summary, counts);
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

/** «5 ноября в 18:30» — Moscow time, whatever the device zone is. The spoken form of a history entry. */
export function historyEntryTime(entry: Pick<ParentCallEntry, "calledAt">, locale: Locale): string {
  return formatMsk(entry.calledAt, "dayMonthTime", locale) ?? "";
}

/**
 * The day of a history entry as the eye reads it: «5 нояб.» within the current Moscow year, «5 ноября
 * 2025» for an older call. The time of day is in the spoken form only.
 */
export function historyEntryDay(entry: Pick<ParentCallEntry, "calledAt">, now: DateInput, locale: Locale): string {
  const sameYear = mskParts(entry.calledAt).year === mskParts(now).year;
  return formatMsk(entry.calledAt, sameYear ? "dayMonthShort" : "shortDate", locale) ?? "";
}

