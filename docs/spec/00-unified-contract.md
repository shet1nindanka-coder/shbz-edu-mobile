# 00 — Unified contract: canonical types, mobile API, screens and navigation

One reference for the native mobile rewrite of "ШБЗ Школа" (Expo / React Native, TypeScript). It merges the
type and endpoint proposals of specs `01`–`09` and applies every CORRECTION of `90-addendum-1` … `90-addendum-6`.

**Precedence.** Where this file and another spec file disagree on a *name, shape, path, status code or error
code*, this file wins. For everything this file does not restate (business rules, texts, layouts, mock
fixtures, pure helpers to port) the owner spec named in each row stays authoritative, as corrected by the
addenda. Abbreviations: `A1`…`A6` = `90-addendum-1.md` … `90-addendum-6.md`.

**Status of the API.** The site has no mobile API and is not modified. Every path below is the *target*
contract under `/api/mobile/v1`; today it is implemented in-process by `MockApiClient`, later by
`HttpApiClient` against a server that is built separately (`A1` Part B classifies each operation by how much
server work it needs).

Contents: §0 conventions · §1 canonical types · §2 API contract · §3 screens and navigation ·
§4 resolved conflicts · §5 decisions still open for the product owner.

---

## 0. Conventions (apply to every endpoint)

| Topic | Rule | Source |
|---|---|---|
| Base path | `/api/mobile/v1`; all paths below are relative to it | `01` §6 |
| Auth | `Authorization: Bearer <sessionToken>` on every request except `GET /meta` and `POST /auth/login`. Opaque token returned by login; no cookies. Session TTL 30 days, absolute | `01` §6, §4.1 |
| Language | `Accept-Language: ru \| en` on every request (fallback `ru`). Decides the language of `error.message`, notification text, AI comments | `A1` A.1 |
| Bodies | JSON, except multipart uploads and binary downloads | — |
| Instants | `IsoDateTime` = `Date#toISOString()` (UTC, ms, `Z`). `null` = not set, never `""`. Request instants must parse to a finite date | `A4` §3.3 |
| Calendar days | `DateKey` = `"YYYY-MM-DD"`, Moscow calendar day. Server and mock run in `Europe/Moscow` | `09` §6 |
| Path parameters | `{camelCaseName}`, named after the site's dynamic segments: `{assignmentId}`, `{fileId}`, `{groupId}`, `{itemId}`, `{lessonId}`, `{number}`, `{participantId}`, `{planId}`, `{studentId}`, `{topicId}`; mobile-only: `{homeworkNumberId}`, `{photoId}`, `{teacherId}`, `{pushToken}`. A homework draft is `{planId}`, never `{lessonId}` | `A4` §3.11 |
| Error envelope | Every non-2xx body (including binary endpoints and the SSE handshake) is `ApiErrorBody` (§1.3) | `A1` A.2 |
| Error codes | lower camelCase = leaf key of the site dictionary entry that supplies the text | `A1` A.5 |
| 401 | Only "no valid session": always `sessionExpired` (single exception: `401 invalidCredentials` on login). The client signs out **iff** `code === "sessionExpired"` | `A1` A.1, A.3 |
| 403 | Valid session, action not allowed: `unauthorized` (wrong role), `developerRightsRequired` (developer-only endpoint), or an endpoint code (`statusReadOnly`, `passwordCurrent`). Never signs the user out; the client re-fetches `GET /me` | `A1` A.1, A.3 |
| 404 | Missing **or not owned** (never 403 for a foreign resource). Entity-specific code: `studentNotFound`, `topicNotFound`, `numberNotFound`, `homeworkNotFound`, `lessonNotFound`, `groupNotFound`, `draftNotFound`, `studentOrNumberNotFound`, `participantNotFound`, `itemNotFound`, `photoNotFound`, `historyNotFound`, `fileNotFound`, `teacherNotFound` | `A1` A.4 |
| 429 / 503 | `Retry-After` header + `error.retryAfterSeconds` whenever a wait is known. Never auto-retry a mutation | `A1` A.3 |
| `ok` flag | Mutation bodies may carry `ok: true` (site parity). The client never reads it: a typed method resolves to the wire body **without** `ok` and rejects with `ApiError` otherwise. Exception: `PanelActionResult.ok` is data (a failed dev-panel action is a normal `200`) | `A2` A.0.4 |
| Entities vs DTOs | Entity interfaces (§1.2) are rows of the mock store / database. Responses are **projections** built under rules P1–P7 of `A4` §3.12; an entity name is never reused for a projection; a field the caller's role may not see is absent from the DTO type | `A4` §3.12 |
| Files | A response never contains a URL. It carries `StoredFileRef`, `AttachedPhoto`, `PhotoRef` or a bare `fileId`; bytes come only from `GET /files/{fileId}` | `A4` §3.8 |
| Lesson status | Every lesson `status` on the wire is `DerivedLessonStatus` computed by the server at response time. The stored `LessonStatus` is sent only by `GET /developer/statistics/teachers` | `A4` §3.4 |
| Client | One `ApiClient` with nine members (§2.13), 112 methods, one method per operation; `FileService` and `PreferencesStore` live next to it | `A5` Part B |

Global error codes (same meaning on every endpoint; not repeated in the endpoint tables):

| Code | HTTP | Extra |
|---|---|---|
| `sessionExpired` | 401 | — |
| `unauthorized` | 403 | — |
| `developerRightsRequired` | 403 | developer-only endpoints |
| `invalidData` | 400 | undifferentiated bad input |
| `rateLimited` | 429 | `retryAfterSeconds` always present |
| `serviceUnavailable` | 503 | `retryAfterSeconds: 5` (limiter store failure) |
| `migrationMissing` | 503 | `params.what`; `details.deadlinesEnabled: false` where applicable |
| `saveFailed` / `deleteFailed` / `internalError` | 500 | client shows `message`, keeps input, offers manual retry |
| `network` | — | client-only (`status: 0`: no response, timeout, aborted) |

---

## 1. Canonical types

One module in the app (e.g. `src/domain/types.ts`). Feature folders import from it and never re-declare.

### 1.1 Primitives, enums and string dictionaries

```ts
// ── primitives ──
export type IsoDateTime = string;          // "2026-11-16T15:00:00.000Z" — the ONLY spelling (not ISODateTime)
export type DateKey = string;              // "YYYY-MM-DD", Moscow calendar day
export type DateTimeInputValue = string;   // device-local "YYYY-MM-DDTHH:mm", UI state only, never on the wire
export type Locale = "ru" | "en";          // default "ru"

// ── Prisma enums (verbatim values) ──
export type UserRole = "TEACHER" | "STUDENT" | "DEVELOPER";
export type HomeworkNumberStatus = "GREEN" | "YELLOW" | "RED";              // null = not marked; solved = GREEN | YELLOW
export type Subject = "MATH" | "INFORMATICS";
export type LessonKind = "LESSON" | "HOMEWORK";                             // a Lesson row is a lesson OR a homework draft
export type LessonStatus = "PLANNED" | "ACTIVE" | "FINISHED";               // STORED column; never ACTIVE in app-written data
export type DerivedLessonStatus = "PLANNED" | "ACTIVE" | "FINISHED";        // COMPUTED by deriveLessonStatus(lesson, now)
export type AttendanceLessonStatus = Exclude<DerivedLessonStatus, "PLANNED">;
export type AttendanceStatus = "UNKNOWN" | "PRESENT" | "LATE" | "ABSENT" | "EXCUSED";   // not AttendanceValue
export type AssignmentReason = "NEW" | "REVIEW" | "GAP" | "DIAGNOSTIC";
export type LessonItemResult = "SOLVED" | "PARTIAL" | "NOT_SOLVED" | "SKIPPED";         // → GREEN / YELLOW / RED / no change
export type ParentCallOutcome = "REACHED" | "NO_ANSWER";
export type SolutionCheckStatus = "PENDING" | "CHECKING" | "DONE" | "FAILED";
export type SolutionVerdict = "CORRECT" | "INCORRECT" | "UNCERTAIN";
export type AuditCategory = "AI" | "DATA" | "AUTH";

// ── string-coded dictionaries ──
export type ErrorKind =
  | "METHOD" | "FORMULA" | "DOMAIN" | "LOST_ROOT" | "ALGEBRA" | "BRACKETS" | "SIGN" | "ARITHMETIC"
  | "TRANSCRIPTION" | "INCOMPLETE" | "UNREADABLE" | "NOT_FOUND" | "NONE";                // teacher / developer only
export type PlanErrorCode =
  | "unavailable" | "studentMissing" | "noCandidates" | "homeworkNoCandidates"
  | "homeworkParams" | "emptyPlan" | "failed" | "budgetExhausted" | "queueFull";
/** Raw LessonParticipant.planError: "plan-error:<PlanErrorCode>", a frozen legacy Russian sentence, or null.
 *  Shown only through the ported planErrorText(raw, dict.planner.planErrors). */
export type PlanErrorRaw = string | null;
/** Class of a FAILED AI check as sent to a student. Non-null iff status === "FAILED". "unknown" ↔ dict key `fallback`. */
export type CheckErrorCode =
  | "interrupted" | "disabled" | "timeout" | "quota" | "unavailable" | "queue" | "image" | "unknown";
export type CreatePlanOutcome = "queued" | "skipped" | "unavailable" | "budgetExhausted" | "queueFull";
export type ProgressSource = "teacher" | "homework_check" | "lesson_teacher" | "lesson_check" | "lesson_end";
export type ProgressDecisionReason =
  | "changed" | "reaffirmed" | "unchanged" | "uncertain"
  | "downgrade_blocked" | "newer_status" | "no_status" | "lesson_result_preserved";
export type NotificationType =
  | "homework-assigned" | "homework-checked" | "parent_call_due"
  | "dev_errors" | "dev_ai_budget_warn" | "dev_ai_budget_out" | "dev_stale_checks" | "dev_storage"
  | "broadcast";
export type ParentCallReminderState = "ok" | "due" | "overdue";
export type ReportPeriod = "7d" | "30d" | "year";
export type TimelinePeriod = "7d" | "4w" | "8w";
export type ReasoningEffort = "low" | "medium" | "high";
export type PasswordProblem = "tooShort" | "tooLong" | "noLetter" | "noDigit" | "common";
export type StudentStreakColorTier =
  | "starter" | "ember" | "amber" | "lime" | "emerald" | "cyan" | "blue" | "violet" | "rose" | "gold";

// ── device preferences ──
export type ThemeMode = "system" | "light" | "dark";    // the user's choice
export type ResolvedTheme = "light" | "dark";           // what is painted
export type HintsMode = "on" | "off";
```

### 1.2 Stored entities (mock store rows; never returned as is)

Field comments, limits and delete rules: `09` §1.2 – §1.3. Visibility per role: `09` §1.5.

```ts
export interface User { id: string; name: string; email: string /* the LOGIN */; role: UserRole;
  teacherId: string | null /* owner teacher of a STUDENT */; createdAt: IsoDateTime; updatedAt: IsoDateTime }
export interface StudentProfile { id: string; userId: string; subject: Subject | null; grade: number | null;
  levelScore: number | null; placedAt: IsoDateTime | null; speed: number | null /* 1..10 */; aiNote: string | null;
  aiPortrait: string | null; portraitUpdatedAt: IsoDateTime | null; groupId: string | null /* at most one group */;
  createdAt: IsoDateTime; updatedAt: IsoDateTime }
export interface StudentGroup { id: string; name: string; subject: Subject; grade: number | null /* 1..11 */;
  teacherId: string; createdAt: IsoDateTime; updatedAt: IsoDateTime }
export interface ParentCallLog { id: string; studentId: string; teacherId: string | null; outcome: ParentCallOutcome;
  comment: string | null /* PERSONAL DATA */; calledAt: IsoDateTime; createdAt: IsoDateTime }       // append-only

export interface StoredFile { id: string; originalName: string; mimeType: string; size: number;
  uploadedAt: IsoDateTime; uploadedById: string }                                                    // storageKey is server-only

export interface Topic { id: string; title: string; description: string; displayOrder: number; subject: Subject;
  grade: number | null; theoryFileId: string | null; homeworkFileId: string | null;
  answersFileId: string | null /* never to STUDENT */; createdAt: IsoDateTime; updatedAt: IsoDateTime }
export interface TopicHomeworkNumber { id: string; topicId: string; number: string /* digits, leading zeros significant */;
  displayOrder: number; conditionLatex: string | null; answerLatex: string | null /* never to STUDENT */;
  answerFileId: string | null; estimatedMinutes: number | null; usableInDiagnostic: boolean }

export interface StudentTopicNumberStatus { id: string; studentId: string; homeworkNumberId: string;
  status: HomeworkNumberStatus | null; note: string | null; deadlineAt: IsoDateTime | null;
  statusChangedAt: IsoDateTime | null; createdAt: IsoDateTime; updatedAt: IsoDateTime }              // unique (studentId, homeworkNumberId)
export interface ProgressStatusEvent { id: string; createdAt: IsoDateTime; studentId: string; homeworkNumberId: string;
  source: ProgressSource; previousStatus: HomeworkNumberStatus | null; requestedStatus: HomeworkNumberStatus | null;
  status: HomeworkNumberStatus | null; decision: ProgressDecisionReason;
  actorId: string | null; actorName: string | null; actorRole: UserRole | null; context: ProgressEventContext }
export interface ProgressEventContext { lessonId?: string; itemId?: string; assignmentId?: string; checkId?: string;
  submissionId?: string; verdict?: SolutionVerdict; lessonResult?: LessonItemResult | null; checkStartedAt?: IsoDateTime }

export interface HomeworkAssignment { id: string; studentId: string; topicId: string; title: string | null;
  deadlineAt: IsoDateTime | null; createdAt: IsoDateTime; updatedAt: IsoDateTime }
export interface HomeworkAssignmentNumber { id: string; assignmentId: string; homeworkNumberId: string }
export interface HomeworkSubmissionPhoto { id: string; assignmentId: string; fileId: string; createdAt: IsoDateTime }
export interface HomeworkCheck { id: string; assignmentId: string; status: SolutionCheckStatus; activeSlot: 1 | null;
  modelUsed: string | null; error: string | null /* raw text */; createdAt: IsoDateTime; checkedAt: IsoDateTime | null }
export interface HomeworkCheckPhoto { id: string; checkId: string; fileId: string; order: number }
export interface HomeworkCheckResult { id: string; checkId: string; homeworkNumberId: string; verdict: SolutionVerdict;
  recognizedAnswer: string | null; comment: string | null; confidence: number | null;
  copySuspected: boolean; copyReason: string | null; errorKind: ErrorKind | null; errorNote: string | null;
  injectionSuspected: boolean; injectionNote: string | null }                                        // diagnostics: never to STUDENT

export interface Lesson { id: string; title: string; subject: Subject; teacherId: string; groupId: string | null;
  topicId: string | null; status: LessonStatus; kind: LessonKind; deadlineAt: IsoDateTime | null;
  durationMinutes: number /* 15..240, default 60 */; planParams: LessonPlanParams | HomeworkPlanParams | null;
  startsAt: IsoDateTime | null; startedAt: IsoDateTime | null; finishedAt: IsoDateTime | null;
  createdAt: IsoDateTime; updatedAt: IsoDateTime }
/** Stored JSON; never part of any response. outputLocale is OPTIONAL (rows without it exist). */
export interface LessonPlanParams { title: string; durationMinutes: number; topicIds: string[]; teacherNote: string;
  outputLocale?: Locale }
export interface HomeworkPlanParams { title: string; topicId: string; deadlineAt: IsoDateTime; teacherNote: string;
  sourceLessonId: string | null; dailyMinutes: number; outputLocale?: Locale }
export interface LessonParticipant { id: string; lessonId: string; studentId: string; attendance: AttendanceStatus;
  speed: number | null; issuedAssignmentId: string | null; issuedAt: IsoDateTime | null; planSummary: string | null;
  planGeneratedAt: IsoDateTime | null; planError: PlanErrorRaw; joinedAt: IsoDateTime | null;
  queueOrder: number | null; helpedAt: IsoDateTime | null; createdAt: IsoDateTime; updatedAt: IsoDateTime }
export interface LessonAssignmentItem { id: string; participantId: string; homeworkNumberId: string; order: number;
  reason: AssignmentReason; forReview: boolean; minutes: number | null; comment: string | null; isExtra: boolean;
  result: LessonItemResult | null; createdAt: IsoDateTime }
export interface LessonItemSubmission { id: string; itemId: string; status: SolutionCheckStatus; activeSlot: 1 | null;
  verdict: SolutionVerdict | null; recognizedAnswer: string | null; comment: string | null; confidence: number | null;
  errorKind: ErrorKind | null; errorNote: string | null; injectionSuspected: boolean; injectionNote: string | null;
  modelUsed: string | null; error: string | null; submittedAt: IsoDateTime; checkedAt: IsoDateTime | null }
export interface LessonSubmissionPhoto { id: string; submissionId: string; fileId: string; order: number }   // max 3

export type NotificationParams = Record<string, string | number | boolean | null>;
export interface Notification { id: string; userId: string; type: NotificationType | string; title: string /* ru snapshot */;
  body: string | null; href: string | null /* site path */; params: NotificationParams | null;
  readAt: IsoDateTime | null; createdAt: IsoDateTime }
export interface AuditLog { id: string; createdAt: IsoDateTime; category: AuditCategory; action: string;
  outcome: "ok" | "failed"; actorId: string | null; actorName: string | null; actorRole: UserRole | null;
  targetType: string | null; targetId: string | null; targetLabel: string | null; summary: string | null;
  model: string | null; inputTokens: number | null; outputTokens: number | null; costRub: string | null;
  durationMs: number | null; error: string | null; meta: Record<string, unknown> | null; clientIp: string | null }
export interface SiteSettings {
  aiEnabled: boolean; aiModel: string; aiShortlistModel: string; aiReasoningEffort: ReasoningEffort;
  aiMinConfidence: number; aiDailyLimit: number; aiPerStudentHourlyLimit: number; aiCheckConcurrency: number;
  photoRetentionDays: number; maxPhotosPerAssignment: number; completedChecksKept: number;
  lessonPlanEnabled: boolean; lessonPlanShortlistSize: number; lessonPlanMaxItems: number; lessonPlanConcurrency: number;
  aiPlanDailyLimit: number; homeworkPlanEnabled: boolean; homeworkPlanMaxItems: number; homeworkPlanShortlistSize: number;
  lessonCheckEnabled: boolean; lessonCheckDailyLimit: number; lessonCheckPerStudentHourlyLimit: number;
  lessonIdleWarnMinutes: number; lessonIdleAlertMinutes: number; loginHelpContact: string }
/** Mock session row (server: Session table, token stored hashed). */
export interface Session { id: string; token: string; userId: string; expiresAt: IsoDateTime; createdAt: IsoDateTime }
```

