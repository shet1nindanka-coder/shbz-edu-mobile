/**
 * Pure decisions of the groups screens (docs/spec/06-teacher-groups-calls-stats.md §1.1, §1.2, §4.1 – §4.3):
 * what a row says, which figures stand above the ranking, which students the add-member search offers,
 * how the attendance matrix is laid out and how an optimistic mark is applied. No React, no React Native — unit-tested in
 * `tests/groups-logic.test.ts`.
 */
import type {
  AttendanceStatus,
  AttentionFlag,
  GroupAttendanceLesson,
  GroupAttendanceResponse,
  GroupCandidate,
  GroupListItem,
  GroupMemberRow,
  GroupStatisticsResponse,
  Locale,
} from "@/api/types";
import { LIMITS } from "@/api/types";
import { summarizeAttendance, type AttendanceSummary } from "@/domain/attendance";
import { formatClockTime, formatDateTime, formatMsk, formatShortDate } from "@/domain/dates";
import { mskParts, type DateInput } from "@/domain/moscow-time";
import { normalizeSingleLineText } from "@/domain/text";
import { format, type Dictionary } from "@/lib/i18n";

type GroupsDict = Dictionary["planner"]["groups"];

/** `StudentGroup.name`: required, one line; a longer name is cut by the server, not refused. */
export const GROUP_NAME_MAX_LENGTH = 120;
export const GROUP_GRADE_MIN = 1;
export const GROUP_GRADE_MAX = 11;
/** `MAX_SUGGESTIONS` of the site's add-member search. */
export const MAX_MEMBER_SUGGESTIONS = 8;
/** `red30 >= 5` paints the number red (06 §4.2 "UI thresholds"). */
export const RED_ALERT_THRESHOLD = 5;
/** `StudentProfile.aiNote`: one line, cut by the server at this length. */
export const AI_NOTE_MAX_LENGTH = LIMITS.aiNoteMaxLength;

// ───────────────────────────── groups list ─────────────────────────────

/** The name as the server will store it; empty = the form may not be sent. */
export function normalizeGroupName(raw: string): string {
  return normalizeSingleLineText(raw).slice(0, GROUP_NAME_MAX_LENGTH);
}

/**
 * The "Класс" field: empty = no grade; otherwise a whole number 1..11. The site's `<input type="number"
 * min=1 max=11>` refuses anything else before the form is sent, so the app refuses it too instead of
 * relying on the server's silent `null`.
 */
export function parseGradeInput(raw: string): { ok: true; grade: number | null } | { ok: false } {
  const text = raw.trim();
  if (text === "") return { ok: true, grade: null };
  if (!/^\d{1,2}$/.test(text)) return { ok: false };
  const grade = Number(text);
  return grade >= GROUP_GRADE_MIN && grade <= GROUP_GRADE_MAX ? { ok: true, grade } : { ok: false };
}

/**
 * What a group row says to a screen reader after the name: «8 класс · 4 ученика» — the grade part only
 * when it is set. The eye reads the number of members alone, on the right of the row. `students` is the
 * counted word form («4 ученика»), which the caller declines for its locale.
 */
export function groupRowCaption(group: Pick<GroupListItem, "grade">, students: string, t: GroupsDict["list"]): string {
  return group.grade ? `${format(t.grade, { n: group.grade })} · ${students}` : students;
}

// ───────────────────────────── members ─────────────────────────────

/**
 * Students offered by the add-member search: the viewer's students that are not in this group, whose
 * name contains the query (case-insensitive, by name only), first 8. Nothing is offered before the first
 * letter: the site opens its suggestions only for a non-empty query (06 §1.2 item 4).
 */
export function suggestCandidates(
  allStudents: readonly GroupCandidate[],
  groupId: string,
  query: string,
  limit: number = MAX_MEMBER_SUGGESTIONS,
): GroupCandidate[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") return [];
  return allStudents
    .filter((student) => student.groupId !== groupId && student.name.toLowerCase().includes(needle))
    .slice(0, limit);
}

