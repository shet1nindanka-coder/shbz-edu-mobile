/**
 * Limits and constants as typed consts — one table for client-side validation and the mock validators.
 * Sources: docs/spec/00-unified-contract.md §1.3 (`MetaResponse.limits`), §2 ("Limit" columns), §2.3, §2.14;
 * docs/spec/09-data-i18n-math.md §1.7; 90-addendum-3 (AI budgets).
 *
 * Runtime switches (`aiCheckAvailable`, `lessonCheckAvailable`, `aiAvailable`, `idleWarnMinutes`,
 * `idleAlertMinutes`, `limits.maxPhotosPerAssignment`) are NOT constants: they arrive inside the payload of
 * the screen that needs them.
 */
import type { SiteSettings } from "./entities";
import type { MetaResponse } from "./shared";

// ───────────────────────────── MetaResponse.limits (compile-time constants) ─────────────────────────────

/** Exactly what `GET /meta` returns in `limits`. */
export const META_LIMITS: MetaResponse["limits"] = {
  uploadMaxBytes: 15728640,
  allowedUploadExtensions: [".pdf", ".docx", ".png", ".jpg", ".jpeg"],
  photoExtensions: [".png", ".jpg", ".jpeg"],
  lessonSubmissionMaxPhotos: 3,
  parentCallDueDays: 30,
  parentCallOverdueDays: 45,
  lessonDurationMinutes: { min: 15, max: 240, default: 60 },
  homeworkDailyMinutes: { min: 15, max: 240, default: 60 },
  speed: { min: 1, max: 10 },
  maxStudentsPerLesson: 30,
  maxItemsPerPart: 40,
  maxTitleLength: 200,
  maxTeacherNoteLength: 500,
};

export const SERVER_TIME_ZONE = "Europe/Moscow" as const;

// ───────────────────────────── 09 §1.7 — limits and constants ─────────────────────────────

export const LIMITS = {
  /** `MAX_USER_NAME_LENGTH` */
  userNameMaxLength: 120,
  /** `MAX_LOGIN_LENGTH` */
  loginMaxLength: 254,
  /** 8..256 chars, ≥ 1 letter, ≥ 1 digit, not a common password (`PasswordProblem`). */
  password: { minLength: 8, maxLength: 256 },

  /** 15 MiB per file; a student photo request: total ≤ 15 MiB, body ≤ 15 MiB + 512 KiB. */
  uploadMaxBytes: 15 * 1024 * 1024,
  uploadRequestBodyMaxBytes: 15 * 1024 * 1024 + 512 * 1024,
  /** 1..255 chars, no control chars (`params.max` of `uploadBadName`). */
  uploadFileNameMaxLength: 255,
  allowedUploadExtensions: [".pdf", ".docx", ".png", ".jpg", ".jpeg"],
  /** Student solution photos. */
  photoExtensions: [".png", ".jpg", ".jpeg"],
  allowedUploadMimeTypes: [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/octet-stream",
    "image/png",
    "image/jpeg",
  ],
  photoMimeTypes: ["image/png", "image/jpeg"],
  /** Import JSON text (`413 fileTooBig`). */
  importTextMaxBytes: 2 * 1024 * 1024,

  /** `SiteSettings.maxPhotosPerAssignment`: default 10, allowed 1..30 (the live value comes with the screen payload). */
  maxPhotosPerAssignment: { default: 10, min: 1, max: 30 },
  /** `LESSON_SUBMISSION_MAX_PHOTOS` */
  lessonSubmissionMaxPhotos: 3,
  /** Thumbnail: width 320 px, WebP quality 72. */
  thumbnail: { widthPx: 320, webpQuality: 72 },

  /** Student note on a number; the server trims and cuts. */
  noteMaxLength: 240,
  /** `MAX_NUMBERS` of `parseNumbersInput`. */
  maxNumbersPerInput: 2000,
  /** Number search input: `^\d{1,20}$`, normalised value ≠ "0". */
  numberSearchMaxDigits: 20,

  lessonDurationMinutes: { min: 15, max: 240, default: 60 },
  /** Homework draft: daily minutes; days to the deadline are clamped to 1..60. */
  homeworkDailyMinutes: { min: 15, max: 240, default: 60 },
  homeworkDaysToDeadline: { min: 1, max: 60 },
  /** `MIN_SPEED..MAX_SPEED` */
  speed: { min: 1, max: 10 },
  /** `MAX_GROUP_SIZE`: students in one lesson / homework draft. */
  maxStudentsPerLesson: 30,
  /** `MAX_PLAN_ITEMS`: items per part (main / extra) of one participant's set. */
  maxItemsPerPart: 40,
  /** `MAX_TITLE_LENGTH` — lesson / draft title. */
  maxTitleLength: 200,
  /** `MAX_TEACHER_NOTE_LENGTH` */
  maxTeacherNoteLength: 500,
  /** AI item comment / plan summary. */
  aiItemCommentMaxLength: 200,
  aiPlanSummaryMaxLength: 400,
  /** `StudentProfile.aiNote` */
  aiNoteMaxLength: 300,
  /** Changes in one `setNumberStatuses` call. */
  numberStatusesBatch: { min: 1, max: 100 },

  /** Calendar days (Moscow) since the anchor. */
  parentCallDueDays: 30,
  parentCallOverdueDays: 45,
  /** `PARENT_CALL_HISTORY_LIMIT`: entries inside the overview. */
  parentCallHistoryShown: 20,
  /** Default `limit` of the full history endpoint. */
  parentCallHistoryPageSize: 100,
  parentCallCommentMaxLength: 4000,

  progressHistoryPageSize: 20,
  notificationsReturned: 20,
  journalPageSize: 50,
  journalDays: { min: 0, max: 365, default: 7 },
  /** Homework checks shown in review (newest per assignment); retention keeps 50 completed per student. */
  homeworkChecksInReview: 15,
  completedChecksKeptDefault: 50,
  broadcast: { titleMinLength: 1, titleMaxLength: 120, bodyMaxLength: 300 },

  /** Streak / timeline window, days. */
  streakWindowDays: 112,
  /** "Deadline soon" window (`SOON_WINDOW_MS`). */
  deadlineSoonMs: 72 * 60 * 60 * 1000,
  /** A participant pending longer than this is "stale" — "plan lost, retry" (`STALE_PLAN_MS`). */
  stalePlanMs: 15 * 60 * 1000,
  /** Lazy finalisation window of a live lesson after its end. */
  lessonFinalizeWindowMs: 48 * 60 * 60 * 1000,
  /** `SESSION_TTL_DAYS`, absolute. */
  sessionTtlDays: 30,
} as const;