Schema-only tables with no code and no screens stay out of the mobile domain layer: `Test*`, `TopicMastery`.

### 1.3 Shared wire and client types

```ts
// ── errors ──
export type GlobalErrorCode =
  | "sessionExpired" | "unauthorized" | "developerRightsRequired" | "invalidData" | "rateLimited"
  | "serviceUnavailable" | "migrationMissing" | "saveFailed" | "deleteFailed" | "internalError";
export type ApiErrorCode = GlobalErrorCode | string;     // endpoint codes: the "Errors" column of §2
/** Body of EVERY non-2xx response. */
export type ApiErrorBody = {
  error: {
    code: ApiErrorCode;                          // lower camelCase, for branching only
    message: string;                             // localized by Accept-Language, shown verbatim
    retryAfterSeconds?: number;                  // mirrors Retry-After
    params?: Record<string, string | number>;    // values substituted into the dictionary template ({ max: 10 })
    details?: Record<string, unknown>;           // machine data the UI acts on ({ conflictNumbers: string[] })
  };
};
/** Thrown by every ApiClient method, in both implementations. */
export class ApiError extends Error {
  status: number;                                // 0 = no response
  code: ApiErrorCode | "network";
  retryAfterSeconds?: number;
  params?: Record<string, string | number>;
  details?: Record<string, unknown>;
}

// ── files ──
export type FileRef = Pick<StoredFile, "id" | "originalName" | "mimeType" | "size">;     // what a viewer needs
export type StoredFileRef = FileRef & { uploadedAt: IsoDateTime };                        // topic files, upload result
export interface PhotoRef { fileId: string; originalName: string }                        // check snapshot photo
export interface AttachedPhoto extends PhotoRef { id: string /* HomeworkSubmissionPhoto id */; mimeType: string; createdAt: IsoDateTime }
export type DownloadedFile = { uri: string; fileName: string };                           // local file URI in the app cache
export type FileUpload = { uri: string; name: string; mimeType: string; size: number };   // local file handed to an upload method
export type PhotoUpload = FileUpload & { mimeType: "image/png" | "image/jpeg" };          // name ends in .png / .jpg / .jpeg
export type UploadCallOptions = { onProgress?: (percent: number) => void; signal?: AbortSignal };
export interface FileService {                                                           // not a member of ApiClient
  source(fileId: string, variant?: "original" | "thumb"): { uri: string; headers: Record<string, string> };
  download(file: FileRef | { id: string; originalName: string; mimeType: string }, onProgress?: (fraction: number) => void): Promise<string>;
}

// ── session ──
export type AuthenticatedUser = { id: string; name: string; email: string; role: UserRole; createdAt: IsoDateTime };
export type LoginRequest = { login: string; password: string; deviceName?: string };
export type LoginResponse = { token: string; expiresAt: IsoDateTime; user: AuthenticatedUser };
export type MeResponse = { user: AuthenticatedUser; sessionExpiresAt: IsoDateTime };
export type ChangePasswordRequest = { currentPassword: string; newPassword: string; confirmPassword: string };
export type ChangePasswordResponse = { token: string; expiresAt: IsoDateTime };          // rotated session

// ── pre-login meta (compile-time constants + the one public setting) ──
export interface MetaResponse {
  serverNow: IsoDateTime; timeZone: "Europe/Moscow"; locales: ["ru", "en"];
  loginHelpContact: string;                                  // "" hides the help line
  limits: {
    uploadMaxBytes: 15728640;
    allowedUploadExtensions: [".pdf", ".docx", ".png", ".jpg", ".jpeg"];
    photoExtensions: [".png", ".jpg", ".jpeg"];
    lessonSubmissionMaxPhotos: 3;
    parentCallDueDays: 30; parentCallOverdueDays: 45;
    lessonDurationMinutes: { min: 15; max: 240; default: 60 };
    homeworkDailyMinutes: { min: 15; max: 240; default: 60 };
    speed: { min: 1; max: 10 };
    maxStudentsPerLesson: 30; maxItemsPerPart: 40; maxTitleLength: 200; maxTeacherNoteLength: 500;
  };
}

// ── device preferences (never sent to a server in v1) ──
export interface InterfacePreferences { locale: Locale; themeMode: ThemeMode; hints: HintsMode }
export const DEFAULT_INTERFACE_PREFERENCES: InterfacePreferences = { locale: "ru", themeMode: "system", hints: "off" };
export interface PreferencesStore {                                                      // not a member of ApiClient
  load(): Promise<InterfacePreferences>;                    // validated per field, defaults applied
  setThemeMode(mode: ThemeMode): Promise<void>;
  setHints(hints: HintsMode): Promise<void>;
  setLocale(locale: Locale): Promise<{ ok: true; locale: Locale } | { ok: false }>;
}

// ── navigation ──
export type ScreenId =
  | "auth.launch" | "auth.login" | "shell.notifications" | "shell.settings" | "shell.numberSearch" | "shared.fileViewer"
  | "student.home" | "student.lesson" | "student.homeworks" | "student.homework" | "student.deadlines"
  | "student.theory" | "student.info" | "student.number"
  | "teacher.home" | "teacher.students" | "teacher.student.review" | "teacher.student.assign" | "teacher.student.lessons"
  | "content.topics" | "content.topic" | "content.topicEdit" | "content.number"
  | "groups.list" | "groups.detail"
  | "planner.lessons" | "planner.drafts" | "planner.lessonNew" | "planner.lessonBoard" | "planner.draftNew" | "planner.draftBoard"
  | "calls.list" | "developer.accounts" | "stats.main" | "developer.panel" | "developer.journal";
/** A primary section of a role's root navigator, in site order. */
export type NavSection = { screen: ScreenId; labelKey: string /* dict.nav.<role>.<item> */; webPath: string;
  placement: "tab" | "more" | "gear" };
/** The only thing the app navigates by (notifications, history references, search results). */
export type NavTarget =
  | { screen: "student.homeworks" }
  | { screen: "student.homework"; assignmentId: string }
  | { screen: "student.number"; number: string }
  | { screen: "content.number"; topicId: string; number: string }
  | { screen: "calls.list"; studentId: string }
  | { screen: "developer.panel"; tab: "status" | "actions" | "broadcast" | "settings" }
  | { screen: "developer.journal"; outcome?: "failed"; days?: number }
  | { screen: "planner.lessonBoard"; lessonId: string }
  | { screen: "teacher.student.review"; studentId: string; assignmentId?: string };

// ── notifications ──
export type NotificationItem = {
  id: string; type: string /* NotificationType or unknown */;
  title: string; body: string | null;                        // rendered for Accept-Language
  params: NotificationParams | null;                         // lets the app re-render on a language switch
  href: string | null;                                       // stored site path, diagnostics only — never parsed by the app
  target: NavTarget | null;                                  // resolveHrefTarget(href, role); null = only mark read
  readAt: IsoDateTime | null; createdAt: IsoDateTime;
};
export type NotificationsResponse = { notifications: NotificationItem[] /* newest 20 */; unreadCount: number /* all unread */ };
export type NotificationParamsByType = {
  "homework-assigned": { variant: "assigned" | "deadline"; topic: string | null; numbers: string; count: number; deadlineAt: IsoDateTime };
  "homework-checked": { correct: number; incorrect: number; uncertain: number; applied: number };
  "parent_call_due": { state: "due" | "overdue"; name: string; days: number; hasReachedCall: boolean };
  "dev_errors": { count: number };
  "dev_ai_budget_warn": { used: number; limit: number };
  "dev_ai_budget_out": { used: number; limit: number };
  "dev_stale_checks": { count: number };
  "dev_storage": { gb: string };
  "broadcast": null;
};
export type PushDeviceRequest = { pushToken: string; platform: "ios" | "android"; locale: Locale };

// ── realtime ──
export type DashboardRealtimeEvent =
  | { kind: "connected"; occurredAt: IsoDateTime }                                                  // first frame, swallowed by the client
  | { kind: "students-changed"; occurredAt: IsoDateTime }
  | { kind: "topic-content-changed"; occurredAt: IsoDateTime; topicId?: string }
  | { kind: "student-progress-changed"; occurredAt: IsoDateTime; studentId: string; topicId?: string }
  | { kind: "student-deadlines-changed"; occurredAt: IsoDateTime; studentId: string; topicId?: string }
  | { kind: "lesson-activity"; occurredAt: IsoDateTime; lessonId: string; teacherId: string; studentId?: string };
export type RealtimeConnectionState =
  | { status: "connecting" }
  | { status: "open"; connectedAt: IsoDateTime }
  | { status: "refused"; code: "tooManyConnections" | "rateLimited" | "serviceUnavailable"; retryAt: IsoDateTime }
  | { status: "closed" };
export type SyncChangesResponse = { serverTime: IsoDateTime; changed: Array<Exclude<DashboardRealtimeEvent["kind"], "connected">> };

// ── streak / timeline ──
export type TimelineEntry = { date: DateKey; closedCount: number; redCount: number };
export type StudentStreak = {
  currentStreak: number; bestStreak: number; solvedToday: number; solvedThisWeek: number; activeDaysThisWeek: number;
  dailyActivity: Array<{ date: DateKey; dayLabel: string /* ignored by the client */; count: number }>;   // 7 entries, last = today
};
export type StudentStreakColorMeta = { tier: StudentStreakColorTier; currentThreshold: number | null;
  nextThreshold: number | null; daysToNextThreshold: number | null };                     // computed on the client

// ── number search (one shape for all roles) ──
export type NumberFindResult = { number: string /* recorded spelling */; topicId: string; topicTitle: string };
```

### 1.4 View models and request / response types, by owner

Names with the suffix `Dto` / `Response` / `Model` / `Item` are projections. Each is declared once, here; the
"owner" is the spec whose prose explains the fields.

#### 1.4.1 Shell (owner `01`)

```ts
export type UpdateProfileRequest = { name: string };                         // 1..120 chars after normalisation
export type UpdateProfileResponse = { user: AuthenticatedUser };
export type MarkNotificationsReadRequest = { notificationId?: string };      // omitted = all
export type MarkNotificationsReadResponse = { ok: true; unreadCount: number };
export type StreakResponse = { streak: StudentStreak };
/** Derived on the client from MeResponse.user — not a response type. */
export type ShellUser = Pick<AuthenticatedUser, "id" | "name" | "email" | "role">;
export type InterfaceBlockModel = { preferences: InterfacePreferences; resolvedTheme: ResolvedTheme; localePending: Locale | null };
```

#### 1.4.2 Student study (owner `02`)

```ts
export type HomeworkDeadlineSummary = {
  id: string; title: string | null; orderInTopic: number; topicTitle: string;
  deadlineAt: IsoDateTime | null; totalNumbers: number; solvedCount: number;
};  // label = title ?? format(dict.common.homeworkN, { n: orderInTopic }) — built on the client
export type HomeworkDeadlinesResponse = { serverNow: IsoDateTime; today: DateKey; items: HomeworkDeadlineSummary[] };   // createdAt asc
export type TheoryLibraryResponse = {
  topics: Array<{ id: string; title: string; description: string; theoryFile: StoredFileRef }>;   // only topics with a theory file
};
export type StudentNumberDetailResponse = {
  topic: { id: string; title: string; description: string };
  number: {
    id: string /* homeworkNumberId */; number: string; conditionLatex: string | null;
    status: HomeworkNumberStatus | null; note: string /* "" when none */;
    deadlineAt: IsoDateTime | null; statusUpdatedAt: IsoDateTime | null;
  };
  notesEnabled: boolean;                                                     // never contains answers
};
export type SaveNoteRequest = { note: string };                              // trimmed, cut to 240; "" clears
export type SaveNoteResponse = { ok: true; status: HomeworkNumberStatus | null; note: string; notesEnabled: boolean };
```

Exam info (`student.info`) has no endpoint: the scale tables and texts are bundled (`02` S5).

#### 1.4.3 Student homework and live lesson (owner `03`, typed by `A5` Part A)

```ts
export type HomeworkSummaryDto = HomeworkDeadlineSummary & {
  topicId: string; createdAt: IsoDateTime; solvedPercent: number; photosCount: number;
  attentionRank: 0 | 1 | 2 | 3 | 4 | 5; latestCheckStatus: SolutionCheckStatus | null;
  numbers: Array<{ homeworkNumberId: string; number: string; status: HomeworkNumberStatus | null }>;
};
export type StudentCheckDto = {
  id: string; status: SolutionCheckStatus; errorCode: CheckErrorCode | null;
  createdAt: IsoDateTime; checkedAt: IsoDateTime | null;
  results: Array<{ number: string; homeworkNumberId: string; verdict: SolutionVerdict;
                   recognizedAnswer: string | null; comment: string | null }>;   // may be [] when DONE
};
export type GetHomeworksResponse = {
  serverNow: IsoDateTime; available: boolean; limits: { maxPhotosPerAssignment: number };
  assignments: HomeworkSummaryDto[];                                         // attention-sorted by the server
};
export type GetHomeworkResponse = {
  serverNow: IsoDateTime; limits: { maxPhotosPerAssignment: number; noteMaxLength: 240 };
  notesEnabled: boolean; aiCheckAvailable: boolean;
  assignment: Omit<HomeworkSummaryDto, "numbers"> & {
    photos: AttachedPhoto[]; latestCheck: StudentCheckDto | null;
    numbers: Array<{ homeworkNumberId: string; number: string; conditionLatex: string | null;
                     status: HomeworkNumberStatus | null; note: string }>;
  };
};
export type UploadHomeworkPhotosResult = { photos: AttachedPhoto[] /* the created ones */; photosCount: number };
export type DeleteHomeworkPhotoResult = { photosCount: number };
export type StartHomeworkCheckResult = { check: StudentCheckDto };           // status "PENDING"
export type LatestHomeworkCheckResponse = {
  check: StudentCheckDto | null; photos: AttachedPhoto[];
  numbers: Array<{ homeworkNumberId: string; status: HomeworkNumberStatus | null }>; solvedCount: number;
};

export type LessonSubmissionDto = {
  id: string; itemId: string; status: SolutionCheckStatus; verdict: SolutionVerdict | null; comment: string | null;
  errorCode: CheckErrorCode | null; submittedAt: IsoDateTime; checkedAt: IsoDateTime | null;
};
export type LessonItemDto = {
  id: string; order: number; isExtra: boolean; number: string; homeworkNumberId: string;
  topicId: string; topicTitle: string; conditionLatex: string | null;
  result: LessonItemResult | null; submission: LessonSubmissionDto | null;
  closed: boolean; canSubmit: boolean;                                       // required, server-computed
};
export type ActiveLessonDto = {
  lessonId: string; title: string; groupName: string | null; startsAt: IsoDateTime; durationMinutes: number;
  endsAt: IsoDateTime /* startsAt + durationMinutes */; joinedAt: IsoDateTime | null; items: LessonItemDto[];
};
export type UpcomingLessonDto = { lessonId: string; title: string; startsAt: IsoDateTime; durationMinutes: number; groupName: string | null };
export type GetLessonResponse = {
  serverNow: IsoDateTime; limits: { maxPhotosPerSubmission: 3 }; lessonCheckAvailable: boolean;
  active: ActiveLessonDto | null; upcoming: UpcomingLessonDto | null;
};
export type JoinLessonResult = { joinedAt: IsoDateTime };
export type SubmitLessonItemResult = { submission: LessonSubmissionDto };    // status "PENDING"
export type LessonStateResponse = {
  serverNow: IsoDateTime; status: DerivedLessonStatus;
  items: Array<Pick<LessonItemDto, "id" | "result" | "submission" | "closed" | "canSubmit">>;
};
```

#### 1.4.4 Teacher: students, review, assign (owner `04`)