/** The student is in a different group and will be moved here. */
export function isInOtherGroup(candidate: GroupCandidate, groupId: string): boolean {
  return candidate.groupId !== null && candidate.groupId !== groupId;
}

/** What the AI-profile request carries for the note field: trimmed, empty = not set. */
export function aiNoteForRequest(raw: string): string | null {
  const note = normalizeSingleLineText(raw).slice(0, AI_NOTE_MAX_LENGTH);
  return note === "" ? null : note;
}

// ───────────────────────────── statistics ─────────────────────────────

/** Attention chips of a member, in the server's order (06 §4.2). */
export function attentionLabels(flags: readonly AttentionFlag[], t: Dictionary["planner"]["groupStatistics"]): string[] {
  return flags.map((flag) => {
    switch (flag.code) {
      case "overdue_homework":
        return flag.count === 1 ? t.overdueOne : format(t.overdueMany, { n: flag.count });
      case "not_started":
        return t.notStarted;
      case "idle":
        return format(t.idle, { n: flag.days });
      case "red_month":
        return format(t.redMonth, { n: flag.count });
    }
  });
}

/** «сегодня» / «вчера» / a date / «ещё не начинал», plus «· ДЗ в работе: N». */
export function activityLabel(
  row: Pick<GroupMemberRow, "lastActivityAt" | "idleDays" | "activeHomeworks">,
  t: GroupsDict["statistics"],
  locale: Locale,
): string {
  const when = !row.lastActivityAt
    ? t.notStarted
    : row.idleDays === 0
      ? t.today
      : row.idleDays === 1
        ? t.yesterday
        : formatShortDate(row.lastActivityAt, locale);
  return row.activeHomeworks > 0 ? `${when} · ${format(t.activeHomework, { n: row.activeHomeworks })}` : when;
}

/** A figure above the ranking: the number, its one-word label and what a screen reader says instead. */
export type GroupFigure = { key: "closed7" | "closed30" | "red30" | "attention"; value: number; label: string; spoken: string; alert: boolean };

/**
 * The figures above the ranking (06 §1.2 item 5; docs/design/glass-over-paper.md §1a): what the group
 * closed in 7 and in 30 days, its red numbers of the month and how many members need attention — each a
 * number with one word. The site's «самый активный» / «меньше всех активности» boxes are the first and
 * the last row of the ranking under the figures; its note lines (overdue homework) are spoken, and every
 * member that needs attention carries the reason in its own row.
 */
export function groupFigures(
  stats: GroupStatisticsResponse,
  t: GroupsDict["statistics"],
  attention: { label: string; aria: string },
): GroupFigure[] {
  const { totals } = stats;
  const needs = format(attention.aria, { n: totals.attentionCount, total: stats.members.length });
  return [
    { key: "closed7", value: totals.closed7, label: t.for7, spoken: `${t.closedByGroup}: ${format(t.closedFor7, { n: totals.closed7 })}`, alert: false },
    { key: "closed30", value: totals.closed30, label: t.for30, spoken: `${t.closedByGroup}: ${totals.closed30} ${t.for30}`, alert: false },
    { key: "red30", value: totals.red30, label: t.red, spoken: `${totals.red30} ${t.red}`, alert: false },
    {
      key: "attention",
      value: totals.attentionCount,
      label: attention.label,
      spoken: totals.overdueHomeworks > 0 ? `${needs}, ${format(t.overdueHomework, { n: totals.overdueHomeworks })}` : needs,
      alert: totals.attentionCount > 0,
    },
  ];
}

// ───────────────────────────── dates ─────────────────────────────

/**
 * A moment as a row or an option shows it: «25 нояб., 17:00» within the current Moscow year — the year
 * is noise there — and the full «25.11.2025, 17:00» for any other year.
 */
