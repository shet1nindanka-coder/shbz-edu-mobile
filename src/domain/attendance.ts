// Ported 1:1 from the site (lib/attendance.ts) — only the imports differ. Re-port instead of hand-editing;
// anything the app changes on purpose is marked [MOBILE].
// Посещаемость групповых занятий: чистая логика над LessonParticipant.attendance.
// Отметки ставятся автоматически (вход во вкладку «Урок»/сдача → «был»,
// закрытие урока без активности → «не был») и правятся учителем вручную.

import { format, type Dictionary } from "@/lib/i18n";

export type AttendanceValue = "UNKNOWN" | "PRESENT" | "LATE" | "ABSENT" | "EXCUSED";

// Подписи отметок на экране — dict.planner.attendance.labels; ATTENDANCE_META — русский эталон для PDF.
export const ATTENDANCE_META: Record<AttendanceValue, { label: string; short: string }> = {
  UNKNOWN: { label: "не отмечено", short: "—" },
  PRESENT: { label: "был", short: "был" },
  LATE: { label: "опоздал", short: "опозд." },
  ABSENT: { label: "не был", short: "нет" },
  EXCUSED: { label: "по уважительной", short: "уваж." }
};

/** Порядок переключения по клику в таблице: был → опоздал → не был → уважительная → был. */
export function nextAttendance(current: AttendanceValue): AttendanceValue {
  switch (current) {
    case "PRESENT":
      return "LATE";
    case "LATE":
      return "ABSENT";
    case "ABSENT":
      return "EXCUSED";
    default:
      return "PRESENT";
  }
}

export type AttendanceSummary = {
  /** Занятий с известной отметкой. */
  counted: number;
  attended: number; // был + опоздал
  late: number;
  absent: number;
  excused: number;
  /** Доля посещённых среди занятий без уважительной причины; null — считать не из чего. */
  percent: number | null;
};

export function summarizeAttendance(values: AttendanceValue[]): AttendanceSummary {
  let attended = 0;
  let late = 0;
  let absent = 0;
  let excused = 0;

  for (const value of values) {
    if (value === "PRESENT") attended += 1;
    else if (value === "LATE") {
      attended += 1;
      late += 1;
    } else if (value === "ABSENT") absent += 1;
    else if (value === "EXCUSED") excused += 1;
  }

  const counted = attended + absent + excused;
  // Уважительная причина процент не портит: делим на занятия, где ученик мог быть.
  const base = counted - excused;

  return {
    counted,
    attended,
    late,
    absent,
    excused,
    percent: base > 0 ? Math.round((attended / base) * 100) : null
  };
}

/** Итог по окончании урока для неотмеченного участника: была активность — «был», нет — «не был». */
export function decideEndOfLessonAttendance(input: { current: AttendanceValue; hadActivity: boolean }): AttendanceValue | null {
  if (input.current !== "UNKNOWN") {
    return null;
  }

  return input.hadActivity ? "PRESENT" : "ABSENT";
}

/** `t` — dict.planner.attendance нужного языка (PDF передаёт русский). */
export function formatAttendanceSummary(summary: AttendanceSummary, t: Dictionary["planner"]["attendance"]) {
  if (summary.counted === 0) {
    return t.noLessons;
  }

  const parts = [format(t.attendedOf, { attended: summary.attended, counted: summary.counted })];

  if (summary.late > 0) parts.push(format(t.late, { n: summary.late }));
  if (summary.excused > 0) parts.push(format(t.excused, { n: summary.excused }));
  if (summary.percent !== null) parts.push(`${summary.percent}%`);

  return parts.join(" · ");
}