```ts
export type TeacherHomeSummary = {
  stats: { totalTopics: number; totalNumbers: number; totalStudents: number; totalFiles: number; totalMarked: number };
  calls: { due: number; overdue: number };
};
export type TeacherStudentListItem = { id: string; name: string; email: string;
  greenCount: number; yellowCount: number; redCount: number; markedCount: number; solvedCount: number };
export type StudentCreateInput = { name: string; login: string; password: string };
export type CreatedStudent = { id: string; name: string; email: string };
export type TeacherStudentHeader = { id: string; name: string; email: string; createdAt: IsoDateTime };
export type StudentCardResponse = { student: TeacherStudentHeader; activeHomeworksCount: number };

export type TeacherHomeworkCheck = {
  id: string; status: SolutionCheckStatus; error: string | null /* raw, staff only */;
  createdAt: IsoDateTime; checkedAt: IsoDateTime | null; photos: PhotoRef[];
  results: Array<{ number: string; verdict: SolutionVerdict; recognizedAnswer: string | null; comment: string | null;
                   copySuspected: boolean; copyReason: string | null; injectionSuspected: boolean; injectionNote: string | null }>;
};
export type TeacherHomeworkAssignment = {
  id: string; title: string | null; orderInTopic: number; topicId: string; topicTitle: string;
  deadlineAt: IsoDateTime | null; createdAt: IsoDateTime;
  numbers: Array<{ homeworkNumberId: string; number: string; conditionLatex: string | null; answerLatex: string | null;
                   status: HomeworkNumberStatus | null; note: string }>;
  photos: AttachedPhoto[];                                                   // attached now, not yet consumed by a DONE check
  checks: TeacherHomeworkCheck[] /* newest first, ≤ 15 */; latestCheck: TeacherHomeworkCheck | null;
  greenCount: number; yellowCount: number; redCount: number; markedCount: number; totalNumbers: number;
  progressPercent: number; solvedCount: number; solvedPercent: number;
};
export type TeacherStudentHomeworks = { assignmentsEnabled: boolean; notesEnabled: boolean;
  assignments: TeacherHomeworkAssignment[] /* attention-sorted */ };

export type ComposeBoardTopic = {                                            // declared once; owner 05, used by 04
  id: string; title: string; totalNumbers: number;
  conditionsLoaded: boolean;                                                 // true on the first topic only
  numbers: Array<{ id: string /* homeworkNumberId */; number: string; status: HomeworkNumberStatus | null;
                   inLesson: boolean; conditionLatex: string | null }>;
};
export type AssignBoardTopic = Omit<ComposeBoardTopic, "numbers"> & {
  numbers: Array<Omit<ComposeBoardTopic["numbers"][number], "inLesson"> & { deadlineAt: IsoDateTime | null }>;
};
export type AssignBoardResponse = { deadlinesEnabled: boolean; topics: AssignBoardTopic[] };

export type IssueHomeworkRequest = { studentId: string; topicId: string; homeworkNumberIds: string[]; deadlineAt: IsoDateTime; title?: string };
export type IssueHomeworkResponse = { assignmentId: string; deadlineAt: IsoDateTime; homeworkNumberIds: string[] };
export type SetNumberStatusRequest = { status: HomeworkNumberStatus | null };
export type SetNumberStatusResponse = { ok: true; status: HomeworkNumberStatus | null; statusChangedAt: IsoDateTime; decision: "changed" | "reaffirmed" };
export type SetNumberStatusesRequest = { changes: Array<{ homeworkNumberId: string; status: HomeworkNumberStatus | null }> };   // 1..100
export type SetNumberStatusesResponse = { results: Array<{ homeworkNumberId: string; status: HomeworkNumberStatus | null }> };
export type SetDeadlinesRequest = { topicId: string; homeworkNumberIds: string[]; deadlineAt: IsoDateTime | null };
export type SetDeadlinesResponse = { deadlineAt: IsoDateTime | null; homeworkNumberIds: string[] };

export type ProgressHistoryPage = {                                          // codes, not labels
  studentName: string; number: string; topicTitle: string; currentStatus: HomeworkNumberStatus | null;
  entries: Array<{
    id: string; createdAt: IsoDateTime; source: ProgressSource; actorName: string | null;
    previousStatus: HomeworkNumberStatus | null; requestedStatus: HomeworkNumberStatus | null;
    status: HomeworkNumberStatus | null; decision: ProgressDecisionReason;
    reference: { kind: "lesson"; lessonId: string } | { kind: "homework"; assignmentId: string } | null;
  }>;                                                                        // createdAt desc; page size 20
  nextCursor: string | null;
};

export type TeacherStudentLesson = {
  id: string /* lessonId */; participantId: string; title: string; status: DerivedLessonStatus;
  durationMinutes: number; createdAt: IsoDateTime; startsAt: IsoDateTime | null; groupName: string | null;
  planPending: boolean; planError: PlanErrorRaw;
  items: Array<Pick<LessonBoardItem, "id" | "homeworkNumberId" | "number" | "topicTitle" | "isExtra" | "result">>;
};
```

#### 1.4.5 Developer accounts (owner `04` S9)

```ts
export type ManagedTeacher = { id: string; name: string; email: string; studentCount: number; lessonCount: number; testCount: number };
export type ManagedStudent = { id: string; name: string; email: string; teacherId: string | null };
export type AccountsDirectory = { teachers: ManagedTeacher[]; students: ManagedStudent[] };          // name asc
export type AccountCreateInput = { role: "STUDENT" | "TEACHER"; teacherId: string; name: string; login: string; password: string };
export type CreatedAccount = { id: string; name: string; email: string; role: "STUDENT" | "TEACHER"; teacherId: string | null };
export type OwnerChange = { studentId: string; teacherId: string };
```

#### 1.4.6 Planner: lessons and homework drafts (owner `05`)

```ts
export type LessonListItem = {
  id: string; title: string; status: DerivedLessonStatus; durationMinutes: number;
  createdAt: IsoDateTime; startsAt: IsoDateTime | null; groupId: string | null; groupName: string | null;
  soloStudentName: string | null; resultsTotal: number; resultsMarked: number;
  participantsCount: number; readyCount: number; failedCount: number;
};
export type LessonTargetChooser = { groups: Array<{ id: string; name: string; membersCount: number }>; students: Array<{ id: string; name: string }> };
export type LessonFormMember = { id: string; name: string; speed: number | null };
export type TopicOption = { id: string; title: string };
export type LessonNewFormModel = {
  mode: "group" | "student"; kicker: string; groupId: string | null;
  members: LessonFormMember[]; topics: TopicOption[]; aiAvailable: boolean;
  composeTopics: ComposeBoardTopic[] | null;                                 // mode "student" only
};
export type LessonBankTopic = { topicId: string; topicTitle: string; numbers: Array<{ id: string; number: string }> };
export type CreateLessonInput = {
  groupId?: string; studentIds: string[]; title?: string; durationMinutes?: number; startsAt?: IsoDateTime;
  topicIds?: string[]; teacherNote?: string; speeds?: Record<string, number | null>;
  skipPlan?: boolean; numberIds?: string[];                                  // manual composition; no outputLocale in the body
};
export type CreateLessonResponse = { lessonId: string; plan: CreatePlanOutcome };            // HTTP 201 for every outcome

export type LessonBoardSubmission = {
  status: SolutionCheckStatus; verdict: SolutionVerdict | null; submittedAt: IsoDateTime; checkedAt: IsoDateTime | null;
  injectionSuspected: boolean; injectionNote: string | null; photoFileIds: string[];          // staff only
};
export type LessonBoardItem = {
  id: string; homeworkNumberId: string; number: string; conditionLatex: string | null;
  reason: AssignmentReason; minutes: number | null; comment: string | null; isExtra: boolean;
  result: LessonItemResult | null; topicTitle: string;
  studentStatus: HomeworkNumberStatus | null; submission: LessonBoardSubmission | null;
};
export type LessonBoardParticipant = {
  id: string /* participantId */; studentId: string; studentName: string; speed: number | null;
  planSummary: string | null; planGeneratedAt: IsoDateTime | null; planError: PlanErrorRaw;
  createdAt: IsoDateTime; joinedAt: IsoDateTime | null; items: LessonBoardItem[];
};
export type LessonBoardModel = {                                             // no `bank`, no planParams
  serverNow: IsoDateTime;
  id: string; title: string; kind: "LESSON"; status: DerivedLessonStatus;
  startsAt: IsoDateTime | null; createdAt: IsoDateTime; finishedAt: IsoDateTime | null; durationMinutes: number;
  group: { id: string; name: string } | null; participants: LessonBoardParticipant[];
  aiAvailable: boolean; idleWarnMinutes: number; idleAlertMinutes: number;
};
export type LessonPlanStatus = {
  total: number; ready: number; failed: number; pending: number;
  participants: Array<{ participantId: string; studentId: string; name: string;
                        planGeneratedAt: IsoDateTime | null; planError: PlanErrorRaw; itemsCount: number }>;
};
export type LessonLiveSnapshot = { signature: string };
export type ScheduleLessonResponse = { ok: true; status: DerivedLessonStatus; reopened: boolean };
export type FinishLessonResponse = { ok: true; finalized: { notSolved: number; skipped: number } };
export type SaveSetRequest = { homeworkNumberIds: string[]; extraHomeworkNumberIds?: string[] };
export type SaveSetResponse = { ok: true; items: LessonBoardItem[] };        // the whole set after the change
export type RegenerateResponse = { ok: true; planRequestedAt: IsoDateTime };
export type SetItemResultRequest = { result: LessonItemResult | null };
export type SetItemResultResponse = { ok: true; result: LessonItemResult | null; studentStatus: HomeworkNumberStatus | null };

export type HomeworkPlanListItem = {
  id: string; title: string; deadlineAt: IsoDateTime | null; createdAt: IsoDateTime;
  topicTitle: string | null; groupName: string | null;
  participantsCount: number; readyCount: number; failedCount: number; issuedCount: number;
};
export type HomeworkPlanNewModel = {
  kicker: string; topics: TopicOption[]; members: Array<{ id: string; name: string }>;
  defaultTopicId: string | null; defaultTitle: string; groupId: string | null; sourceLessonId: string | null;
};
export type CreateHomeworkPlanInput = {
  topicId: string; deadlineAt: IsoDateTime; title?: string; teacherNote?: string; dailyMinutes?: number;
  sourceLessonId?: string; groupId?: string; studentIds: string[];
};
export type CreateHomeworkPlanResponse = { planId: string; plan: Exclude<CreatePlanOutcome, "skipped"> };
export type HomeworkPlanItem = Pick<LessonBoardItem,
  "id" | "homeworkNumberId" | "number" | "conditionLatex" | "reason" | "minutes" | "comment" | "studentStatus">;
export type HomeworkPlanParticipant = {
  id: string; studentId: string; studentName: string; planSummary: string | null;
  planGeneratedAt: IsoDateTime | null; planError: PlanErrorRaw;
  issuedAssignmentId: string | null; issuedAt: IsoDateTime | null; createdAt: IsoDateTime; items: HomeworkPlanItem[];
};
export type HomeworkPlanBoardModel = {
  serverNow: IsoDateTime;
  id: string; title: string; topicId: string; topicTitle: string; deadlineAt: IsoDateTime | null;
  daysUntilDeadline: number | null; group: { id: string; name: string } | null;
  sourceLesson: { id: string; title: string } | null; aiAvailable: boolean;
  participants: HomeworkPlanParticipant[]; topicNumbers: Array<{ id: string; number: string }>;
};
export type HomeworkPlanStatus = {
  total: number; ready: number; failed: number; issued: number; pending: number;
  participants: Array<{ participantId: string; studentId: string; name: string; planGeneratedAt: IsoDateTime | null;
                        planError: PlanErrorRaw; issuedAssignmentId: string | null; issuedAt: IsoDateTime | null; itemsCount: number }>;
};
export type IssueFailureCode = "emptySet" | "solvedConflict" | "studentOrNumberNotFound" | "invalidData" | "internalError" | "migrationMissing";
export type IssueResult = {
  ok: true;
  issued: Array<{ participantId: string; studentId: string; name: string; assignmentId: string }>;
  failed: Array<{ participantId: string; studentId: string; name: string; code: IssueFailureCode; message: string; conflictNumbers?: string[] }>;
};
export type HandoutOptions = { format: "pdf" | "html"; studentId?: string; answers?: boolean };
```

#### 1.4.7 Groups, attendance, parent calls, statistics (owner `06`)

```ts
export type GroupListMember = { id: string; name: string; email: string; speed: number | null; aiNote: string | null };
export type GroupListItem = { id: string; name: string; subject: Subject; grade: number | null; createdAt: IsoDateTime;
  membersCount: number; members: GroupListMember[] };
export type GroupMember = GroupListMember & { progress: { greenCount: number; yellowCount: number; redCount: number } };
export type GroupCandidate = { id: string; name: string; email: string; groupId: string | null };
export type GroupDetail = { id: string; name: string; subject: Subject; grade: number | null; createdAt: IsoDateTime;
  totalNumbers: number; members: GroupMember[]; allStudents: GroupCandidate[] };
export type GroupsListResponse = { groups: GroupListItem[]; canCreate: boolean };
export type CreateGroupRequest = { name: string; grade?: number | null; subject?: Subject };
export type CreateGroupResponse = { group: GroupListItem };
export type GroupDetailResponse = {
  group: GroupDetail;
  lessons: { total: number; recent: Array<Pick<LessonListItem, "id" | "title" | "startsAt" | "createdAt" | "durationMinutes" | "status">> };
};
export type RenameGroupRequest = { name: string };
export type RenameGroupResponse = { group: Pick<GroupDetail, "id" | "name"> };
export type AddMemberRequest = { studentId: string };
export type AddMemberResponse = { member: GroupMember; movedFromGroupId: string | null };
export type AiProfileRequest = { speed: number | null; aiNote: string | null };            // full overwrite
export type AiProfileResponse = { studentId: string; speed: number | null; aiNote: string | null };

export type AttentionFlag =
  | { code: "overdue_homework"; count: number } | { code: "not_started" }
  | { code: "idle"; days: number } | { code: "red_month"; count: number };
export type GroupMemberRow = {
  id: string; name: string; closed7: number; closed30: number; red30: number; streak: number;
  overdueHomeworks: number; activeHomeworks: number; lastActivityAt: IsoDateTime | null;
  rank: number; idleDays: number | null; attention: AttentionFlag[];
};
export type GroupStatisticsResponse = {
  generatedAt: IsoDateTime; members: GroupMemberRow[]; mostActiveId: string | null; leastActiveId: string | null;
  totals: { closed7: number; closed30: number; red30: number; overdueHomeworks: number; attentionCount: number };
};
export type GroupAttendanceResponse = {
  period: ReportPeriod; since: IsoDateTime; until: IsoDateTime; members: Array<{ id: string; name: string }>;
  lessons: Array<{ id: string; title: string; startsAt: IsoDateTime; status: AttendanceLessonStatus;
    participants: Array<{ participantId: string; studentId: string; attendance: AttendanceStatus; joinedAt: IsoDateTime | null }> }>;
};
export type SetAttendanceRequest = { attendance: AttendanceStatus };
export type SetAttendanceResponse = { ok: true; attendance: AttendanceStatus };
export type AttendanceSummary = { counted: number; attended: number; late: number; absent: number; excused: number; percent: number | null };   // client-side

export type ParentCallReminder = { state: ParentCallReminderState; daysSinceAnchor: number; daysUntilDue: number; hasReachedCall: boolean };
export type ParentCallEntry = { id: string; outcome: ParentCallOutcome; comment: string | null; calledAt: IsoDateTime; teacherName: string | null };
export type ParentCallStudentOverview = {
  studentId: string; studentName: string; teacherId: string | null; teacherName: string | null;
  reminder: ParentCallReminder; studentCreatedAt: IsoDateTime; lastReachedAt: IsoDateTime | null;
  attemptAfterLastReached: boolean; attemptDaysAgo: number | null; totalCalls: number; history: ParentCallEntry[] /* ≤ 20 */;
};
export type ParentCallsOverviewResponse = { canRecord: boolean; students: ParentCallStudentOverview[];
  counts: { overdue: number; due: number; total: number } };
export type ParentCallCounts = { due: number; overdue: number };
export type ParentCallHistoryResponse = { studentId: string; calls: ParentCallEntry[]; hasMore: boolean };
export type RecordCallRequest = { studentId: string; outcome: ParentCallOutcome; comment?: string };   // comment ≤ 4000
export type RecordCallResponse = { call: ParentCallEntry; reminder: ParentCallReminder };

export type StatsStudent = TeacherStudentListItem;
export type StatsTopic = { id: string; title: string; greenCount: number; yellowCount: number; redCount: number;
  markedCount: number; totalStudents: number; totalNumbers: number; totalSlots: number;
  studentsWithActivity: number; progressPercent: number };
export type TeacherTopicsOverview = { students: StatsStudent[]; topics: StatsTopic[];
  stats: { totalTopics: number; totalStudents: number; totalFiles: number; totalNumbers: number; totalMarked: number } };
export type DeveloperStatistics = {
  homework: { total: number; completedCount: number; overdueCount: number; inProgressCount: number; withPhotosCount: number;
    photosTotal: number; issuedNumbersTotal: number; issuedNumbersSolved: number; issuedNumbersGreen: number;
    issuedNumbersYellow: number; issuedNumbersRed: number; issuedNumbersUnmarked: number };
  content: { totalTopics: number; totalNumbers: number; numbersWithCondition: number; numbersWithAnswer: number;
    topicsWithTheory: number; topicsWithHomeworkFile: number;
    gaps: Array<{ topicId: string; title: string; noTheoryFile: boolean; noHomeworkFile: boolean; missingConditions: number; missingAnswers: number }> };
};
export type StatisticsProgressResponse = { overview: TeacherTopicsOverview; homework: DeveloperStatistics["homework"];
  timeline: TimelineEntry[] /* 112 days */; timelineStudentId: string | null };
export type StatisticsPlatformResponse = { overview: TeacherTopicsOverview; homework: DeveloperStatistics["homework"]; content: DeveloperStatistics["content"] };
export type DrilldownResponse = { numbers: Array<{ status: HomeworkNumberStatus | null; deadlineAt: IsoDateTime | null }> };
export type TeacherLessonEntry = { id: string; title: string; topicTitle: string | null; groupName: string | null;
  participantsCount: number; startsAt: IsoDateTime | null; createdAt: IsoDateTime; status: LessonStatus /* STORED */ };
export type TeacherStatsEntry = { teacherId: string; teacherName: string; teacherEmail: string; studentsCount: number;
  homeworkTotal: number; homework30d: number; callsReached: number; callsNoAnswer: number; lessonsTotal: number;
  lessonsFinished: number; lessonsByWeek: number[] /* 12 */; recentLessons: TeacherLessonEntry[] /* ≤ 8 */;
  topTopics: Array<{ title: string; count: number }> /* ≤ 5 */ };
export type StatisticsTeachersResponse = { teachers: TeacherStatsEntry[]; weekStarts: IsoDateTime[] /* 12 */;
  unattributed: { students: number; homework: number; calls: number; lessons: number } };
```