// ───────────────────────────── polling and realtime (00 §2.3) ─────────────────────────────

export const POLLING = {
  /** Student homework check and live-lesson state: first poll 4 s after a start, next delay `baseMs · min(2^failures, maxBackoffFactor)`, stop after `maxConsecutiveFailures`. */
  studentCheck: { baseMs: 4000, maxBackoffFactor: 8, maxConsecutiveFailures: 5 },
  /** AI plan status on the lesson / draft boards. */
  planStatusBoardMs: 2000,
  /** AI plan status on the student card ("Lessons" tab). */
  planStatusStudentCardMs: 2500,
  /** Fallback poll of the teacher live board (`…/live` signature). */
  lessonLiveMs: 15000,
  /** Debounce of a refetch triggered by a realtime event. */
  realtimeRefetchDebounceMs: 1500,
} as const;

export const REALTIME = {
  /** Comment `: ping` interval of the SSE stream. */
  pingIntervalMs: 25000,
  /** Open streams per user (the third → `429 tooManyConnections`, `retryAfterSeconds: 5`). */
  maxConnectionsPerUser: 2,
  /** Backoff after a refused handshake, seconds. */
  reconnectBackoffSeconds: [5, 10, 20, 40, 60],
} as const;

/** Row of `calls.list` is scrolled into view and flashed for this long (`HIGHLIGHT_FLASH_MS`). */
export const HIGHLIGHT_FLASH_MS = 1500;

// ───────────────────────────── AI budgets and queues (00 §2.14, 90-addendum-3) ─────────────────────────────

/** Fixed 24-hour window aligned to 00:00 UTC (03:00 Moscow) — not a rolling window. */
export const AI_BUDGET_WINDOW_MS = 86_400_000;

/** The three school-wide daily AI budgets: limiter scope → the setting that holds its limit. */
export const AI_BUDGETS = {
  "api:homework-checks:global": "aiDailyLimit",
  "api:lesson-checks:global": "lessonCheckDailyLimit",
  "api:ai-plans:global": "aiPlanDailyLimit",
} as const satisfies Record<string, keyof SiteSettings>;

export const AI_QUEUES = {
  /** Waiting checks (homework + lesson) → `503 queueFull`, `retryAfterSeconds: 120`. */
  checkQueueMax: 60,
  checkQueueRetryAfterSeconds: 120,
  /** Waiting plan generations → create: `plan: "queueFull"`; regenerate: `503 queueFull`. */
  planQueueMax: 150,
} as const;

/** `retryAfterSeconds` the server sends with fixed-wait errors. */
export const RETRY_AFTER_SECONDS = {
  serviceUnavailable: 5,
  tooManyConnections: 5,
  checkQueueFull: 120,
  reportsBusy: 30,
} as const;

