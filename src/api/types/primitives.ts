/**
 * Canonical primitives, enums and string-coded dictionaries.
 * Source: docs/spec/00-unified-contract.md §1.1 (as completed by 90-addendum-4 §2 "Block S").
 *
 * Every enum is a string union derived from a frozen value list, so validators (mock backend, forms)
 * can check membership at runtime without re-declaring the values.
 */

// ───────────────────────────── primitives ─────────────────────────────

/** Instant. Exactly `Date#toISOString()`: UTC, milliseconds, "Z" — "2026-11-16T15:00:00.000Z". `null` = not set, never "". */
export type IsoDateTime = string;

/** Moscow calendar day "YYYY-MM-DD" (streak / timeline buckets, "today"). */
export type DateKey = string;

/**
 * Value of a date-time picker: wall clock "YYYY-MM-DDTHH:mm", "" = empty. UI state only, NEVER on the wire.
 *
 * The wall clock is MOSCOW time on every device (docs/spec/09-data-i18n-math.md §6.2 rule 5 — it settles
 * the "device-local" wording of 00 §1.1, which describes the site's browser input). Convert with
 * `parseMskDateTimeInput(value)?.toISOString()` and back with `toMskDateTimeInput(iso)` from
 * `@/domain/moscow-time`; never with `new Date(value)`, which reads the device zone.
 */
export type DateTimeInputValue = string;

export const LOCALES = ["ru", "en"] as const;
/** Interface language. Default "ru". */
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "ru";

// ───────────────────────────── Prisma enums (verbatim values) ─────────────────────────────