#### 1.4.8 Content (owner `07`)

```ts
export type TopicListItem = { id: string; title: string; description: string; displayOrder: number;
  totalNumbers: number; studentsWithActivity: number };
export type TopicNumber = { id: string /* homeworkNumberId */; number: string; displayOrder: number;
  estimatedMinutes: number | null; conditionLatex: string | null; answerLatex: string | null };
export type TopicDetail = {
  topic: { id: string; title: string; description: string; displayOrder: number;
           theoryFile: StoredFileRef | null; homeworkFile: StoredFileRef | null; homeworkNumbers: TopicNumber[] };
  stats: { totalNumbers: number; theoryAttached: boolean; homeworkAttached: boolean; conditionsCount: number; answersCount: number };
};
export type NumberDetail = { topic: { id: string; title: string; description: string };
  number: { id: string; number: string; conditionLatex: string | null; answerLatex: string | null } };
export type TopicConditions = { conditions: Record<string /* homeworkNumberId */, string | null> };   // wire body
export type TopicImpactSummary = { totalNumbers: number; numbersWithWork: number; statusCount: number; noteCount: number;
  activeAssignments: number; checkResults: number; lessonItems: number; numbersWithCondition: number; numbersWithAnswer: number };
export type TopicImpact = { summary: TopicImpactSummary; lines: string[] /* localized */ };
export type NumbersChangePreview = { keptCount: number; added: string[]; requiresConfirmation: boolean;
  requiresAssignedConfirmation: boolean;
  removed: Array<{ number: string; summary: string; hasStudentWork: boolean; isAssigned: boolean }> };
export type CreateTopicRequest = { title: string; description?: string; numbers: string /* raw field text */;
  theoryFileId: string; homeworkFileId: string };
export type UpdateTopicRequest = { title: string; description: string; numbers: string; theoryFileId?: string;
  homeworkFileId?: string; confirmNumbersRemoval?: string[]; allowAssignedRemoval?: boolean };
export type ImportTarget = { topicId: string } | { createTopic: true };
export type ImportRequest = { mode: "preview" | "apply"; text: string; target: ImportTarget; overwriteFilled?: boolean };
export type ImportNumber = { number: string; conditionLatex: string; answerLatex: string | null };
export type ImportPreview = { fileTitle: string; fileDescription?: string; willCreateTopic?: true; duplicateTitle?: boolean;
  totalInFile: number; willAddNumbers: number; willFillEmpty: number; willOverwrite: number; untouched: number;
  sample: ImportNumber[]; warnings: string[]; issues: string[] };
export type ImportApplyResult = { topicId?: string; created: number; filled: number; overwritten: number; skipped: number };
```

#### 1.4.9 Developer panel and journal (owner `07`; budgets `A3`)

```ts
export type DeveloperPanelStats = { queueLength: number; checksLastDay: number /* trailing 24 h, homework checks only */;
  studentsCount: number; topicsCount: number; filesCount: number; filesSizeBytes: number; filesSizeLabel: string;
  lastRetentionAt: IsoDateTime | null; lastRetentionLabel: string; lessonQueueLength: number };
export type AiBudgetScope = "api:homework-checks:global" | "api:lesson-checks:global" | "api:ai-plans:global";
export type AiBudgetUsage = { scope: AiBudgetScope; limit: number; used: number; resetAt: IsoDateTime };   // optional (A3 §10.2)
export type DeveloperPanelData = { stats: DeveloperPanelStats; settings: SiteSettings;
  students: Array<{ id: string; name: string }>; aiBudgets?: AiBudgetUsage[] };
export type PanelAction = "test-ai" | "run-retention" | "reset-ai-budget" | "unfreeze-checks" | "flush-caches";
export type PanelActionResult = { ok: boolean; message: string };            // ok is DATA here; ok=false is a normal 200
export type BroadcastRequest = { title: string /* 1..120 */; body?: string /* ≤ 300 */; toAll: boolean; recipientIds?: string[] };
export type JournalEntry = {
  id: string; createdAt: IsoDateTime; category: AuditCategory; action: string; actionLabel: string | null;
  outcome: "ok" | "failed"; actorName: string | null; actorRole: UserRole | null; progressTarget: string | null;
  summary: string | null; progressRef: { studentId: string; homeworkNumberId: string } | null;
  meta: Record<string, unknown> | null; error: string | null;
  inputTokens: number | null; outputTokens: number | null; costRub: string | null;
};
export type JournalQuery = { category?: AuditCategory; actor?: string; action?: string; outcome?: "failed";
  days?: number /* 0..365, default 7 */; page?: number };
export type JournalPage = { entries: JournalEntry[]; total: number; page: number; pageSize: 50; pageCount: number;
  actors: Array<{ id: string; name: string; role: UserRole }>; retentionDays: number };
```

---

## 2. Canonical mobile API contract

Table of contents: §2.1 public, auth, profile · §2.2 notifications and push · §2.3 realtime and polling ·
§2.4 files, uploads, number search · §2.5 student study · §2.6 student homework · §2.7 student live lesson ·
§2.8 teacher students, homework, progress · §2.9 developer accounts · §2.10 planner (lessons, drafts) ·
§2.11 groups, attendance, parent calls, statistics · §2.12 content, import, dev panel, journal ·
§2.13 `ApiClient` composition · §2.14 limits that span endpoints.

Reading the tables: roles `S` STUDENT, `T` TEACHER, `D` DEVELOPER, `own` = only the caller's own students /
lessons / groups (a foreign id is `404`). "Errors" lists endpoint codes only — the global codes of §0
(`401 sessionExpired`, `403 unauthorized` for a wrong role, `429 rateLimited`, `503 serviceUnavailable`, `500`)
apply everywhere. "Limit" is the site's rate limit per user (`n / window`); `—` = none on the site. "Method" is
the single `ApiClient` method (§2.13). "Screens" are the ScreenIds of §3.

### 2.1 Public, auth, profile (owner `01`)

Auth is token-based. `POST /auth/login` creates a server session and returns its opaque token; the app keeps it
in secure storage and sends it as a bearer header. `POST /auth/logout` deletes that one session.
`POST /me/password` deletes every other session of the user and returns a rotated token that replaces the
stored one. Login normalisation, password policy and audit rules: `01` §3.1, §3.4, `04` §4.7.

| Method + path | Roles | Request | 2xx response | Errors | Limit | Method | Screens |
|---|---|---|---|---|---|---|---|
| `GET /meta` | none (no auth) | — | `MetaResponse` | — | — | `shell.getMeta` | `auth.launch`, `auth.login` |
| `POST /auth/login` | none (no auth) | `LoginRequest` | `200 LoginResponse` | `400 empty` · `401 invalidCredentials` · `429 rateLimited` (`params.minutes` 1..60) · `503 database` | 25 / 10 min per client address and 8 / 10 min per address + login (sliding); 20 / 15 min per login (fixed); checked before the credentials | `shell.login` | `auth.login` |
| `POST /auth/logout` | S T D | — | `204` | — | — | `shell.logout` | `shell.settings` |
| `GET /me` (alias: `GET /auth/me`, same handler and body) | S T D | — | `MeResponse` | — | — | `shell.getMe` | `auth.launch` (session restore); after any `403` |
| `PATCH /me` | S T D | `UpdateProfileRequest` | `UpdateProfileResponse` | `400 infoInvalid` | — | `shell.updateProfile` | `shell.settings` |
| `POST /me/password` | S T D | `ChangePasswordRequest` | `ChangePasswordResponse` | `400 passwordInvalid` (`details.problem: PasswordProblem`) · `400 passwordMismatch` · `403 passwordCurrent` · `429 rateLimited` | 5 / 15 min (fixed), consumed after validation, before the current-password check | `shell.changePassword` | `shell.settings` |

### 2.2 Notifications and push (owner `01`)

| Method + path | Roles | Request | 2xx response | Errors | Limit | Method | Screens |
|---|---|---|---|---|---|---|---|
| `GET /notifications?limit=20` | S T D | — | `NotificationsResponse` (newest 20; `target` computed by the server; TEACHER read lazily creates parent-call reminders, DEVELOPER read lazily creates alerts) | — | 60 / 60 s (shared with the next row) | `shell.listNotifications` | `shell.notifications`, bell badge on every root screen |
| `POST /notifications/read` | S T D | `MarkNotificationsReadRequest` | `MarkNotificationsReadResponse` | — | same bucket | `shell.markNotificationsRead` | `shell.notifications` |
| `POST /devices` | S T D | `PushDeviceRequest` | `201 { ok: true }` (idempotent upsert by `pushToken`; re-binds the token to the current user) | — | — | — (see note) | app start after login, permission prompt |
| `DELETE /devices/{pushToken}` | S T D | — | `204` (idempotent) | — | — | — (see note) | logout, permission revoked |

Push rules (the site has no push; server category (d) of `A1` B.5): every created notification additionally
fans out one push carrying the rendered `title` / `body` in the device's `locale` and the `NavTarget`; a tap
opens `target` exactly like a tap in the bell panel. The app registers the token after a successful login and
deletes it before `POST /auth/logout`. **Client status:** the two endpoints are part of the contract, but
`ApiClient` v1 (mock) has no method for them (`A5` B.4); when push is built they become
`shell.registerDevice(input)` / `shell.unregisterDevice(pushToken)` (112 → 114 methods).

### 2.3 Realtime and polling

| Method + path | Roles | Request | 2xx response | Errors | Limit | Method | Screens |
|---|---|---|---|---|---|---|---|
| `GET /realtime` (Server-Sent Events) | S T D | bearer header | frames `data: <DashboardRealtimeEvent JSON>\n\n`; first frame `connected`; comment `: ping` every 25 s; no replay | handshake only: `429 tooManyConnections` (`retryAfterSeconds: 5`) · `429 rateLimited` · `503` | 30 connects / 60 s; 2 open streams per user | `shell.subscribeRealtime(listener, { onState? })` | every screen that reacts to live changes |
| `GET /sync/changes?since=<IsoDateTime>` | S T D | — | `SyncChangesResponse` | — | — | — (deferred, like push) | polling fallback when SSE is refused |

Delivery filter (server and mock): DEVELOPER receives every event; TEACHER receives `students-changed` and
`topic-content-changed` always, `lesson-activity` when `teacherId` is the caller, the two `student-*` events
for own students; STUDENT never receives `students-changed`, always `topic-content-changed`, the other three
only when `studentId` is the caller. One underlying stream per signed-in user; opened in the foreground,
closed in the background and on logout; a refused handshake is reported through `onState`, retried with
backoff 5, 10, 20, 40, 60 s, and never shown to the user.

Channel per feature (SSE is an accelerator; every feature must work with polling / refetch alone):

| Feature | Primary channel | Fallback / complement |
|---|---|---|
| Homework AI check result (`student.homework`) | **Polling** `GET /student/homeworks/{assignmentId}/checks/latest`: first poll 4 s after a start, next delay `4 s · min(2^failures, 8)`, stop after 5 consecutive failures | push `homework-checked` when the app is in the background |
| Live lesson item checks (`student.lesson`) | **Polling** `GET /student/lessons/{lessonId}/state`, same algorithm, while any submission is `PENDING` / `CHECKING` | SSE `lesson-activity` → refetch `GET /student/lesson`; local timers at `startsAt` and `endsAt` (+1 s) |
| Lesson start / early finish for the student | local schedule timers + `status` of the `/state` poll | SSE `lesson-activity`; push "lesson started" (future) |
| Teacher live board (`planner.lessonBoard`) | **SSE** `lesson-activity` → refetch the board (debounced 1500 ms) | poll `GET /teacher/lessons/{lessonId}/live` every 15 s and refetch when `signature` changes |
| AI plan generation (`planner.lessonBoard`, `planner.draftBoard`, `teacher.student.lessons`) | **Polling** `…/status` every 2000 ms on the boards, 2500 ms on the student card; a participant pending for 15 min is "stale" | — |
| Notifications badge | fetch on shell mount, on opening the panel, on app foreground, on every realtime event addressed to the user | push for background delivery |
| Streak (`student.home`) | **SSE** own `student-progress-changed` → `GET /student/streak` | refetch on focus |
| Homework / deadlines lists (student) | **SSE** `student-deadlines-changed`, `student-progress-changed` → invalidate both homework queries | refetch on focus |
| Topics, theory, statements | **SSE** `topic-content-changed` → invalidate | refetch on focus |
| Teacher / developer lists and cards | **SSE** any delivered event → invalidate the focused screen's queries (debounced 1500 ms) | refetch on focus; `GET /sync/changes` when built |
| Dev panel, journal, statistics, parent calls | refetch on focus / pull-to-refresh (no dedicated event) | — |

On return to the foreground and on the first `open` after a refusal: reconnect and invalidate everything once.

### 2.4 Files, uploads, number search

| Method + path | Roles | Request | 2xx response | Errors | Limit | Method | Screens |
|---|---|---|---|---|---|---|---|
| `GET /files/{fileId}` | S T D (access check of `09` §5.1: a student reads topic theory / homework files and own photos only) | — | bytes, inline; `Cache-Control: private, max-age=31536000, immutable`; ETag | `404 fileNotFound` (missing or not permitted) | 120 / 60 s | `FileService.source` / `.download` | `shared.fileViewer`, photo grids |
| `GET /files/{fileId}?thumb=1` | same | — | WebP thumbnail for images (falls back to the original) | same | same bucket | `FileService.source(fileId, "thumb")` | photo grids, file cards |
| `GET /files/{fileId}?download=1` | same | — | bytes, `Content-Disposition: attachment` | same | same bucket | `FileService.download` | share / save actions |
| `POST /uploads` | D | multipart: `file`, `previousFileId?` | `201 { file: StoredFileRef }` | `400 fileRequired` · `400 uploadUnsupportedType` · `400 uploadBadName` · `400 uploadRejected` · `413 uploadTooLarge` · `500 uploadFailed` | 60 / 10 min | `content.uploadFile` | `content.topics` (create block), `content.topicEdit` |
| `GET /numbers/find?number=<digits>` | S T D | `number` matches `^\d{1,20}$`, normalised value ≠ `"0"` | `NumberFindResult` | `400 invalidNumber` · `404 numberNotFound` · `500 searchFailed` | S 120 / 60 s; T, D 30 / 60 s | `shell.findNumber` | `shell.numberSearch` → `student.number` or `content.number` |

Not in v1: signed file URLs (`POST /files/{fileId}/access-url`) and `GET /files/{fileId}/meta` — every DTO
that references a file already carries its metadata. Shared upload error classes for **every** upload
endpoint (student photos included): `uploadInvalid` (400), `uploadNotMultipart` (415), `uploadLengthRequired`
(411), `uploadTooLarge` (413), `uploadUnsupportedType` (400), `uploadBadName` (400, `params.max = 255`),
`uploadRejected` (400). Limits: 15 MiB per request; `.pdf .docx .png .jpg .jpeg` (photos: PNG / JPEG only).

### 2.5 Student study (owner `02`; role S)

| Method + path | Request | 2xx response | Errors | Limit | Method | Screens |
|---|---|---|---|---|---|---|
| `GET /student/streak` | — | `StreakResponse` | — | 120 / 60 s | `shell.getStreak` | `student.home` (streak widget owned by the shell) |
| `GET /student/homework-deadlines` | — | `HomeworkDeadlinesResponse` | — | — | `studentStudy.getHomeworkDeadlines` | `student.home`, `student.deadlines` |
| `GET /student/theory` | — | `TheoryLibraryResponse` | — | — | `studentStudy.getTheoryLibrary` | `student.theory` |
| `GET /student/numbers/{number}` | `{number}` = digits, recorded or normalised form | `StudentNumberDetailResponse` | `400 invalidNumber` · `404 numberNotFound` | — | `studentStudy.getNumberDetail` | `student.number` |
| `PUT /student/numbers/{homeworkNumberId}/note` | `SaveNoteRequest` | `SaveNoteResponse` | `403 statusReadOnly` (body has a `status` key) · `404 numberNotFound` | 90 / 60 s | `studentStudy.saveNumberNote` | `student.number`, `student.homework` (number cards) |

### 2.6 Student homework (owner `03`, `A5` A.5; role S)

| Method + path | Request | 2xx response | Errors | Limit | Method | Screens |
|---|---|---|---|---|---|---|
| `GET /student/homeworks` | — | `GetHomeworksResponse` (missing table → `available: false`, not an error) | — | — | `studentWork.listHomeworks` | `student.homeworks` |
| `GET /student/homeworks/{assignmentId}` | — | `GetHomeworkResponse` | `404 homeworkNotFound` | — | `studentWork.getHomework` | `student.homework` |
| `POST /student/homeworks/{assignmentId}/photos` | multipart: `files` × 1…N (PNG / JPEG) | `{ ok: true } & UploadHomeworkPhotosResult` (all stored or none) | upload classes of §2.4 · `404 homeworkNotFound` · `400 photoLimit` (`params.max`) · `409 concurrentChange` | 60 / 60 s (shared with delete) | `studentWork.uploadHomeworkPhotos` | `student.homework` |
| `DELETE /student/homeworks/{assignmentId}/photos/{photoId}` | — | `{ ok: true } & DeleteHomeworkPhotoResult` | `404 photoNotFound` | same bucket | `studentWork.deleteHomeworkPhoto` | `student.homework` (confirm dialog) |
| `POST /student/homeworks/{assignmentId}/checks` | — | `{ ok: true } & StartHomeworkCheckResult` | `503 queueFull` (`retryAfterSeconds: 120`) · `503 checkDisabled` · `404 homeworkNotFound` · `400 attachPhotosFirst` · `400 noNumbers` · `409 alreadyRunning` · `409 photosChanged` · `429 rateLimited` (hourly limit **or** daily budget) | `aiPerStudentHourlyLimit` (default 10) / hour; school-wide `aiDailyLimit` per fixed UTC day | `studentWork.startHomeworkCheck` | `student.homework` |
| `GET /student/homeworks/{assignmentId}/checks/latest` | — | `LatestHomeworkCheckResponse` (`check: null` = never checked) | `404 homeworkNotFound` | 120 / 60 s | `studentWork.getLatestHomeworkCheck` | `student.homework` (poll) |

