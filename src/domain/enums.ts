// The site's Prisma enums as plain string unions (values verbatim from `prisma/schema.prisma`).
//
// Each enum is exported twice under one name, exactly like `@prisma/client` does: a frozen value object
// (`HomeworkNumberStatus.GREEN`) and the union type (`"GREEN" | "YELLOW" | "RED"`). That keeps the ported
// site code unchanged apart from its import line. The unions are structurally identical to the ones in
// `src/api/types` (which this folder must not import), so values flow between the two freely.

/* eslint-disable @typescript-eslint/no-redeclare -- a value object and its union type share one name on purpose, as in @prisma/client */

type ValueOf<T> = T[keyof T];

export const UserRole = { TEACHER: "TEACHER", STUDENT: "STUDENT", DEVELOPER: "DEVELOPER" } as const;
export type UserRole = ValueOf<typeof UserRole>;

export const HomeworkNumberStatus = { GREEN: "GREEN", YELLOW: "YELLOW", RED: "RED" } as const;
/** Traffic light of one problem for one student; `null` = not marked, "solved" = GREEN | YELLOW. */
export type HomeworkNumberStatus = ValueOf<typeof HomeworkNumberStatus>;

export const Subject = { MATH: "MATH", INFORMATICS: "INFORMATICS" } as const;
export type Subject = ValueOf<typeof Subject>;

export const LessonStatus = { PLANNED: "PLANNED", ACTIVE: "ACTIVE", FINISHED: "FINISHED" } as const;
/** STORED `Lesson.status`. What screens show is `deriveLessonStatus(lesson, now)`. */
export type LessonStatus = ValueOf<typeof LessonStatus>;

export const AttendanceStatus = {
  UNKNOWN: "UNKNOWN",
  PRESENT: "PRESENT",
  LATE: "LATE",
  ABSENT: "ABSENT",
  EXCUSED: "EXCUSED"
} as const;
export type AttendanceStatus = ValueOf<typeof AttendanceStatus>;

export const LessonKind = { LESSON: "LESSON", HOMEWORK: "HOMEWORK" } as const;
export type LessonKind = ValueOf<typeof LessonKind>;

export const AssignmentReason = { NEW: "NEW", REVIEW: "REVIEW", GAP: "GAP", DIAGNOSTIC: "DIAGNOSTIC" } as const;
export type AssignmentReason = ValueOf<typeof AssignmentReason>;

export const LessonItemResult = {
  SOLVED: "SOLVED",
  PARTIAL: "PARTIAL",
  NOT_SOLVED: "NOT_SOLVED",
  SKIPPED: "SKIPPED"
} as const;
/** SOLVED → GREEN, PARTIAL → YELLOW, NOT_SOLVED → RED, SKIPPED → the number status is not changed. */
export type LessonItemResult = ValueOf<typeof LessonItemResult>;

export const ParentCallOutcome = { REACHED: "REACHED", NO_ANSWER: "NO_ANSWER" } as const;
export type ParentCallOutcome = ValueOf<typeof ParentCallOutcome>;

export const SolutionCheckStatus = {
  PENDING: "PENDING",
  CHECKING: "CHECKING",
  DONE: "DONE",
  FAILED: "FAILED"
} as const;
export type SolutionCheckStatus = ValueOf<typeof SolutionCheckStatus>;

export const SolutionVerdict = { CORRECT: "CORRECT", INCORRECT: "INCORRECT", UNCERTAIN: "UNCERTAIN" } as const;
export type SolutionVerdict = ValueOf<typeof SolutionVerdict>;

export const AuditCategory = { AI: "AI", DATA: "DATA", AUTH: "AUTH" } as const;
export type AuditCategory = ValueOf<typeof AuditCategory>;