export const USER_ROLES = ["TEACHER", "STUDENT", "DEVELOPER"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const HOMEWORK_NUMBER_STATUSES = ["GREEN", "YELLOW", "RED"] as const;
/** Traffic light of one problem for one student. `null` = not marked; "solved" = GREEN | YELLOW. */
export type HomeworkNumberStatus = (typeof HOMEWORK_NUMBER_STATUSES)[number];

export const SUBJECTS = ["MATH", "INFORMATICS"] as const;
export type Subject = (typeof SUBJECTS)[number];

export const LESSON_KINDS = ["LESSON", "HOMEWORK"] as const;
/** A `Lesson` row is a lesson OR a homework draft. */
export type LessonKind = (typeof LESSON_KINDS)[number];

export const LESSON_STATUSES = ["PLANNED", "ACTIVE", "FINISHED"] as const;
/**
 * STORED column `Lesson.status`. Never "ACTIVE" in app-written data.
 * On the wire it appears only in `GET /developer/statistics/teachers` (`TeacherLessonEntry.status`).
 */
export type LessonStatus = (typeof LESSON_STATUSES)[number];

/**
 * COMPUTED by `deriveLessonStatus(lesson, now)` at response time.
 * Every lesson `status` on the wire is this type, except the one stored status noted on {@link LessonStatus}.
 */
export type DerivedLessonStatus = "PLANNED" | "ACTIVE" | "FINISHED";

/** Lessons listed in the attendance table: PLANNED ones are filtered out before the mapping. */
export type AttendanceLessonStatus = Exclude<DerivedLessonStatus, "PLANNED">;

export const ATTENDANCE_STATUSES = ["UNKNOWN", "PRESENT", "LATE", "ABSENT", "EXCUSED"] as const;
/** Group-lesson attendance mark; "UNKNOWN" = not marked. (The site's `AttendanceValue` alias is not used on mobile.) */
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const ASSIGNMENT_REASONS = ["NEW", "REVIEW", "GAP", "DIAGNOSTIC"] as const;
/** Why the planner put a number into a set. */
export type AssignmentReason = (typeof ASSIGNMENT_REASONS)[number];

export const LESSON_ITEM_RESULTS = ["SOLVED", "PARTIAL", "NOT_SOLVED", "SKIPPED"] as const;
/** Lesson outcome of one number. Mirrors onto the number status: SOLVED → GREEN, PARTIAL → YELLOW, NOT_SOLVED → RED, SKIPPED → no change. */
export type LessonItemResult = (typeof LESSON_ITEM_RESULTS)[number];

export const PARENT_CALL_OUTCOMES = ["REACHED", "NO_ANSWER"] as const;
export type ParentCallOutcome = (typeof PARENT_CALL_OUTCOMES)[number];

export const SOLUTION_CHECK_STATUSES = ["PENDING", "CHECKING", "DONE", "FAILED"] as const;
/** Lifecycle of an AI check (homework check or lesson-item submission). */
export type SolutionCheckStatus = (typeof SOLUTION_CHECK_STATUSES)[number];

export const SOLUTION_VERDICTS = ["CORRECT", "INCORRECT", "UNCERTAIN"] as const;
/** AI verdict for one number: CORRECT → GREEN, INCORRECT → RED, UNCERTAIN → untouched (flagged for the teacher). */
export type SolutionVerdict = (typeof SOLUTION_VERDICTS)[number];

export const AUDIT_CATEGORIES = ["AI", "DATA", "AUTH"] as const;
export type AuditCategory = (typeof AUDIT_CATEGORIES)[number];

// ───────────────────────────── string-coded dictionaries ─────────────────────────────

export const ERROR_KINDS = [
  "METHOD", "FORMULA", "DOMAIN", "LOST_ROOT", "ALGEBRA", "BRACKETS", "SIGN", "ARITHMETIC",
  "TRANSCRIPTION", "INCOMPLETE", "UNREADABLE", "NOT_FOUND", "NONE",
] as const;
/**
 * AI-check diagnostics for the planner. TEACHER / DEVELOPER only — never sent to or shown to a student.
 * conceptual: METHOD FORMULA DOMAIN LOST_ROOT · technical: ALGEBRA BRACKETS SIGN ARITHMETIC TRANSCRIPTION ·
 * incomplete: INCOMPLETE · none: UNREADABLE NOT_FOUND NONE.
 */
export type ErrorKind = (typeof ERROR_KINDS)[number];

export const PLAN_ERROR_CODES = [
  "unavailable", "studentMissing", "noCandidates", "homeworkNoCandidates",
  "homeworkParams", "emptyPlan", "failed", "budgetExhausted", "queueFull",
] as const;
/** Machine code of a failed plan generation; stored as `"plan-error:" + code` in `LessonParticipant.planError`. */
export type PlanErrorCode = (typeof PLAN_ERROR_CODES)[number];

/** Prefix of a coded `LessonParticipant.planError` value. */
export const PLAN_ERROR_PREFIX = "plan-error:";

/**
 * Raw `LessonParticipant.planError`: `"plan-error:<PlanErrorCode>"`, a frozen legacy Russian sentence, or null.
 * Shown only through the ported `planErrorText(raw, dict.planner.planErrors)`.
 */
export type PlanErrorRaw = string | null;

export const CHECK_ERROR_CODES = [
  "interrupted", "disabled", "timeout", "quota", "unavailable", "queue", "image", "unknown",
] as const;
/**
 * Class of a FAILED AI check as sent to a student. Non-null iff `status === "FAILED"`.
 * A FIELD VALUE of a successful response, not an error-envelope code. "unknown" ↔ dictionary key `fallback`.
 */
export type CheckErrorCode = (typeof CHECK_ERROR_CODES)[number];

export const CREATE_PLAN_OUTCOMES = ["queued", "skipped", "unavailable", "budgetExhausted", "queueFull"] as const;
/** What happened to AI plan generation when a lesson / draft was created (the create call is a 201 for every outcome). */
export type CreatePlanOutcome = (typeof CREATE_PLAN_OUTCOMES)[number];

export const PROGRESS_SOURCES = ["teacher", "homework_check", "lesson_teacher", "lesson_check", "lesson_end"] as const;
/** Who / what requested a progress change (stored strings — spelling is data, not an error code). */
export type ProgressSource = (typeof PROGRESS_SOURCES)[number];

export const PROGRESS_DECISION_REASONS = [
  "changed", "reaffirmed", "unchanged", "uncertain",
  "downgrade_blocked", "newer_status", "no_status", "lesson_result_preserved",
] as const;
/** Outcome of the progress policy for one requested change (stored strings). */
export type ProgressDecisionReason = (typeof PROGRESS_DECISION_REASONS)[number];

export const NOTIFICATION_TYPES = [
  "homework-assigned", "homework-checked", "parent_call_due",
  "dev_errors", "dev_ai_budget_warn", "dev_ai_budget_out", "dev_stale_checks", "dev_storage",
  "broadcast",
] as const;
/** Known notification types (stored strings). A wire item may carry an unknown type — see `NotificationItem.type`. */
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const PARENT_CALL_REMINDER_STATES = ["ok", "due", "overdue"] as const;
/** 30 Moscow calendar days since the anchor → "due", 45 → "overdue". */
export type ParentCallReminderState = (typeof PARENT_CALL_REMINDER_STATES)[number];

export const REPORT_PERIODS = ["7d", "30d", "year"] as const;
/** Period of attendance / PDF reports ("year" = school year). */
export type ReportPeriod = (typeof REPORT_PERIODS)[number];

export const TIMELINE_PERIODS = ["7d", "4w", "8w"] as const;
export type TimelinePeriod = (typeof TIMELINE_PERIODS)[number];

export const REASONING_EFFORTS = ["low", "medium", "high"] as const;
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

export const PASSWORD_PROBLEMS = ["tooShort", "tooLong", "noLetter", "noDigit", "common"] as const;
/** `details.problem` of `400 passwordInvalid`. */
export type PasswordProblem = (typeof PASSWORD_PROBLEMS)[number];

export const STUDENT_STREAK_COLOR_TIERS = [
  "starter", "ember", "amber", "lime", "emerald", "cyan", "blue", "violet", "rose", "gold",
] as const;
export type StudentStreakColorTier = (typeof STUDENT_STREAK_COLOR_TIERS)[number];

// ───────────────────────────── device preferences ─────────────────────────────

export const THEME_MODES = ["system", "light", "dark"] as const;
/** The user's CHOICE of theme. */
export type ThemeMode = (typeof THEME_MODES)[number];

/** What is actually painted. */
export type ResolvedTheme = "light" | "dark";

export const HINTS_MODES = ["on", "off"] as const;
export type HintsMode = (typeof HINTS_MODES)[number];