### 2.7 Student live lesson (owner `03`, `A5` A.5; role S)

| Method + path | Request | 2xx response | Errors | Limit | Method | Screens |
|---|---|---|---|---|---|---|
| `GET /student/lesson` | — | `GetLessonResponse` (no lesson → both `null`; runs lazy finalisation first) | — | — | `studentWork.getLiveLesson` | `student.lesson` |
| `POST /student/lessons/{lessonId}/join` | — | `{ ok: true } & JoinLessonResult` | `404 lessonNotFound` · `409 lessonNotActive` | 30 / 60 s | `studentWork.joinLesson` | `student.lesson` (once per entry; failure never blocks the screen) |
| `POST /student/lessons/{lessonId}/items/{itemId}/submissions` | multipart: `files` × 1…3 | `{ ok: true } & SubmitLessonItemResult` | `503 queueFull` · `503 checkDisabled` · upload classes · `400 photoLimit` (`params.max = 3`) · `404 itemNotFound` · `409 lessonNotActive` · `409 alreadyAccepted` (`params.number`) · `409 extraPartLocked` · `409 alreadyRunning` · `409 concurrentChange` · `429 rateLimited` | `lessonCheckPerStudentHourlyLimit` (default 30) / hour; school-wide `lessonCheckDailyLimit` per fixed UTC day | `studentWork.submitLessonItem` | `student.lesson` |
| `GET /student/lessons/{lessonId}/state` | — | `LessonStateResponse` (valid in any status; `FINISHED` ends the live screen) | `404 lessonNotFound` | 120 / 60 s | `studentWork.getLiveLessonState` | `student.lesson` (poll) |

### 2.8 Teacher: students, homework, progress, report (owner `04`)

| Method + path | Roles | Request | 2xx response | Errors | Limit | Method | Screens |
|---|---|---|---|---|---|---|---|
| `GET /teacher/home` | T | — | `TeacherHomeSummary` | — | — | `teacherStudents.getTeacherHome` | `teacher.home` |
| `GET /teacher/students` | T | — | `{ students: TeacherStudentListItem[] }` (name asc) | — | — | `teacherStudents.listStudents` | `teacher.students` |
| `POST /teacher/students` | T | `StudentCreateInput` | `201 { student: CreatedStudent }` | `409 exists` | 20 / 10 min | `teacherStudents.createStudent` | `teacher.students` |
| `DELETE /teacher/students/{studentId}` | T own · D any | — | `{ ok: true }` | `404 studentNotFound` | — | `teacherStudents.deleteStudent` | `teacher.students`, `developer.accounts` |
| `POST /teacher/students/{studentId}/password` | T own · D any | `{ password: string }` | `{ ok: true }` | `404 studentNotFound` | 20 / 10 min | `teacherStudents.resetStudentPassword` | `teacher.students`, `developer.accounts` |
| `GET /teacher/students/{studentId}` | T own | — | `StudentCardResponse` | `404 studentNotFound` | — | `teacherStudents.getStudentCard` | `teacher.student.*` (card header) |
| `GET /teacher/students/{studentId}/homeworks` | T own | — | `TeacherStudentHomeworks` | `404 studentNotFound` | — | `teacherStudents.getStudentHomeworks` | `teacher.student.review` |
| `GET /teacher/students/{studentId}/assign-board` | T own | — | `AssignBoardResponse` | `404 studentNotFound` | — | `teacherStudents.getAssignBoard` | `teacher.student.assign` |
| `POST /teacher/homeworks` | T own student · D | `IssueHomeworkRequest` | `201 IssueHomeworkResponse` | `404 studentOrNumberNotFound` · `409 solvedConflict` (`params.numbers`, `details.conflictNumbers: string[]`) · `503 migrationMissing` | 120 / 60 s (shared with cancel) | `teacherStudents.issueHomework` | `teacher.student.assign` |
| `DELETE /teacher/homeworks/{assignmentId}` | T own student · D | — | `{ ok: true }` | `404 homeworkNotFound` · `503 migrationMissing` | same bucket | `teacherStudents.cancelHomework` | `teacher.student.review` |
| `PUT /teacher/students/{studentId}/numbers/{homeworkNumberId}/status` | T own (D → `403 unauthorized`) | `SetNumberStatusRequest` | `SetNumberStatusResponse` | `404 studentOrNumberNotFound` | 240 / 60 s | `teacherStudents.setNumberStatus` | `teacher.student.review` |
| `POST /teacher/students/{studentId}/number-statuses` | T own | `SetNumberStatusesRequest` | `SetNumberStatusesResponse` (one transaction, one history event per item) | `404 studentOrNumberNotFound` | same bucket | `teacherStudents.setNumberStatuses` | `teacher.student.review` ("accept AI verdicts", undo) |
| `PUT /teacher/students/{studentId}/deadlines` | T own | `SetDeadlinesRequest` | `SetDeadlinesResponse` | `404 studentOrNumberNotFound` · `503 migrationMissing` | 240 / 60 s | `teacherStudents.setNumberDeadlines` | no screen calls it in v1 (§5 item 10) |
| `GET /progress-history?studentId=&homeworkNumberId=&cursor=` | T own student · D any | — | `ProgressHistoryPage` (page size 20; `reference.kind === "homework"` never for D) | `400 paramsRequired` · `403 unauthorized` · `404 historyNotFound` | 90 / 60 s | `teacherStudents.getProgressHistory` | `teacher.student.review`, `planner.lessonBoard`, `developer.journal` |
| `GET /teacher/students/{studentId}/lessons` | T own | — | `{ lessons: TeacherStudentLesson[] }` (createdAt desc) | `404 studentNotFound` | — | `teacherStudents.listStudentLessons` | `teacher.student.lessons` |
| `GET /teacher/students/{studentId}/report.pdf?period=7d\|30d\|year` | T own · D | — | `application/pdf` | `404 studentNotFound` · `503 reportsBusy` (`retryAfterSeconds: 30`) · `500 exportFailed` | 5 / 5 min (shared with the group PDF); 2 exports in flight | `teacherStudents.downloadStudentReport` → `DownloadedFile` | `teacher.student.review` (action) → `shared.fileViewer` |

### 2.9 Developer accounts (owner `04` S9; role D)

| Method + path | Request | 2xx response | Errors | Limit | Method | Screens |
|---|---|---|---|---|---|---|
| `GET /developer/accounts` | — | `AccountsDirectory` | — | — | `accounts.getAccounts` | `developer.accounts` |
| `POST /developer/accounts` | `AccountCreateInput` (`teacherId` required for a STUDENT) | `201 { account: CreatedAccount }` | `404 teacherNotFound` · `409 exists` | 20 / 10 min | `accounts.createAccount` | `developer.accounts` |
| `PUT /developer/students/owners` | `{ changes: OwnerChange[] }` (non-empty, all-or-nothing) | `{ changed: number }` | `400 ownerInvalid` | — | `accounts.changeStudentOwners` | `developer.accounts` |
| `POST /developer/teachers/{teacherId}/password` | `{ password: string }` | `{ ok: true }` | `404 teacherNotFound` | 20 / 10 min | `accounts.resetTeacherPassword` | `developer.accounts` |
| `DELETE /developer/teachers/{teacherId}?transferToTeacherId=` | — | `{ ok: true; transferredStudents: number }` | `404 teacherNotFound` · `409 teacherTransfer` | — | `accounts.deleteTeacher` | `developer.accounts` |

Student deletion and student password reset on this screen call the two `teacherStudents` rows of §2.8.

### 2.10 Planner: lessons and homework drafts (owner `05`; roles T own · D any)

| Method + path | Request | 2xx response | Errors | Limit | Method | Screens |
|---|---|---|---|---|---|---|
| `GET /teacher/lessons` | — | `{ lessons: LessonListItem[]; serverNow: IsoDateTime }` (lazy finalisation first) | — | — | `planner.listLessons` | `planner.lessons` |
| `GET /teacher/lessons/new-options` | — | `LessonTargetChooser` | — | — | `planner.getLessonTargets` | `planner.lessonNew` (chooser) |
| `GET /teacher/lessons/new-form?groupId=` \| `?studentId=` | — | `LessonNewFormModel` (mode `student`: statements of the first compose topic only) | `404 groupNotFound` · `404 studentNotFound` | — | `planner.getLessonNewForm` | `planner.lessonNew` |
| `GET /teacher/number-bank` | — | `{ topics: LessonBankTopic[] }` (cache on the device) | — | — | `planner.getNumberBank` | `planner.lessonBoard`, `teacher.student.lessons` (manual add) |
| `POST /teacher/lessons` | `CreateLessonInput` | `201 CreateLessonResponse` (201 for every `plan` outcome, including `"unavailable"`) | `400 selectAtLeastOneStudent` · `400 tooManyStudents` (`params.max = 30`) · `400 invalidStartsAt` · `404 groupNotFound` · `500 createFailed` | 10 / 60 s (shared with regenerate); plan budget §2.14 | `planner.createLesson` | `planner.lessonNew` |
| `GET /teacher/lessons/{lessonId}` | — | `LessonBoardModel` | `404 lessonNotFound` (also when the id is a draft) | — | `planner.getLessonBoard` | `planner.lessonBoard` |
| `GET /teacher/lessons/{lessonId}/status` | — | `LessonPlanStatus` | `404 lessonNotFound` | — | `planner.getLessonStatus` | `planner.lessonBoard`, `teacher.student.lessons` (poll) |
| `GET /teacher/lessons/{lessonId}/live` | — | `LessonLiveSnapshot` | `404 lessonNotFound` | 120 / 60 s | `planner.getLessonLive` | `planner.lessonBoard` (fallback poll) |
| `PATCH /teacher/lessons/{lessonId}` | `{ startsAt: IsoDateTime }` | `ScheduleLessonResponse` | `400 invalidStartsAt` · `404 lessonNotFound` · `409 alreadyFinished` · `409 alreadyClosed` · `500 scheduleFailed` | 30 / 60 s | `planner.scheduleLesson` | `planner.lessonBoard` |
| `POST /teacher/lessons/{lessonId}/finish` | — | `FinishLessonResponse` | `404 lessonNotFound` · `409 lessonNotActive` · `500 finishFailed` | 30 / 60 s | `planner.finishLesson` | `planner.lessonBoard` |
| `DELETE /teacher/lessons/{lessonId}` | — | `{ ok: true }` | `404 lessonNotFound` | 30 / 60 s | `planner.deleteLesson` | `planner.lessonBoard` → `planner.lessons` |
| `PATCH /teacher/lessons/{lessonId}/participants/{participantId}/items` (alias for drafts: `PATCH /teacher/homework-plans/{planId}/participants/{participantId}/items`, same handler) | `SaveSetRequest` (each list ≤ 40) | `SaveSetResponse` | `400 numbersRequired` · `404 participantNotFound` · `409 homeworkAlreadyIssued` · `409 blockedNumbers` (`details.numbers: string[]`) | 60 / 60 s | `planner.saveLessonItems(lessonOrPlanId, …)` | `planner.lessonBoard`, `planner.draftBoard`, `teacher.student.lessons` |
| `POST /teacher/lessons/{lessonId}/participants/{participantId}/regenerate` (alias for drafts under `/teacher/homework-plans/{planId}/…`) | — | `200 RegenerateResponse` | `404 participantNotFound` · `409 homeworkAlreadyIssued` · `429 budgetExhausted` (no `retryAfterSeconds`; optional `details.resetAt`) · `503 plannerUnavailable` · `503 queueFull` | 10 / 60 s | `planner.regenerateParticipant(lessonOrPlanId, …)` | same three |
| `PATCH /teacher/lessons/{lessonId}/participants/{participantId}/items/{itemId}/result` | `SetItemResultRequest` | `SetItemResultResponse` | `400 invalidResult` · `404 itemNotFound` | 240 / 60 s | `planner.setItemResult` | `planner.lessonBoard`, `teacher.student.lessons` |
| `GET /teacher/lessons/{lessonId}/handout?format=pdf\|html&studentId=&answers=0\|1` | — | `application/pdf` (`format=pdf`) or `text/html` (`format=html`); never HTML for `format=pdf` | `404 lessonNotFound` · `404 noHomeworkHandout` · `503 pdfRendererUnavailable` (`format=pdf` only; the app then offers `format=html`) | 30 / 60 s | `planner.getHandoutUrl(lessonId, HandoutOptions)` (URL builder) | `planner.lessonBoard`, `teacher.student.lessons` → `shared.fileViewer` |
| `GET /teacher/homework-plans` | — | `{ plans: HomeworkPlanListItem[] }` | — | — | `planner.listHomeworkPlans` | `planner.drafts` |
| `GET /teacher/homework-plans/new-form?lessonId=[&studentId=]` \| `?groupId=` \| `?studentId=` | one of the three is required | `HomeworkPlanNewModel` | `404 lessonNotFound` · `404 groupNotFound` · `404 studentNotFound` | — | `planner.getHomeworkPlanNewForm` | `planner.draftNew` |
| `POST /teacher/homework-plans` | `CreateHomeworkPlanInput` | `201 CreateHomeworkPlanResponse` | `400 selectAtLeastOneStudent` · `400 tooManyStudents` · `400 topicAndDeadlineRequired` · `404 groupNotFound` · `404 topicNotFound` · `500 createFailed` | 10 / 60 s | `planner.createHomeworkPlan` | `planner.draftNew` |
| `GET /teacher/homework-plans/{planId}` | — | `HomeworkPlanBoardModel` | `404 draftNotFound` | — | `planner.getHomeworkPlanBoard` | `planner.draftBoard` |
| `GET /teacher/homework-plans/{planId}/status` | — | `HomeworkPlanStatus` | `404 draftNotFound` | — | `planner.getHomeworkPlanStatus` | `planner.draftBoard` (poll) |
| `POST /teacher/homework-plans/{planId}/issue` | `{ participantIds?: string[] }` (empty = all) | `200 IssueResult` (partial success is a 200; per-participant failures in `failed[]`) | `400 missingTopicOrDeadline` · `400 deadlinePassed` · `404 draftNotFound` | 30 / 60 s | `planner.issueHomeworkPlan` | `planner.draftBoard` |
| `DELETE /teacher/homework-plans/{planId}` | — | `{ ok: true }` | `404 draftNotFound` | 30 / 60 s | `planner.deleteHomeworkPlan` | `planner.draftBoard` → `planner.drafts` |

### 2.11 Groups, attendance, parent calls, statistics (owner `06`)

| Method + path | Roles | Request | 2xx response | Errors | Limit | Method | Screens |
|---|---|---|---|---|---|---|---|
| `GET /teacher/groups` | T · D | — | `GroupsListResponse` | — | — | `groups.listGroups` | `groups.list` |
| `POST /teacher/groups` | T (D → `403 unauthorized`) | `CreateGroupRequest` | `201 CreateGroupResponse` | — (`400 invalidData` for an empty name) | — | `groups.createGroup` | `groups.list` |
| `GET /teacher/groups/{groupId}` | T own · D | — | `GroupDetailResponse` | `404 groupNotFound` | — | `groups.getGroup` | `groups.detail` |
| `PATCH /teacher/groups/{groupId}` | T own · D | `RenameGroupRequest` | `RenameGroupResponse` | `404 groupNotFound` | — | `groups.renameGroup` | `groups.detail` |
| `DELETE /teacher/groups/{groupId}` | T own · D | — | `204` | `404 groupNotFound` | — | `groups.deleteGroup` | `groups.detail` → `groups.list` |
| `POST /teacher/groups/{groupId}/members` | T own · D | `AddMemberRequest` | `AddMemberResponse` | `404 groupNotFound` · `404 studentNotFound` | — | `groups.addGroupMember` | `groups.detail` |
| `DELETE /teacher/groups/{groupId}/members/{studentId}` | T own · D | — | `204` (idempotent) | `404 groupNotFound` | — | `groups.removeGroupMember` | `groups.detail` |
| `PATCH /teacher/students/{studentId}/ai-profile` | T own · D | `AiProfileRequest` (speed integer 1..10 or null; aiNote ≤ 300) | `AiProfileResponse` | `404 studentNotFound` | — | `groups.setStudentAiProfile` | `groups.detail` |
| `GET /teacher/groups/{groupId}/statistics` | T own · D | — | `GroupStatisticsResponse` | `404 groupNotFound` | — | `groups.getGroupStatistics` | `groups.detail` |
| `GET /teacher/groups/{groupId}/attendance?period=year\|30d\|7d` | T own · D | default `year` | `GroupAttendanceResponse` | `404 groupNotFound` | — | `groups.getGroupAttendance` | `groups.detail` |
| `PATCH /teacher/lessons/{lessonId}/participants/{participantId}/attendance` | T own · D | `SetAttendanceRequest` (lessons of kind `LESSON` only) | `SetAttendanceResponse` | `400 invalidMark` · `404 participantNotFound` | 240 / 60 s | `groups.setAttendance` | `groups.detail` (attendance table) |
| `GET /teacher/groups/{groupId}/attendance.pdf?period=7d\|30d\|year` | T own · D | — | `application/pdf` (Russian-only document) | `404 groupNotFound` · `500 exportFailed` | 5 / 5 min (shared with the student report) | `groups.downloadGroupAttendancePdf` → `DownloadedFile` | `groups.detail` (action) → `shared.fileViewer` |
| `GET /teacher/parent-calls` | T own students · D all | — | `ParentCallsOverviewResponse` | — | — | `groups.getParentCallsOverview` | `calls.list` |
| `GET /teacher/parent-calls/counts` | T · D | — | `ParentCallCounts` | — | — | `groups.getParentCallCounts` | `teacher.home` (widget; also inside `TeacherHomeSummary.calls`) |
| `GET /teacher/parent-calls/students/{studentId}/history?limit=100&before=<callId>` | T own · D | — | `ParentCallHistoryResponse` | `404 studentNotFound` | — | `groups.getParentCallHistory` | `calls.list` (full history) |
| `POST /teacher/parent-calls` | T own (D → `403 unauthorized`) | `RecordCallRequest` | `201 RecordCallResponse` | `400 studentRequired` · `400 outcomeRequired` · `404 studentNotFound` | 60 / 60 s | `groups.recordParentCall` | `calls.list` |
| `GET /developer/statistics/progress?studentId=` | D | optional `studentId` | `StatisticsProgressResponse` | — | — | `groups.getStatisticsProgress` | `stats.main` |
| `GET /developer/statistics/drilldown?topicId=&studentId=` | D | both required | `DrilldownResponse` | `400 paramsRequired` · `404 studentNotFound` · `500 loadFailed` | 120 / 60 s | `groups.getStatisticsDrilldown` | `stats.main` |
| `GET /developer/statistics/teachers` | D | — | `StatisticsTeachersResponse` (the only response with the **stored** `LessonStatus`) | — | — | `groups.getStatisticsTeachers` | `stats.main` |
| `GET /developer/statistics/platform` | D | — | `StatisticsPlatformResponse` | — | — | `groups.getStatisticsPlatform` | `stats.main` |