/** PDF exports in flight, process-wide (`503 reportsBusy`). */
export const PDF_EXPORTS_IN_FLIGHT_MAX = 2;

// ───────────────────────────── per-user rate limits (the "Limit" columns of 00 §2) ─────────────────────────────

export type RateLimitRule = {
  /** A fixed number, or the `SiteSettings` key that holds the limit. */
  limit: number | { setting: keyof SiteSettings; default: number };
  windowSeconds: number;
  /** "sliding" = timestamps of accepted attempts; "fixed" = window aligned to the epoch. */
  window: "fixed" | "sliding";
  /** What the bucket is keyed by. */
  per: "user" | "address" | "address+login" | "login";
  /** `ApiClient` methods ("member.method") that consume this bucket; "files" = `FileService`. */
  methods: readonly string[];
};

/**
 * Rate-limit buckets keyed by the site's limiter scope. Methods listed together share one bucket.
 * Exceeding a bucket → `429 rateLimited` with `retryAfterSeconds`; never auto-retry a mutation.
 * Methods that are absent have no rate limit on the site.
 */
export const RATE_LIMITS = {
  // 25 / 10 min per client address and 8 / 10 min per address + login (sliding); 20 / 15 min per login (fixed);
  // all checked before the credentials.
  "login:ip": { limit: 25, windowSeconds: 600, window: "sliding", per: "address", methods: ["shell.login"] },
  "login:ip-login": { limit: 8, windowSeconds: 600, window: "sliding", per: "address+login", methods: ["shell.login"] },
  "login:login": { limit: 20, windowSeconds: 900, window: "fixed", per: "login", methods: ["shell.login"] },
  // Consumed after validation, before the current-password check.
  "profile:password-update": { limit: 5, windowSeconds: 900, window: "fixed", per: "user", methods: ["shell.changePassword"] },
  "api:notifications": { limit: 60, windowSeconds: 60, window: "fixed", per: "user", methods: ["shell.listNotifications", "shell.markNotificationsRead"] },
  "api:realtime-connect": { limit: 30, windowSeconds: 60, window: "fixed", per: "user", methods: ["shell.subscribeRealtime"] },
  "api:streak": { limit: 120, windowSeconds: 60, window: "fixed", per: "user", methods: ["shell.getStreak"] },
  // shell.findNumber: STUDENT 120 / 60 s, TEACHER and DEVELOPER 30 / 60 s.
  "api:student-find-number": { limit: 120, windowSeconds: 60, window: "fixed", per: "user", methods: ["shell.findNumber"] },
  "api:find-number": { limit: 30, windowSeconds: 60, window: "fixed", per: "user", methods: ["shell.findNumber"] },
  "api:file-read": { limit: 120, windowSeconds: 60, window: "fixed", per: "user", methods: ["files"] },
  "api:teacher-uploads": { limit: 60, windowSeconds: 600, window: "fixed", per: "user", methods: ["content.uploadFile"] },

  "api:student-status": { limit: 90, windowSeconds: 60, window: "fixed", per: "user", methods: ["studentStudy.saveNumberNote"] },

  "api:homework-submissions": { limit: 60, windowSeconds: 60, window: "fixed", per: "user", methods: ["studentWork.uploadHomeworkPhotos", "studentWork.deleteHomeworkPhoto"] },
  // Plus the school-wide budget "api:homework-checks:global".
  "api:homework-checks": { limit: { setting: "aiPerStudentHourlyLimit", default: 10 }, windowSeconds: 3600, window: "fixed", per: "user", methods: ["studentWork.startHomeworkCheck"] },
  "api:homework-check-status": { limit: 120, windowSeconds: 60, window: "fixed", per: "user", methods: ["studentWork.getLatestHomeworkCheck"] },
  "api:lesson-join": { limit: 30, windowSeconds: 60, window: "fixed", per: "user", methods: ["studentWork.joinLesson"] },
  // Plus the school-wide budget "api:lesson-checks:global".
  "api:lesson-checks": { limit: { setting: "lessonCheckPerStudentHourlyLimit", default: 30 }, windowSeconds: 3600, window: "fixed", per: "user", methods: ["studentWork.submitLessonItem"] },
  "api:lesson-check-status": { limit: 120, windowSeconds: 60, window: "fixed", per: "user", methods: ["studentWork.getLiveLessonState"] },

  "create-student": { limit: 20, windowSeconds: 600, window: "fixed", per: "user", methods: ["teacherStudents.createStudent"] },
  "reset-student-password": { limit: 20, windowSeconds: 600, window: "fixed", per: "user", methods: ["teacherStudents.resetStudentPassword"] },
  "api:teacher-homeworks": { limit: 120, windowSeconds: 60, window: "fixed", per: "user", methods: ["teacherStudents.issueHomework", "teacherStudents.cancelHomework"] },
  "api:teacher-number-status": { limit: 240, windowSeconds: 60, window: "fixed", per: "user", methods: ["teacherStudents.setNumberStatus", "teacherStudents.setNumberStatuses"] },
  "api:student-deadlines": { limit: 240, windowSeconds: 60, window: "fixed", per: "user", methods: ["teacherStudents.setNumberDeadlines"] },
  "api:progress-history": { limit: 90, windowSeconds: 60, window: "fixed", per: "user", methods: ["teacherStudents.getProgressHistory"] },
  // 5 / 5 min, shared by the student report and the group attendance PDF; at most 2 exports in flight.
  "api:pdf-export": { limit: 5, windowSeconds: 300, window: "fixed", per: "user", methods: ["teacherStudents.downloadStudentReport", "groups.downloadGroupAttendancePdf"] },

  "create-account": { limit: 20, windowSeconds: 600, window: "fixed", per: "user", methods: ["accounts.createAccount"] },
  "reset-teacher-password": { limit: 20, windowSeconds: 600, window: "fixed", per: "user", methods: ["accounts.resetTeacherPassword"] },

  // Plan generations additionally draw on the school-wide budget "api:ai-plans:global".
  "api:lesson-plan": { limit: 10, windowSeconds: 60, window: "fixed", per: "user", methods: ["planner.createLesson", "planner.regenerateParticipant"] },
  "api:lesson-live": { limit: 120, windowSeconds: 60, window: "fixed", per: "user", methods: ["planner.getLessonLive"] },
  "api:lesson-schedule": { limit: 30, windowSeconds: 60, window: "fixed", per: "user", methods: ["planner.scheduleLesson"] },
  "api:lesson-finish": { limit: 30, windowSeconds: 60, window: "fixed", per: "user", methods: ["planner.finishLesson"] },
  "api:lesson-delete": { limit: 30, windowSeconds: 60, window: "fixed", per: "user", methods: ["planner.deleteLesson"] },
  "api:lesson-items": { limit: 60, windowSeconds: 60, window: "fixed", per: "user", methods: ["planner.saveLessonItems"] },
  "api:lesson-item-result": { limit: 240, windowSeconds: 60, window: "fixed", per: "user", methods: ["planner.setItemResult"] },
  "lesson-pdf": { limit: 30, windowSeconds: 60, window: "fixed", per: "user", methods: ["planner.getHandoutUrl"] },
  // The site uses one scope with two limits: 10 / 60 s for create, 30 / 60 s for issue and delete.
  "api:homework-plan": { limit: 10, windowSeconds: 60, window: "fixed", per: "user", methods: ["planner.createHomeworkPlan"] },
  "api:homework-plan#issue-delete": { limit: 30, windowSeconds: 60, window: "fixed", per: "user", methods: ["planner.issueHomeworkPlan", "planner.deleteHomeworkPlan"] },

  "api:lesson-attendance": { limit: 240, windowSeconds: 60, window: "fixed", per: "user", methods: ["groups.setAttendance"] },
  "api:parent-calls": { limit: 60, windowSeconds: 60, window: "fixed", per: "user", methods: ["groups.recordParentCall"] },
  "api:statistics-drilldown": { limit: 120, windowSeconds: 60, window: "fixed", per: "user", methods: ["groups.getStatisticsDrilldown"] },

  "api:topic-conditions": { limit: 120, windowSeconds: 60, window: "fixed", per: "user", methods: ["content.getTopicConditions"] },
  "api:topics-create": { limit: 12, windowSeconds: 60, window: "fixed", per: "user", methods: ["content.createTopic"] },
  "api:topic-numbers-preview": { limit: 60, windowSeconds: 60, window: "fixed", per: "user", methods: ["content.previewNumbersChange"] },
  "api:topics-order": { limit: 30, windowSeconds: 60, window: "fixed", per: "user", methods: ["content.reorderTopics"] },
  "api:number-conditions": { limit: 60, windowSeconds: 60, window: "fixed", per: "user", methods: ["content.saveCondition", "content.deleteCondition"] },
  "api:number-answers": { limit: 60, windowSeconds: 60, window: "fixed", per: "user", methods: ["content.saveAnswer", "content.deleteAnswer"] },
  // Preview and apply each count.
  "api:topic-import": { limit: 10, windowSeconds: 60, window: "fixed", per: "user", methods: ["content.previewImport", "content.applyImport"] },
} as const satisfies Record<string, RateLimitRule>;

export type RateLimitScope = keyof typeof RATE_LIMITS;