export function shortDateTime(value: string, now: DateInput, locale: Locale): string {
  if (mskParts(value).year !== mskParts(now).year) return formatDateTime(value, locale);
  const day = formatMsk(value, "dayMonthShort", locale);
  return day ? `${day}, ${formatClockTime(value, locale)}` : formatDateTime(value, locale);
}

// ───────────────────────────── attendance ─────────────────────────────

export type AttendanceCell = { participantId: string; attendance: AttendanceStatus };

/**
 * «5/6» — the row total of the table, without the percent (the tiles of the row already show it).
 * `doneOf` is the app's «{done}/{total}» template.
 */
export function attendanceRatioText(summary: AttendanceSummary, doneOf: string): string {
  return summary.counted === 0 ? "—" : format(doneOf, { done: summary.attended, total: summary.counted });
}

/** The cell of every student that took part in the lesson, by student id. */
export function lessonCells(lesson: Pick<GroupAttendanceLesson, "participants">): Map<string, AttendanceCell> {
  return new Map(
    lesson.participants.map((participant) => [
      participant.studentId,
      { participantId: participant.participantId, attendance: participant.attendance },
    ]),
  );
}

/** Row total of a member over the lessons where the member was a participant. */
export function memberAttendanceSummary(memberId: string, lessons: readonly GroupAttendanceLesson[]): AttendanceSummary {
  const values: AttendanceStatus[] = [];
  for (const lesson of lessons) {
    const participant = lesson.participants.find((row) => row.studentId === memberId);
    if (participant) values.push(participant.attendance);
  }
  return summarizeAttendance(values);
}

/** «5 / 6 · 83%», «2 / 2» when everything was excused, «—» when nothing is marked. */
export function attendanceTotalText(summary: AttendanceSummary): string {
  if (summary.counted === 0) return "—";
  return `${summary.attended} / ${summary.counted}${summary.percent !== null ? ` · ${summary.percent}%` : ""}`;
}

/** The response with one participant's mark replaced — the optimistic value shown while the request runs. */
export function applyAttendanceMark(
  response: GroupAttendanceResponse,
  participantId: string,
  attendance: AttendanceStatus,
): GroupAttendanceResponse {
  return {
    ...response,
    lessons: response.lessons.map((lesson) =>
      lesson.participants.some((participant) => participant.participantId === participantId)
        ? {
            ...lesson,
            participants: lesson.participants.map((participant) =>
              participant.participantId === participantId ? { ...participant, attendance } : participant,
            ),
          }
        : lesson,
    ),
  };
}

/**
 * The table as the teacher must see it while marks are in flight (participant id → the mark sent): a
 * read that left the server before a mark was written (the live poll, a realtime refresh) does not switch
 * the optimistic mark back until that mark's own request has settled.
 */
export function applyPendingMarks(
  response: GroupAttendanceResponse,
  pending: Readonly<Record<string, AttendanceStatus>>,
): GroupAttendanceResponse {
  let next = response;
  for (const [participantId, attendance] of Object.entries(pending)) {
    const shown = next.lessons.some((lesson) =>
      lesson.participants.some((participant) => participant.participantId === participantId && participant.attendance !== attendance),
    );
    if (shown) next = applyAttendanceMark(next, participantId, attendance);
  }
  return next;
}

/** A lesson of the group is running now: the table is refreshed on a timer while this is true. */
export function hasActiveLesson(response: Pick<GroupAttendanceResponse, "lessons"> | undefined): boolean {
  return Boolean(response?.lessons.some((lesson) => lesson.status === "ACTIVE"));
}

/** The lesson the per-lesson view opens on: the running one, else the latest. */
export function defaultAttendanceLessonId(lessons: readonly Pick<GroupAttendanceLesson, "id" | "status">[]): string | null {
  const active = lessons.find((lesson) => lesson.status === "ACTIVE");
  return active?.id ?? lessons[lessons.length - 1]?.id ?? null;
}