### 2.12 Content, import, dev panel, journal (owner `07`)

| Method + path | Roles | Request | 2xx response | Errors | Limit | Method | Screens |
|---|---|---|---|---|---|---|---|
| `GET /topics` | T · D | — | `{ topics: TopicListItem[] }` (displayOrder, createdAt) | — | — | `content.listTopics` | `content.topics` |
| `GET /topics/{topicId}` | T · D | — | `TopicDetail` | `404 topicNotFound` | — | `content.getTopic` | `content.topic`, `content.topicEdit` |
| `GET /topics/{topicId}/numbers/{number}` | T · D | digits, matched by normalised form | `NumberDetail` | `404 numberNotFound` | — | `content.getNumber` | `content.number` |
| `GET /topics/{topicId}/conditions` | T · D | — | `TopicConditions` | — (a failing query yields `{ conditions: {} }`) | 120 / 60 s | `content.getTopicConditions` → bare record | `teacher.student.assign`, `planner.lessonNew` (student mode) |
| `POST /topics` | D | `CreateTopicRequest` | `201 { topicId: string }` | `400 formInvalid` · `400 filesUnavailable` | 12 / 60 s | `content.createTopic` | `content.topics` (create block) |
| `POST /topics/{topicId}/numbers-preview` | D | `{ numbers: string }` | `NumbersChangePreview` | `400 emptyNumbers` · `400 numbersTwin` · `404 topicNotFound` | 60 / 60 s | `content.previewNumbersChange` | `content.topicEdit` |
| `PATCH /topics/{topicId}` | D | `UpdateTopicRequest` (files pre-uploaded through `POST /uploads`) | `TopicDetail` | `400 numbersTwin` · `409 numbersConfirm` · `409 numbersAssigned` (`details` = fresh `NumbersChangePreview`) · `404 topicNotFound` | — | `content.updateTopic` | `content.topicEdit` |
| `DELETE /topics/{topicId}/files/{kind}` | D | `kind`: `theory` \| `homework` | `{ ok: true; fileDeleted: "theory" \| "homework" }` (idempotent) | — | — | `content.deleteTopicFile` | `content.topicEdit` |
| `GET /topics/{topicId}/impact` | D | — | `TopicImpact` | `404 topicNotFound` | — | `content.getTopicImpact` | `content.topicEdit` (delete dialog) |
| `DELETE /topics/{topicId}?acknowledgedNumbersWithWork=<int>` | D | — | `{ ok: true; cleanedFileCount: number }` | `409 deleteChanged` (`details` = fresh `TopicImpact`) · `404 topicNotFound` | — | `content.deleteTopic` | `content.topicEdit` → `content.topics` |
| `PUT /topics/order` | D | `{ orderedTopicIds: string[] }` | `{ ok: true; orderedTopicIds: string[] }` | `409 listChanged` · `400 invalidRequest` | 30 / 60 s | `content.reorderTopics` → `string[]` | `content.topics` |
| `PUT /numbers/{homeworkNumberId}/condition` | D | `{ conditionLatex: string }` | `{ ok: true; conditionLatex: string }` | `400 latexRequired` · `404 numberNotFound` | 60 / 60 s (shared with delete) | `content.saveCondition` → `string` | `content.topicEdit`, `content.number` |
| `DELETE /numbers/{homeworkNumberId}/condition` | D | — | `{ ok: true }` | `404 numberNotFound` | same bucket | `content.deleteCondition` | same |
| `PUT /numbers/{homeworkNumberId}/answer` | D | `{ answerLatex: string }` | `{ ok: true; answerLatex: string }` | `400 latexRequired` · `404 numberNotFound` | 60 / 60 s (shared with delete) | `content.saveAnswer` → `string` | same |
| `DELETE /numbers/{homeworkNumberId}/answer` | D | — | `{ ok: true }` | `404 numberNotFound` | same bucket | `content.deleteAnswer` | same |
| `GET /topic-import/prompt` | D | — | `{ prompt: string; formatVersion: 1 }` | — | — | `content.getImportPrompt` → `string` | `content.topicEdit` / `content.topics` (import panel) |
| `POST /topic-import` | D | `ImportRequest` (`mode: "preview"` writes nothing) | preview → `ImportPreview`; apply → `ImportApplyResult` | `400 topicMissing` · `400 importInvalid` · `404 topicDeleted` · `413 fileTooBig` (> 2 MiB) · `500 createFailed` · `500 writeFailed` | 10 / 60 s | `content.previewImport`, `content.applyImport` | import panel |
| `GET /developer/panel` | D | — | `DeveloperPanelData` | — | — | `developer.getPanel` | `developer.panel` |
| `PUT /developer/settings` | D | `Partial<SiteSettings>` (server clamps) | `{ ok: true; message: string; settings: SiteSettings }` | `500 saveFailed` | — | `developer.saveSettings` | `developer.panel` (settings tab) |
| `POST /developer/actions/{action}` | D | `{action}`: `PanelAction` | `PanelActionResult` (`ok: false` is a normal 200; `reset-ai-budget` clears the homework-check budget only) | — | — | `developer.runAction` | `developer.panel` (actions tab) |
| `POST /developer/broadcast` | D | `BroadcastRequest` | `PanelActionResult & { count?: number }` | — | — | `developer.broadcast` | `developer.panel` (broadcast tab) |
| `GET /developer/journal?category=&actor=&action=&outcome=failed&days=&page=` | D | `JournalQuery` | `JournalPage` (strings rendered for `Accept-Language`) | — | — | `developer.getJournal` | `developer.journal` |

### 2.13 `ApiClient` composition (owner `A5` Part B)

```ts
export interface ApiClient {
  shell: ShellApi;                          // §2.1 – §2.4: 11 methods
  studentStudy: StudentStudyApi;            // §2.5: 4 methods
  studentWork: StudentHomeworkLessonApi;    // §2.6 – §2.7: 10 methods
  teacherStudents: TeacherStudentsApi;      // §2.8: 16 methods
  accounts: DeveloperAccountsApi;           // §2.9: 5 methods
  planner: TeacherPlannerApi;               // §2.10: 22 methods
  groups: GroupsCallsStatsApi;              // §2.11: 20 methods
  content: ContentApi;                      // §2.12 topics / numbers / import + POST /uploads: 19 methods
  developer: DeveloperApi;                  // §2.12 panel / journal: 5 methods
}
export interface AppServices { api: ApiClient; files: FileService; preferences: PreferencesStore }
```

- 112 methods, each named in the "Method" column above, each in exactly one member; screens call across
  members (`teacher.student.lessons` calls `planner.*`, `developer.accounts` calls `teacherStudents.*`).
- A typed method resolves to the wire body without `ok`. Nine signatures of the owner specs additionally
  unwrap a one-field body, and that form is canonical: `content.listTopics`, `content.getTopicConditions`,
  `content.reorderTopics`, `content.saveCondition`, `content.saveAnswer`, `content.getImportPrompt`,
  `planner.saveLessonItems`, `planner.listHomeworkPlans`, and the PDF downloads (`DownloadedFile`).
- Two implementations of the whole object: `MockApiClient` (one shared store, one event emitter, one limiter,
  role checks with the 401 / 403 split) and `HttpApiClient`. A completeness test asserts the 112 names.
- Polling, optimistic state and query invalidation live in screen hooks above the client (`A5` A.6).

Signatures (the wire types of §1 with `ok` removed; `Res<T>` = `Omit<T, "ok">`):

```ts
type Res<T> = Omit<T, "ok">;
type Abortable = { signal?: AbortSignal };
type RealtimeEvent = Exclude<DashboardRealtimeEvent, { kind: "connected" }>;

export interface ShellApi {
  getMeta(): Promise<MetaResponse>;
  login(input: LoginRequest): Promise<LoginResponse>;
  logout(): Promise<void>;
  getMe(): Promise<MeResponse>;
  updateProfile(input: UpdateProfileRequest): Promise<UpdateProfileResponse>;
  changePassword(input: ChangePasswordRequest): Promise<ChangePasswordResponse>;
  listNotifications(): Promise<NotificationsResponse>;
  markNotificationsRead(input: MarkNotificationsReadRequest): Promise<Res<MarkNotificationsReadResponse>>;
  getStreak(): Promise<StreakResponse>;                                       // STUDENT
  findNumber(number: string): Promise<NumberFindResult>;
  subscribeRealtime(listener: (event: RealtimeEvent) => void,
                    options?: { onState?: (state: RealtimeConnectionState) => void }): () => void;
}

export interface StudentStudyApi {
  getHomeworkDeadlines(): Promise<HomeworkDeadlinesResponse>;
  getTheoryLibrary(): Promise<TheoryLibraryResponse>;
  getNumberDetail(number: string): Promise<StudentNumberDetailResponse>;
  saveNumberNote(homeworkNumberId: string, note: string, signal?: AbortSignal): Promise<Res<SaveNoteResponse>>;
}

export interface StudentHomeworkLessonApi {
  listHomeworks(opts?: Abortable): Promise<GetHomeworksResponse>;
  getHomework(assignmentId: string, opts?: Abortable): Promise<GetHomeworkResponse>;
  uploadHomeworkPhotos(assignmentId: string, files: PhotoUpload[], opts?: UploadCallOptions): Promise<UploadHomeworkPhotosResult>;
  deleteHomeworkPhoto(assignmentId: string, photoId: string): Promise<DeleteHomeworkPhotoResult>;
  startHomeworkCheck(assignmentId: string): Promise<StartHomeworkCheckResult>;
  getLatestHomeworkCheck(assignmentId: string, opts?: Abortable): Promise<LatestHomeworkCheckResponse>;
  getLiveLesson(opts?: Abortable): Promise<GetLessonResponse>;
  joinLesson(lessonId: string): Promise<JoinLessonResult>;
  submitLessonItem(lessonId: string, itemId: string, files: PhotoUpload[], opts?: UploadCallOptions): Promise<SubmitLessonItemResult>;
  getLiveLessonState(lessonId: string, opts?: Abortable): Promise<LessonStateResponse>;
}

export interface TeacherStudentsApi {
  getTeacherHome(): Promise<TeacherHomeSummary>;
  listStudents(): Promise<{ students: TeacherStudentListItem[] }>;
  createStudent(input: StudentCreateInput): Promise<{ student: CreatedStudent }>;
  deleteStudent(studentId: string): Promise<void>;                            // TEACHER own · DEVELOPER any
  resetStudentPassword(studentId: string, password: string): Promise<void>;   // TEACHER own · DEVELOPER any
  getStudentCard(studentId: string): Promise<StudentCardResponse>;
  getStudentHomeworks(studentId: string): Promise<TeacherStudentHomeworks>;
  getAssignBoard(studentId: string): Promise<AssignBoardResponse>;
  issueHomework(input: IssueHomeworkRequest): Promise<IssueHomeworkResponse>;
  cancelHomework(assignmentId: string): Promise<void>;
  setNumberStatus(studentId: string, homeworkNumberId: string, status: HomeworkNumberStatus | null): Promise<Res<SetNumberStatusResponse>>;
  setNumberStatuses(studentId: string, changes: SetNumberStatusesRequest["changes"]): Promise<SetNumberStatusesResponse>;
  setNumberDeadlines(studentId: string, input: SetDeadlinesRequest): Promise<SetDeadlinesResponse>;
  getProgressHistory(studentId: string, homeworkNumberId: string, cursor?: string): Promise<ProgressHistoryPage>;
  listStudentLessons(studentId: string): Promise<{ lessons: TeacherStudentLesson[] }>;
  downloadStudentReport(studentId: string, period: ReportPeriod): Promise<DownloadedFile>;
}

export interface DeveloperAccountsApi {
  getAccounts(): Promise<AccountsDirectory>;
  createAccount(input: AccountCreateInput): Promise<{ account: CreatedAccount }>;
  changeStudentOwners(changes: OwnerChange[]): Promise<{ changed: number }>;
  resetTeacherPassword(teacherId: string, password: string): Promise<void>;
  deleteTeacher(teacherId: string, transferToTeacherId?: string): Promise<{ transferredStudents: number }>;
}

export interface TeacherPlannerApi {
  listLessons(): Promise<{ lessons: LessonListItem[]; serverNow: IsoDateTime }>;
  getLessonTargets(): Promise<LessonTargetChooser>;
  getLessonNewForm(target: { groupId: string } | { studentId: string }): Promise<LessonNewFormModel>;
  getNumberBank(): Promise<{ topics: LessonBankTopic[] }>;
  createLesson(input: CreateLessonInput): Promise<CreateLessonResponse>;
  getLessonBoard(lessonId: string): Promise<LessonBoardModel>;
  getLessonStatus(lessonId: string): Promise<LessonPlanStatus>;
  getLessonLive(lessonId: string): Promise<LessonLiveSnapshot>;
  scheduleLesson(lessonId: string, startsAt: IsoDateTime): Promise<Res<ScheduleLessonResponse>>;
  finishLesson(lessonId: string): Promise<Res<FinishLessonResponse>>;
  deleteLesson(lessonId: string): Promise<void>;
  saveLessonItems(lessonOrPlanId: string, participantId: string, main: string[], extra?: string[]): Promise<LessonBoardItem[]>;
  regenerateParticipant(lessonOrPlanId: string, participantId: string): Promise<Res<RegenerateResponse>>;
  setItemResult(lessonId: string, participantId: string, itemId: string, result: LessonItemResult | null): Promise<Res<SetItemResultResponse>>;
  getHandoutUrl(lessonId: string, opts: HandoutOptions): string;              // the only synchronous member (§5 item 12)
  listHomeworkPlans(): Promise<HomeworkPlanListItem[]>;
  getHomeworkPlanNewForm(src: { lessonId: string; studentId?: string } | { groupId: string } | { studentId: string }): Promise<HomeworkPlanNewModel>;
  createHomeworkPlan(input: CreateHomeworkPlanInput): Promise<CreateHomeworkPlanResponse>;
  getHomeworkPlanBoard(planId: string): Promise<HomeworkPlanBoardModel>;
  getHomeworkPlanStatus(planId: string): Promise<HomeworkPlanStatus>;
  issueHomeworkPlan(planId: string, participantIds?: string[]): Promise<Res<IssueResult>>;
  deleteHomeworkPlan(planId: string): Promise<void>;
}

export interface GroupsCallsStatsApi {
  listGroups(): Promise<GroupsListResponse>;
  createGroup(input: CreateGroupRequest): Promise<CreateGroupResponse>;       // TEACHER only
  getGroup(groupId: string): Promise<GroupDetailResponse>;
  renameGroup(groupId: string, input: RenameGroupRequest): Promise<RenameGroupResponse>;
  deleteGroup(groupId: string): Promise<void>;
  addGroupMember(groupId: string, input: AddMemberRequest): Promise<AddMemberResponse>;
  removeGroupMember(groupId: string, studentId: string): Promise<void>;
  setStudentAiProfile(studentId: string, input: AiProfileRequest): Promise<AiProfileResponse>;
  getGroupStatistics(groupId: string): Promise<GroupStatisticsResponse>;
  getGroupAttendance(groupId: string, period?: ReportPeriod): Promise<GroupAttendanceResponse>;
  setAttendance(lessonId: string, participantId: string, attendance: AttendanceStatus): Promise<Res<SetAttendanceResponse>>;
  downloadGroupAttendancePdf(groupId: string, period: ReportPeriod): Promise<DownloadedFile>;
  getParentCallsOverview(): Promise<ParentCallsOverviewResponse>;
  getParentCallCounts(): Promise<ParentCallCounts>;
  getParentCallHistory(studentId: string, page?: { limit?: number; before?: string }): Promise<ParentCallHistoryResponse>;
  recordParentCall(input: RecordCallRequest): Promise<RecordCallResponse>;    // TEACHER only
  getStatisticsProgress(studentId?: string): Promise<StatisticsProgressResponse>;      // DEVELOPER
  getStatisticsDrilldown(topicId: string, studentId: string): Promise<DrilldownResponse>;
  getStatisticsTeachers(): Promise<StatisticsTeachersResponse>;
  getStatisticsPlatform(): Promise<StatisticsPlatformResponse>;
}

export interface ContentApi {
  listTopics(): Promise<TopicListItem[]>;
  getTopic(topicId: string): Promise<TopicDetail>;
  getNumber(topicId: string, number: string): Promise<NumberDetail>;
  getTopicConditions(topicId: string): Promise<Record<string, string | null>>;
  uploadFile(file: FileUpload, opts?: UploadCallOptions & { previousFileId?: string }): Promise<StoredFileRef>;   // DEVELOPER from here down
  createTopic(input: CreateTopicRequest): Promise<{ topicId: string }>;
  previewNumbersChange(topicId: string, numbers: string): Promise<NumbersChangePreview>;
  updateTopic(topicId: string, input: UpdateTopicRequest): Promise<TopicDetail>;
  deleteTopicFile(topicId: string, kind: "theory" | "homework"): Promise<void>;
  getTopicImpact(topicId: string): Promise<TopicImpact>;
  deleteTopic(topicId: string, acknowledgedNumbersWithWork: number): Promise<void>;
  reorderTopics(orderedTopicIds: string[]): Promise<string[]>;
  saveCondition(homeworkNumberId: string, conditionLatex: string): Promise<string>;
  deleteCondition(homeworkNumberId: string): Promise<void>;
  saveAnswer(homeworkNumberId: string, answerLatex: string): Promise<string>;
  deleteAnswer(homeworkNumberId: string): Promise<void>;
  getImportPrompt(): Promise<string>;
  previewImport(input: { text: string; target: ImportTarget }): Promise<ImportPreview>;
  applyImport(input: { text: string; target: ImportTarget; overwriteFilled?: boolean }): Promise<ImportApplyResult>;
}

export interface DeveloperApi {
  getPanel(): Promise<DeveloperPanelData>;
  saveSettings(values: Partial<SiteSettings>): Promise<PanelActionResult & { settings: SiteSettings }>;
  runAction(action: PanelAction): Promise<PanelActionResult>;
  broadcast(input: BroadcastRequest): Promise<PanelActionResult & { count?: number }>;
  getJournal(query: JournalQuery): Promise<JournalPage>;
}
```

### 2.14 Limits that span endpoints

| Limit | Value | Behaviour |
|---|---|---|
| Three school-wide daily AI budgets: homework checks (`aiDailyLimit`), lesson checks (`lessonCheckDailyLimit`), plan generations (`aiPlanDailyLimit`) | **fixed** 24-hour window aligned to 00:00 UTC (03:00 Moscow) — not a rolling window | checks: `429 rateLimited` after the created row is rolled back; plans on create: `201 … plan: "budgetExhausted"`; on regenerate: `429 budgetExhausted` |
| AI check queue | 60 waiting checks (homework + lesson) | `503 queueFull`, `retryAfterSeconds: 120` |
| AI plan queue | 150 waiting generations | create: `plan: "queueFull"`; regenerate: `503 queueFull` |
| Photos | `maxPhotosPerAssignment` (setting, default 10) attached at once per homework; 3 per lesson submission; 15 MiB per request | `400 photoLimit`, `413 uploadTooLarge` |
| Runtime switches | `aiCheckAvailable`, `lessonCheckAvailable`, `aiAvailable`, `idleWarnMinutes`, `idleAlertMinutes`, `limits.maxPhotosPerAssignment` | delivered inside the payload of the screen that needs them, never in `GET /meta` |
| Notes | 240 chars (`limits.noteMaxLength`) | server trims and cuts |
| Sets | 40 items per part, 30 students per lesson, title ≤ 200, teacher note ≤ 500, duration and daily minutes 15..240 | `MetaResponse.limits` |

---

## 3. Screens and navigation

ScreenIds, role registration and entry points: `A2` B.4 – B.7. 36 registered screens: 6 shared, 8 student,
22 staff (17 available to a TEACHER, 9 to a DEVELOPER in v1). Dialogs, sheets and tabs inside a screen
belong to the screen and are specified by its owner spec.

### 3.1 Navigation structure (bottom tabs + stacks)

```
RootNavigator
├─ AuthStack ............ auth.launch → auth.login                    (no session / after sessionExpired / after logout)
└─ RoleRoot (chosen by user.role; the three trees are never mixed)
   └─ RootStack
      ├─ Tabs ........... bottom tab bar, one stack per tab            (below)
      ├─ shell.settings ........ push, opened by the gear
      ├─ shell.notifications ... modal sheet, opened by the bell
      ├─ shell.numberSearch .... modal, opened by the search action
      ├─ shared.fileViewer ..... full-screen modal (PDF / image / DOCX hand-off, photo pager)
      └─ cross-tab detail screens (several entry points, pushed above the tabs; listed per role)
```

Top app bar on every tab root: logo or section title · number-search action · bell with unread badge · gear.
The profile row (initials, name, role) and "Log out" live at the bottom of `shell.settings`; logout has no
confirmation, as on the site. Tab labels are the lower-case dictionary strings `dict.nav.<role>.<item>`;
section order is the site order. Tab icons are a mobile proposal (`01` §1.3).

**STUDENT** — 5 tabs + 1 "more" row:

| Tab (label key, ru) | Tab stack |
|---|---|
| 1 `nav.student.overview` обзор | `student.home` (→ `student.info`) |
| 2 `nav.student.lesson` урок | `student.lesson` (waiting ↔ live inside one screen) |
| 3 `nav.student.homeworks` дз | `student.homeworks` → `student.homework` |
| 4 `nav.student.deadlines` дедлайны | `student.deadlines` |
| 5 `nav.student.theory` теория | `student.theory` |
| — `nav.student.info` общая инфа (`placement: "more"`) | `student.info`, pushed from a row on `student.home` and a row in `shell.settings` |

Cross-tab screens in the student RootStack: `student.number` (reached only from `shell.numberSearch`). A
homework opened from Home, Deadlines or a notification switches to tab 3 and pushes `student.homework` over
the list, so "back" always returns to `student.homeworks`.

**TEACHER** — 4 tabs + "ещё / more":

| Tab (label key, ru) | Tab stack |
|---|---|
| 1 `nav.teacher.overview` обзор | `teacher.home` (cards lead to topics, students, calls) |
| 2 `nav.teacher.students` ученики | `teacher.students` → student card |
| 3 `nav.teacher.lessons` занятия | segmented root: `planner.lessons` («Уроки», default) \| `planner.drafts` («Домашние задания») |
| 4 `nav.teacher.calls` звонки | `calls.list` |
| 5 ещё / more (`placement: "more"`) | list of two sections: `content.topics` (темы) → `content.topic`; `groups.list` (группы) → `groups.detail` |

Cross-tab screens in the teacher RootStack (several entry points; the originating tab stays highlighted):
the student card (`teacher.student.review` · `.assign` · `.lessons` — one screen with three segments,
default review), `planner.lessonNew`, `planner.lessonBoard`, `planner.draftNew`, `planner.draftBoard`,
`content.number`.

**DEVELOPER** — exactly 5 tabs; home is topics:

| Tab (label key, ru) | Tab stack |
|---|---|
| 1 `nav.developer.topics` темы | `content.topics` → `content.topic` → `content.topicEdit` (import panel inside) |
| 2 `nav.developer.accounts` аккаунты | `developer.accounts` |
| 3 `nav.developer.calls` звонки | `calls.list` (read-only, all students) |
| 4 `nav.developer.statistics` статистика | `stats.main` |
| 5 `nav.developer.panel` дев-панель | `developer.panel` (segments status · actions · broadcast · settings) → `developer.journal` |

Cross-tab screens in the developer RootStack: `content.number` (from search), `content.topicEdit` (from a
content-gap row of `stats.main`).

Rules: a screen is mounted only in the navigator of a role it is registered for; a `NavTarget` whose screen
is not registered for the current role resolves to `null` and is rendered as plain text (no "bounce to home").
After deleting a lesson → `planner.lessons`; after deleting a draft → `planner.drafts`; after creating a lesson
or a draft → its board, for every `plan` outcome. Mock builds add one screen "Demo data" (`A6` §9.3) reachable
from `shell.settings`; it calls no endpoint.

### 3.2 Screen inventory with the endpoints each screen calls

Background calls made by the shell while a user is signed in (not repeated per screen): `GET /realtime`,
`GET /notifications` (badge), `GET /student/streak` (STUDENT), `POST /devices` after login (when push is built).

**Shared (all roles)**

| ScreenId | Site route | Owner | Reads | Writes |
|---|---|---|---|---|
| `auth.launch` | `/`, `/dashboard` | `01` §1.1 | `GET /meta`; `GET /me` when a token is stored | — |
| `auth.login` | `/login` | `01` §1.2 | `GET /meta` (`loginHelpContact`) | `POST /auth/login` |
| `shell.notifications` | bell panel | `01` §1.4 | `GET /notifications` | `POST /notifications/read` |
| `shell.settings` | `/{role}/settings` | `01` §1.5, `08` §9.2 | `GET /me` | `PATCH /me` · `POST /me/password` · `POST /auth/logout` (+ `DELETE /devices/{pushToken}`); interface block → `PreferencesStore` (no request) |
| `shell.numberSearch` | header control | `01` §3.9 | `GET /numbers/find` | — |
| `shared.fileViewer` | `/files/{fileId}` | `09` §5.2 | `GET /files/{fileId}[?thumb=1][&download=1]`; generated PDFs: student report, group attendance, lesson handout | — |

**STUDENT**

| ScreenId | Site route | Owner | Reads | Writes |
|---|---|---|---|---|
| `student.home` | `/student` | `02` S1 | `GET /student/homework-deadlines` · `GET /student/streak` | — |
| `student.lesson` | `/student/lesson` | `03` L1 / L2 | `GET /student/lesson` · `GET /student/lessons/{lessonId}/state` (poll) | `POST /student/lessons/{lessonId}/join` · `POST /student/lessons/{lessonId}/items/{itemId}/submissions` |
| `student.homeworks` | `/student/homeworks` | `03` H1 | `GET /student/homeworks` | — |
| `student.homework` | `/student/homeworks/{assignmentId}` | `03` H2 – H4 | `GET /student/homeworks/{assignmentId}` · `GET …/checks/latest` (poll) · `GET /files/{fileId}?thumb=1` | `POST …/photos` · `DELETE …/photos/{photoId}` · `POST …/checks` · `PUT /student/numbers/{homeworkNumberId}/note` |
| `student.deadlines` | `/student/deadlines` | `02` S4 | `GET /student/homework-deadlines` | — |
| `student.theory` | `/student/theory` | `02` S2 | `GET /student/theory` · `GET /files/{fileId}` | — |
| `student.info` | `/student/info` | `02` S5 | — (bundled tables and texts) | — |
| `student.number` | `/student/numbers/{number}` | `02` S3 | `GET /student/numbers/{number}` | `PUT /student/numbers/{homeworkNumberId}/note` |

**TEACHER** (the `content.*` and `calls.list` rows are shared with DEVELOPER, see the next table)

| ScreenId | Site route (`/teacher…`) | Owner | Reads | Writes |
|---|---|---|---|---|
| `teacher.home` | `/teacher` | `04` S1 | `GET /teacher/home` (`GET /teacher/parent-calls/counts` to refresh the calls widget) | — |
| `teacher.students` | `/students` | `04` S2 | `GET /teacher/students` | `POST /teacher/students` · `DELETE /teacher/students/{studentId}` · `POST /teacher/students/{studentId}/password` |
| `teacher.student.review` | `/students/{studentId}` | `04` S3, S4, S8 | `GET /teacher/students/{studentId}` · `GET …/homeworks` · `GET /progress-history` · `GET …/report.pdf?period=` · `GET /files/{fileId}[?thumb=1]` | `PUT …/numbers/{homeworkNumberId}/status` · `POST …/number-statuses` · `DELETE /teacher/homeworks/{assignmentId}` |
| `teacher.student.assign` | `/students/{studentId}/assign` | `04` S5 | `GET …/assign-board` · `GET /topics/{topicId}/conditions` | `POST /teacher/homeworks` (→ `planner.draftNew { studentId }` for "pick with AI") |
| `teacher.student.lessons` | `/students/{studentId}/lessons` | `04` S6 | `GET …/lessons` · `GET /teacher/lessons/{lessonId}/status` (poll 2500 ms) · `GET /teacher/number-bank` · handout | `PATCH …/participants/{participantId}/items` · `PATCH …/items/{itemId}/result` · `POST …/regenerate` (→ `planner.lessonNew { studentId }`, `planner.draftNew { lessonId, studentId }`) |
| `groups.list` | `/groups` | `06` §1.1 | `GET /teacher/groups` | `POST /teacher/groups` |
| `groups.detail` | `/groups/{groupId}` | `06` §1.2, §1.3 | `GET /teacher/groups/{groupId}` · `…/statistics` · `…/attendance?period=` · `…/attendance.pdf?period=` | `PATCH` / `DELETE /teacher/groups/{groupId}` · `POST …/members` · `DELETE …/members/{studentId}` · `PATCH /teacher/students/{studentId}/ai-profile` · `PATCH /teacher/lessons/{lessonId}/participants/{participantId}/attendance` |
| `planner.lessons` | `/lessons` | `05` §1.1 | `GET /teacher/lessons` | — |
| `planner.drafts` | `/homework-plans` | `05` §1.5 | `GET /teacher/homework-plans` | — |
| `planner.lessonNew` | `/lessons/new[?groupId=\|?studentId=]`, `/students/{studentId}/lessons/new` | `05` §1.2 (= `04` S7) | `GET /teacher/lessons/new-options` · `GET /teacher/lessons/new-form` · `GET /topics/{topicId}/conditions` | `POST /teacher/lessons` |
| `planner.lessonBoard` | `/lessons/{lessonId}` | `05` §1.3, §1.4 | `GET /teacher/lessons/{lessonId}` · `…/status` (poll 2000 ms) · `…/live` (fallback 15 s) · `GET /teacher/number-bank` · `…/handout` · `GET /progress-history` · `GET /files/{fileId}[?thumb=1]` | `PATCH /teacher/lessons/{lessonId}` · `POST …/finish` · `DELETE` · `PATCH …/items` · `POST …/regenerate` · `PATCH …/items/{itemId}/result` |
| `planner.draftNew` | `/homework-plans/new?lessonId=\|groupId=\|studentId=` | `05` §1.6 | `GET /teacher/homework-plans/new-form` | `POST /teacher/homework-plans` |
| `planner.draftBoard` | `/homework-plans/{planId}` | `05` §1.7 | `GET /teacher/homework-plans/{planId}` · `…/status` (poll 2000 ms) | `PATCH …/participants/{participantId}/items` · `POST …/regenerate` · `POST …/issue` · `DELETE /teacher/homework-plans/{planId}` |

**TEACHER and DEVELOPER (shared) and DEVELOPER only**

| ScreenId | Roles | Site route | Owner | Reads | Writes |
|---|---|---|---|---|---|
| `content.topics` | T (read-only) · D | `/topics` | `07` §1.1, §1.4, §1.5 | `GET /topics` · D: `GET /topic-import/prompt` | D: `POST /uploads` · `POST /topics` · `PUT /topics/order` · `POST /topic-import` (create mode) |
| `content.topic` | T · D | `/topics/{topicId}` | `07` §1.2 | `GET /topics/{topicId}` · `GET /files/{fileId}` | — |
| `content.topicEdit` | D | `/topics/{topicId}/edit` | `07` §1.3, §1.5 | `GET /topics/{topicId}` · `GET /topics/{topicId}/impact` · `GET /topic-import/prompt` | `POST …/numbers-preview` · `PATCH /topics/{topicId}` · `DELETE …/files/{kind}` · `DELETE /topics/{topicId}` · `POST /uploads` · `PUT` / `DELETE /numbers/{homeworkNumberId}/condition` · `PUT` / `DELETE …/answer` · `POST /topic-import` |
| `content.number` | T (read-only) · D | `/topics/{topicId}/numbers/{number}` | `07` §1.4b | `GET /topics/{topicId}/numbers/{number}` | D: `PUT` / `DELETE /numbers/{homeworkNumberId}/condition` · `…/answer` |
| `calls.list` | T (own, can record) · D (all, read-only) | `/calls` | `06` §1.4 | `GET /teacher/parent-calls` · `GET …/students/{studentId}/history` | T: `POST /teacher/parent-calls` |
| `developer.accounts` | D | `/accounts` | `04` S9 | `GET /developer/accounts` | `POST /developer/accounts` · `PUT /developer/students/owners` · `POST /developer/teachers/{teacherId}/password` · `DELETE /developer/teachers/{teacherId}` · `DELETE /teacher/students/{studentId}` · `POST /teacher/students/{studentId}/password` |
| `stats.main` | D | `/statistics` | `06` §1.6 | `GET /developer/statistics/progress` · `…/drilldown` · `…/teachers` · `…/platform` | — |
| `developer.panel` | D | `/panel` | `07` §1.9 | `GET /developer/panel` | `PUT /developer/settings` · `POST /developer/actions/{action}` · `POST /developer/broadcast` |
| `developer.journal` | D | `/panel/journal` | `07` §1.10 | `GET /developer/journal` · `GET /progress-history` | — |

Not registered for a DEVELOPER in v1 although the endpoints accept the role: `groups.*`, `planner.*`
(`A2` decisions N2 / N3). Never available to a DEVELOPER: `teacher.home`, `teacher.students`,
`teacher.student.*`; creating a group; recording a parent call; setting a number status or deadline.

### 3.3 Link targets

The app navigates only by `NavTarget` (§1.3), produced by the pure `resolveHrefTarget(href, role)` shared by the
server and the mock (`A2` B.6). Sources: notifications (`target`), number search (fields of `NumberFindResult`),
progress-history references (`reference.kind`).

| Source | Target | On arrival |
|---|---|---|
| notification `homework-assigned` | `student.homeworks` | — |
| notification `homework-checked` | `student.homework { assignmentId }` | `404 homeworkNotFound` (cancelled homework) → open `student.homeworks` |
| notification `parent_call_due` (TEACHER only) | `calls.list { studentId }` | row scrolled into view and flashed 1500 ms; nothing expanded |
| notification `dev_errors` | `developer.journal { outcome: "failed", days: 1 }` | applied as the initial, editable filter |
| notifications `dev_ai_budget_warn`, `dev_ai_budget_out` | `developer.panel { tab: "status" }` | — |
| notifications `dev_stale_checks`, `dev_storage` | `developer.panel { tab: "actions" }` | — |
| notification `broadcast` | `null` | only marked read |
| number search, STUDENT | `student.number { number }` | — |
| number search, TEACHER / DEVELOPER | `content.number { topicId, number }` | — |
| history reference `lesson` | `planner.lessonBoard { lessonId }` — TEACHER only; plain text for a DEVELOPER | — |
| history reference `homework` (TEACHER only) | `teacher.student.review { studentId, assignmentId }` | list scrolled to that assignment |

---

## 4. Resolved naming and shape conflicts

"Winner" is what the app and the mock implement. Items 1–27 are the contradictions reported by the review;
28–41 were found while unifying.

| # | Conflict | Winner | Why |
|---|---|---|---|
| 1 | Error envelope: nested object (`01`/`03`/`04`/`06`/`07`) vs `{ error: string }` (`08` §14) vs `{ error, code? }` (`09` App. C) | `ApiErrorBody = { error: { code, message, retryAfterSeconds?, params?, details? } }` on every non-2xx, binary endpoints and the SSE handshake included | The site returns text only; the app must branch without matching text. `08` / `09` described the site, not the mobile contract. `params` (template values) and `details` (machine data) unify `03`, `04`, `05` (`A1` A.2) |
| 2 | Code casing: camelCase vs `UPPER_SNAKE` (`02`, `03`) vs `snake_case` (`05`, `06`) | lower camelCase | It is the casing of every machine code the site already has (redirect codes, `PlanErrorCode`) and of the dictionary leaf keys that supply the messages (`A1` A.5). Conversion table: `A1` A.5 – A.10 |
| 3 | Wrong role: 403 vs 401 vs "either" | `403 unauthorized` (or `403 developerRightsRequired`); `401` only as `sessionExpired` | The app signs out on `sessionExpired`; with the site's conflated 401 a teacher's app calling a student endpoint would log itself out (`A1` A.1) |
| 4 | Number search: four paths and shapes | `GET /numbers/find?number=` → `NumberFindResult { number, topicId, topicTitle }`, one shape for all roles, method `shell.findNumber` | The control sits in the header of every page of every role, so the shell owns it; no `role` discriminator (the client knows its role), no `href`; `homeworkNumberId` comes with number detail (`A2` A.2.1) |
| 5 | Save a set: `PATCH → { items }` vs `PUT → { ok, items }` | `PATCH …/participants/{participantId}/items` → `{ ok, items: LessonBoardItem[] }`; the draft path is an alias of the same handler | The site route exports only `PATCH`; returning the whole set avoids a refetch; `LessonBoardItem` is a superset of what both callers need (`A2` A.2.2) |
| 6 | Create a lesson with AI unavailable: `planError: "unavailable"` vs `plan: "unavailable"` | `201 { lessonId, plan: CreatePlanOutcome }` | One field for all five outcomes; `planError` stays the name of the participant column (`A2` A.2.3) |
| 7 | Regenerate: `202 { ok }` vs `{ ok, planRequestedAt }` | `200 { ok, planRequestedAt }` | The client needs a server anchor for the 15-minute stale timer; the site answers 200 (`A2` A.2.4) |
| 8 | Item result: `{ result }` vs `{ ok, result, studentStatus }` | `{ ok, result, studentStatus }` | The handler already knows the resulting traffic light; returning it saves a refetch (`A2` A.2.5) |
| 9 | Handout: `/handout.pdf` vs `/handout?format=&studentId=&answers=` | `GET /teacher/lessons/{lessonId}/handout?format=pdf\|html&studentId=&answers=0\|1`; renderer down → `503 pdfRendererUnavailable` | One route covers PDF, print HTML, per-student and answer sheets; a typed 503 replaces content-type sniffing and the `X-Handout-Fallback` header (`A2` A.2.6) |
| 10 | Compose data: `…/lesson-compose` + `/teacher/number-bank` vs `/teacher/lessons/new-form` + `/lessons/{id}/bank` | `GET /teacher/lessons/new-options`, `GET /teacher/lessons/new-form?groupId=\|studentId=`, `GET /teacher/number-bank`; one screen `planner.lessonNew` | Both site pages render the same component with the same props; the bank does not depend on a lesson (`A2` A.2.7, N4) |
| 11 | Progress history path: nested under `/teacher/students/…` vs flat | `GET /progress-history?studentId=&homeworkNumberId=&cursor=` | Mirrors the site route and does not imply a `/teacher/students` resource, which a DEVELOPER does not have (`A2` A.2.8) |
| 12 | Topic statements: `{ conditions }` vs bare record; `/teacher/topics` vs `/topics` | wire `GET /topics/{topicId}/conditions` → `{ conditions: Record }`; single client method `content.getTopicConditions` returns the bare record | Topics are shared content owned by `07`; one method instead of three (`A2` A.2.9) |
| 13 | Thumbnail query: `?thumb=1` vs `?variant=thumb` | `?thumb=1` | It is what the site code reads; `09` contradicted its own §5.1 (`A2` A.2.10) |
| 14 | Upload: `(file, previousFileId)` → `UploadedFile` vs `(file, purpose)` → `FileRef` | multipart `file`, `previousFileId?` → `201 { file: StoredFileRef }` | The code has no `purpose` field and does replace `previousFileId`; `UploadedFile` and `StoredFileRef` were the same five fields — one name kept (`A2` A.2.11, `A4` §3.8) |
| 15 | Pre-login config: `/public/config` vs `/meta` vs `/teacher/planner/meta` | `GET /meta` (no auth) → `MetaResponse` with compile-time limits and `loginHelpContact`; no `features`, no runtime settings | Before login the site reads exactly one setting; runtime switches are computed per page for signed-in users, so they travel with screen payloads (`A2` A.2.12) |
| 16 | `GET /me`: `{ user, sessionExpiresAt }` vs flat `{ id, name, email, role }` | `MeResponse = { user: AuthenticatedUser; sessionExpiresAt }` | The settings screen needs `createdAt`; `ShellUser` is derived on the client (`A2` A.2.13) |
| 17 | Note save response: full vs `{ note }` | `{ ok, status, note, notesEnabled }`, owner `02`; `03` references it | It is the site body; `notesEnabled: false` must hide the note field (`A2` A.2.14) |
| 18 | Notifications: structured `target` vs web `href` mapped by the app; `{ ok, unreadCount }` vs `{ ok }` | `NotificationItem` with `params`, raw `href` (diagnostics) and server-computed `target: NavTarget \| null`; `POST /notifications/read → { ok, unreadCount }` | One pure mapping function shared by server and mock; the app never parses site paths; the badge updates without a second request (`A2` A.2.17, B.6) |
| 19 | `InterfacePreferences.theme` vs `themeMode` | `themeMode` | In the site code `theme` already means the resolved `light \| dark` value (`A4` §3.1) |
| 20 | `NavItem` shapes of `01` and `08` | `NavSection { screen: ScreenId; labelKey; webPath; placement: "tab" \| "more" \| "gear" }` | Neither old shape covered screens that exist only by URL; one registry (`A2` B.5, `A4` §3.2) |
| 21 | Aliases: `ISODateTime` / `IsoDateTime`; `LessonStatus` / `DerivedLessonStatus`; `AttendanceStatus` / `AttendanceValue`; `HomeworkPlanParamsJson` / `HomeworkPlanParams` | `IsoDateTime`; **both** lesson-status names with the code's meaning (stored vs computed) plus `AttendanceLessonStatus`; `AttendanceStatus`; `HomeworkPlanParams` | Majority spelling; the site code itself has two lesson-status concepts; the Prisma enum name; the stored-JSON name of `09` (`A4` §3.3 – §3.6) |
| 22 | `outputLocale` required vs optional | optional in both stored params types; absent from every request and response | Stored rows without the key exist and readers default to `ru`; the server takes it from the request locale (`A4` §3.6) |
| 23 | `PUT …/status`: `{ status, statusChangedAt, decision }` vs typed `{ status }` | the full body; typed method returns it without `ok` | General rule "typed result = wire body minus `ok`" (`A2` A.2.19, A.0.4) |
| 24 | Daily AI budget: rolling 24 h vs fixed window | fixed 24-hour window aligned to 00:00 UTC (03:00 Moscow), for all three budgets | The code (`A3`) |
| 25 | Mock lesson fixture and verdict scripting: `03` §6.5 vs `09` §2 | `09` §2 owns every fixture: `les_live` (started `T0 − 25 min`, 90 min) plus `les_dasha_soon` (`startsAt = T0 + 3 min`, 30 min) and the control `rearmSoonLesson`; verdicts by rule V `scriptVerdict(index, attempt) = ["CORRECT","INCORRECT","UNCERTAIN"][(index + attempt) % 3]`; fixed timings (`PENDING` 1 s, terminal at 8 s) | One shared, persisted store anchored at `T0` ("app start" is not a seed); the positional rule lets a homework be completed; the last-digit rule is retired (`A6` §1, §4 – §6) |
| 26 | Mock accounts: seed + one invented developer vs 14 users | the 14 accounts of `09` §2.3 (3 teachers, 10 students, `dev@example.com` / `developer123`); the three site seed logins are kept unchanged inside them | One owner for fixtures; needed for ownership-denial, empty-state and by-teacher states (`A6` §2) |
| 27 | "DTOs must use entity shapes" (`09` App. C) vs separate DTOs (`03`); two DTOs for the student homework list | Entities are store rows; DTOs are projections under P1–P7 (`StudentCheckDto.errorCode`, `LessonItemDto.closed` / `canSubmit` stand, both required). Two list DTOs on purpose: light `HomeworkDeadlineSummary` (home, calendar) and full `HomeworkSummaryDto`, which extends it | No site route returns a stored row to a student; the site itself has a light and a full reader because the full one is megabytes (`A4` §3.12, `A2` A.2.15) |
| 28 | `/me` (specs) vs `/auth/me` (unification brief) | canonical `GET /me` next to `PATCH /me` and `POST /me/password`; `GET /auth/me` is an alias of the same handler; the client calls `/me` | `/me` is one resource with three verbs; the alias costs nothing and keeps an `/auth/*`-only client working |
| 29 | Photo and file shapes: `HomeworkPhotoDto { url, thumbUrl }`, inline 5-field objects, `UploadedFile` | `AttachedPhoto`, `PhotoRef`, `StoredFileRef`, `FileRef`; no URL in any DTO | v1 has no signed URLs, and the mock has no URLs at all; the app builds sources with `FileService` (`A4` §3.8) |
| 30 | Path parameters: `:groupId` (`06`), `{id}` / `{pid}` / `{sid}` abbreviations | `{camelCaseName}` named after the site's dynamic segments | `A4` §3.11 |
| 31 | Methods declared in two interfaces (`getStreak`, `getTopicConditions`, `setAttendance`, `deleteStudent`, `resetStudentPassword`, `subscribe` / `subscribeRealtime`, `saveHomeworkPlanItems` / `saveLessonItems`, `getHome`, `lookupNumber`, `getFileUrl`, `getPlannerMeta`, `getLessonComposeContext`) | one owner each: `shell.getStreak`, `content.getTopicConditions`, `groups.setAttendance`, `teacherStudents.deleteStudent` / `resetStudentPassword`, `shell.subscribeRealtime`, `planner.saveLessonItems`; the rest removed | One method per operation, 112 in total (`A2` A.3, `A5` B.2, B.4) |
| 32 | Download result: `localUri` (`04`) vs `uri` (`06`) | `DownloadedFile = { uri, fileName }` | `A5` B.2.4 |
| 33 | Success flag: `ok` (most), `success: true` (`07` §6.3), `deleted: true` (`07` §6.2), 204 (`06`) | `ok: true` where a body exists; `204` stays for bodiless deletes; the client never reads the flag; `PanelActionResult.ok` is the one data field of that name | Site parity (`A2` A.0.4) and one spelling; `moved` of `PUT /topics/order` is dropped together with the optional `/topics/{topicId}/move` |
| 34 | Status of a creating POST: 201 (`04`, `05`, `07`) vs unstated (`06`) | `201` for every POST that creates a resource (`/teacher/groups`, `/teacher/parent-calls` included); `200` for action POSTs (`/finish`, `/regenerate`, `/issue`, `/join`, password resets) | Consistency; the status carries no information the client branches on |
| 35 | Progress-history error codes: `forbidden` / `notFound` (`04`, quoted in `A2`) vs `unauthorized` / `historyNotFound` (`A1`) | `403 unauthorized`, `404 historyNotFound`, `400 paramsRequired` | `A1` owns code naming (rules R2, R4) |
| 36 | Screen ids of `01` (`student.overview`, `teacher.lessons`, `developer.statistics`, …) vs the registry | `ScreenId` of `A2` B.5 (`student.home`, `planner.lessons`, `stats.main`, `content.topics`, `calls.list`, `shell.settings`) | One registry shared by navigation, notifications and deep links |
| 37 | `NotificationTarget` (`01`) vs `NavTarget` | `NavTarget` (`teacher.calls` → `calls.list`; panel `tab` always present) | `A2` A.2.17 |
| 38 | `planError: string \| null` (`04`, `09`) vs `PlanErrorRaw` (`05`); `LessonPlanStatus` declared twice | `PlanErrorRaw`; `LessonPlanStatus` and its endpoint owned by `05` only | `A4` §3.7 |
| 39 | `ComposeBoardTopic.conditionsLoaded` / `conditionLatex`: required (`04`) vs optional (`05`) | required on the wire; `true` on the first topic only; other topics fetch `GET /topics/{topicId}/conditions` on selection | The optional markers described a React prop type, not a response (`A4` §3.10) |
| 40 | `LessonBoardModel.bank` and `LessonDetail.planParams` in the board payload | removed: the bank is `GET /teacher/number-bank`; `planParams` never leaves the server | `A2` A.2.7, `A4` §3.6 |
| 41 | `scheduleLesson`, `finishLesson`, `deleteTeacher`, `setNumberStatuses`, `setNumberDeadlines`, `broadcast`: typed `Promise<void>` / narrower type although the wire body carries data | typed result = wire body without `ok` (`{ status, reopened }`, `{ finalized }`, `{ transferredStudents }`, `{ results }`, `{ deadlineAt, homeworkNumberIds }`, `PanelActionResult & { count? }`) | The general rule of `A2` A.0.4; `A5` B.2.5 applied it to four of them, this file to `scheduleLesson` and `broadcast` as well |

Spellings that deliberately stay as their owner wrote them (they are data values, not error codes):
`ProgressSource` / `ProgressDecisionReason` (`homework_check`, `downgrade_blocked` — stored strings),
`NotificationType` (`homework-assigned`, `parent_call_due` — stored strings), `AttentionFlag.code`
(`overdue_homework`, `not_started`, `red_month`), `PanelAction` path values (`reset-ai-budget`).

---

## 5. Decisions that still need the product owner

Working defaults are what §1 – §3 state; none of them blocks building the mock.

1. **How the mobile API gets built while the site is not touched** (`A1` B.6 – B.7): the whole of §2 is a target
   contract; most reads have no JSON route on the site today.
2. **Tab placement** (`A2` N6): §3.1 follows `01` (student: info under "more"; teacher: topics and groups under
   "more"). `08` proposed a different split.
3. **DEVELOPER without planner and groups screens in v1** (`A2` N2 / N3).
4. **Homework drafts list as the second segment** of the teacher's "занятия" section (`A2` N1).
5. **403 for a wrong role** instead of the site's 401 (item 3 of §4) — confirm for the future server.
6. **`format=pdf` answers 503** instead of falling back to an HTML page (item 9 of §4).
7. **No signed file URLs and no file-metadata endpoint** in v1; viewers must accept headers or a downloaded file.
8. **Push and the polling fallback** (`POST /devices`, `DELETE /devices/{pushToken}`, `GET /sync/changes`): in the
   contract, not in the 112-method client; need a device table and a push provider on the server.
9. **`GET /auth/me` alias** (item 28 of §4): keep it, or keep `/me` only.
10. **`PUT /teacher/students/{studentId}/deadlines`**: the site route exists but nothing calls it — keep the
    method or drop it from v1 (`A5` B.7 item 4).
11. **Member object vs flat client** (`api.studentWork.getHomework` vs `api.getHomework`, `A5` B.7 item 1).
12. **Generated documents in the mock**: `planner.getHandoutUrl` is a synchronous URL builder; the suggestion is
    `downloadHandout(lessonId, opts): Promise<DownloadedFile>` like the two PDF downloads (`A5` B.7 item 2).
13. **404 instead of an empty body** on the two student poll endpoints for a foreign id (`A5` B.7 item 3).
14. **`FileService.download` for a photo**: `AttachedPhoto` has no `size`; §1.3 accepts a reference without it
    (`A5` B.7 item 7).
15. **`CheckErrorCode` value `"unknown"`** vs the dictionary key `fallback` (`A4` §8 item 3).
16. **Stored lesson status in the developer statistics** — site parity, or show the derived status (`A4` §8 item 1).
17. **Login rate limits keyed by client address** and the **2-stream realtime cap** shared with browser tabs
    (`A6` §14 items 3 – 4).
18. **Dev-panel budgets**: keep the trailing-24 h tile only, or add the real buckets `aiBudgets` (`A3` §11).
