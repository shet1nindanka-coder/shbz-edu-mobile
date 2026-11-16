/**
 * Shared wire and client types.
 * Source: docs/spec/00-unified-contract.md §1.3 (error envelope: 90-addendum-1 A.2; files: 90-addendum-4 §3.8;
 * navigation: 90-addendum-2 B.5 – B.6; realtime: 90-addendum-6 §8.3).
 *
 * The `ApiError` class lives in `src/api/errors.ts`; `FileService` and `PreferencesStore` live in
 * `src/api/client.ts` (next to `ApiClient`, not members of it).
 */
import type { NotificationParams, StoredFile } from "./entities";
import type {
  DateKey,
  HintsMode,
  IsoDateTime,
  Locale,
  StudentStreakColorTier,
  ThemeMode,
  UserRole,
} from "./primitives";

// ───────────────────────────── errors ─────────────────────────────

export const GLOBAL_ERROR_CODES = [
  "sessionExpired",
  "unauthorized",
  "developerRightsRequired",
  "invalidData",
  "rateLimited",
  "serviceUnavailable",
  "migrationMissing",
  "saveFailed",
  "deleteFailed",
  "internalError",
] as const;
/**
 * Codes with the same meaning on every endpoint (00 §0):
 * - `sessionExpired` 401 — no valid session; the ONLY code that signs the user out.
 * - `unauthorized` 403 — valid session, wrong role. Never signs out; the client re-fetches `GET /me`.
 * - `developerRightsRequired` 403 — developer-only endpoint.
 * - `invalidData` 400 — undifferentiated bad input.
 * - `rateLimited` 429 — `retryAfterSeconds` always present.
 * - `serviceUnavailable` 503 — `retryAfterSeconds: 5` (limiter store failure).
 * - `migrationMissing` 503 — `params.what`; `details.deadlinesEnabled: false` where applicable.
 * - `saveFailed` / `deleteFailed` / `internalError` 500 — show `message`, keep input, offer manual retry.
 */
export type GlobalErrorCode = (typeof GLOBAL_ERROR_CODES)[number];

export const NOT_FOUND_ERROR_CODES = [
  "studentNotFound",
  "topicNotFound",
  "numberNotFound",
  "homeworkNotFound",
  "lessonNotFound",
  "groupNotFound",
  "draftNotFound",
  "studentOrNumberNotFound",
  "participantNotFound",
  "itemNotFound",
  "photoNotFound",
  "historyNotFound",
  "fileNotFound",
  "teacherNotFound",
] as const;
/** 404 — missing OR not owned (a foreign resource is never a 403). Entity-specific, no single global code. */
export type NotFoundErrorCode = (typeof NOT_FOUND_ERROR_CODES)[number];

export const UPLOAD_ERROR_CODES = [
  "uploadInvalid",
  "uploadNotMultipart",
  "uploadLengthRequired",
  "uploadTooLarge",
  "uploadUnsupportedType",
  "uploadBadName",
  "uploadRejected",
] as const;
/**
 * Shared upload error classes of EVERY upload endpoint (student photos, lesson submissions, `POST /uploads`):
 * `uploadInvalid` 400 · `uploadNotMultipart` 415 · `uploadLengthRequired` 411 · `uploadTooLarge` 413 ·
 * `uploadUnsupportedType` 400 · `uploadBadName` 400 (`params.max = 255`) · `uploadRejected` 400.
 */
export type UploadErrorCode = (typeof UPLOAD_ERROR_CODES)[number];

/**
 * Endpoint-specific codes: the "Errors" column of 00 §2, grouped by owner section.
 * Lower camelCase = leaf key of the site dictionary entry that supplies the text.
 */
export type EndpointErrorCode =
  | NotFoundErrorCode
  | UploadErrorCode
  // §2.1 auth, profile
  | "empty" /* 400 login: empty login / password */
  | "invalidCredentials" /* 401 login — the single 401 that does NOT sign out */
  | "database" /* 503 login */
  | "infoInvalid" /* 400 PATCH /me */
  | "passwordInvalid" /* 400, details.problem: PasswordProblem */
  | "passwordMismatch" /* 400 */
  | "passwordCurrent" /* 403 wrong current password */
  // §2.3 realtime handshake (reported through onState, never thrown)
  | "tooManyConnections" /* 429, retryAfterSeconds: 5 */
  // §2.4 uploads, number search
  | "fileRequired" /* 400 */
  | "uploadFailed" /* 500 */
  | "invalidNumber" /* 400 */
  | "searchFailed" /* 500 */
  // §2.5 student study
  | "statusReadOnly" /* 403 note body carries a `status` key */
  // §2.6 student homework
  | "photoLimit" /* 400, params.max */
  | "concurrentChange" /* 409 */
  | "queueFull" /* 503; student checks: retryAfterSeconds 120 */
  | "checkDisabled" /* 503, not transient */
  | "attachPhotosFirst" /* 400 */
  | "noNumbers" /* 400 */
  | "alreadyRunning" /* 409 */
  | "photosChanged" /* 409 */
  // §2.7 student live lesson
  | "lessonNotActive" /* 409 */
  | "alreadyAccepted" /* 409, params.number */
  | "extraPartLocked" /* 409 */
  // §2.8 teacher students
  | "exists" /* 409 login already taken */
  | "solvedConflict" /* 409, params.numbers, details.conflictNumbers: string[] */
  | "paramsRequired" /* 400 */
  | "reportsBusy" /* 503, retryAfterSeconds 30 */
  | "exportFailed" /* 500 */
  // §2.9 developer accounts
  | "ownerInvalid" /* 400 */
  | "teacherTransfer" /* 409 teacher still has students and no valid transfer target */
  // §2.10 planner
  | "selectAtLeastOneStudent" /* 400 */
  | "tooManyStudents" /* 400, params.max = 30 */
  | "invalidStartsAt" /* 400 */
  | "createFailed" /* 500 */
  | "alreadyFinished" /* 409 */
  | "alreadyClosed" /* 409 */
  | "scheduleFailed" /* 500 */
  | "finishFailed" /* 500 */
  | "numbersRequired" /* 400 */
  | "homeworkAlreadyIssued" /* 409 */
  | "blockedNumbers" /* 409, details.numbers: string[] */
  | "budgetExhausted" /* 429 WITHOUT retryAfterSeconds; optional details.resetAt */
  | "plannerUnavailable" /* 503, not transient */
  | "invalidResult" /* 400 */
  | "noHomeworkHandout" /* 404 handout requested for a homework draft */
  | "pdfRendererUnavailable" /* 503 format=pdf only; offer format=html */
  | "topicAndDeadlineRequired" /* 400 */
  | "missingTopicOrDeadline" /* 400 */
  | "deadlinePassed" /* 400 */
  // §2.11 groups, calls, statistics
  | "invalidMark" /* 400 */
  | "studentRequired" /* 400 */
  | "outcomeRequired" /* 400 */
  | "loadFailed" /* 500 */
  // §2.12 content, import
  | "formInvalid" /* 400 */
  | "filesUnavailable" /* 400 */
  | "emptyNumbers" /* 400 */
  | "numbersTwin" /* 400 */
  | "numbersConfirm" /* 409, details = fresh NumbersChangePreview */
  | "numbersAssigned" /* 409, details = fresh NumbersChangePreview */
  | "deleteChanged" /* 409, details = fresh TopicImpact */
  | "listChanged" /* 409 */
  | "invalidRequest" /* 400 */
  | "latexRequired" /* 400 */
  | "topicMissing" /* 400 */
  | "importInvalid" /* 400 */
  | "topicDeleted" /* 404 */
  | "fileTooBig" /* 413, import text > 2 MiB */
  | "writeFailed" /* 500 */;

/** Every code this app version knows by name. */
export type KnownApiErrorCode = GlobalErrorCode | EndpointErrorCode;

/**
 * Code of an error envelope. Canonically `GlobalErrorCode | string` (00 §1.3): a newer server may send a code
 * this build does not know, so any string is accepted; the `string & {}` arm keeps literal autocomplete.
 */
export type ApiErrorCode = KnownApiErrorCode | (string & {});

/** Client-only code of `ApiError` with `status: 0`: no response, timeout, aborted. Never sent by a server. */
export type NetworkErrorCode = "network";

/** Values substituted into the dictionary template of `message` (e.g. `{ max: 10 }`, `{ number: "0512" }`). */
export type ApiErrorParams = Record<string, string | number>;
/** Machine data the UI acts on (e.g. `{ conflictNumbers: string[] }`, a fresh preview / impact object). */
export type ApiErrorDetails = Record<string, unknown>;

/** Body of EVERY non-2xx response, binary endpoints and the SSE handshake included. */
export type ApiErrorBody = {
  error: {
    /** Lower camelCase, for branching only. */
    code: ApiErrorCode;
    /** Localized by `Accept-Language`, shown verbatim. */
    message: string;
    /** Mirrors the `Retry-After` header. */
    retryAfterSeconds?: number;
    params?: ApiErrorParams;
    details?: ApiErrorDetails;
  };
};

// ───────────────────────────── files ─────────────────────────────

/** What a viewer needs. A response never contains a URL — bytes come only from `GET /files/{fileId}` via `FileService`. */
export type FileRef = Pick<StoredFile, "id" | "originalName" | "mimeType" | "size">;

/** Topic files and the upload result. */
export type StoredFileRef = FileRef & { uploadedAt: IsoDateTime };

/** A solution photo referenced by its file id only (check snapshot photo). */
export interface PhotoRef {
  /** `StoredFile` id — what `FileService` takes. */
  fileId: string;
  originalName: string;
}

/** A photo currently attached to a homework. */
export interface AttachedPhoto extends PhotoRef {
  /** `HomeworkSubmissionPhoto` id — what `deleteHomeworkPhoto` takes. */
  id: string;
  /** "image/png" | "image/jpeg" */
  mimeType: string;
  createdAt: IsoDateTime;
}

/** Result of a client method that downloads a generated document. `uri` = local file URI in the app cache. */
export type DownloadedFile = { uri: string; fileName: string };

/** A local file handed to an upload (multipart) method. */
export type FileUpload = {
  /** Local file URI. */
  uri: string;
  /** Original file name, 1..255 chars, with an allowed extension. */
  name: string;
  mimeType: string;
  /** Bytes, > 0. */
  size: number;
};

/** One picked / captured image. `name` must end in .png / .jpg / .jpeg. */
export type PhotoUpload = FileUpload & { mimeType: "image/png" | "image/jpeg" };

export type UploadCallOptions = {
  /** 0..100 integer: bytes sent / total. */
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
};

// ───────────────────────────── session ─────────────────────────────

export type AuthenticatedUser = { id: string; name: string; email: string; role: UserRole; createdAt: IsoDateTime };

export type LoginRequest = { login: string; password: string; deviceName?: string };
/** `token` is the opaque bearer token; kept in secure storage only. */
export type LoginResponse = { token: string; expiresAt: IsoDateTime; user: AuthenticatedUser };
export type MeResponse = { user: AuthenticatedUser; sessionExpiresAt: IsoDateTime };
export type ChangePasswordRequest = { currentPassword: string; newPassword: string; confirmPassword: string };
/** Rotated session: every other session of the user is deleted and the stored token must be replaced. */
export type ChangePasswordResponse = { token: string; expiresAt: IsoDateTime };

// ───────────────────────────── pre-login meta ─────────────────────────────

/** Compile-time constants + the one public setting. Runtime switches travel with screen payloads, never here. */
export interface MetaResponse {
  serverNow: IsoDateTime;
  timeZone: "Europe/Moscow";
  locales: ["ru", "en"];
  /** "" hides the help line on the login screen. */
  loginHelpContact: string;
  limits: {
    uploadMaxBytes: 15728640;
    allowedUploadExtensions: [".pdf", ".docx", ".png", ".jpg", ".jpeg"];
    photoExtensions: [".png", ".jpg", ".jpeg"];
    lessonSubmissionMaxPhotos: 3;
    parentCallDueDays: 30;
    parentCallOverdueDays: 45;
    lessonDurationMinutes: { min: 15; max: 240; default: 60 };
    homeworkDailyMinutes: { min: 15; max: 240; default: 60 };
    speed: { min: 1; max: 10 };
    maxStudentsPerLesson: 30;
    maxItemsPerPart: 40;
    maxTitleLength: 200;
    maxTeacherNoteLength: 500;
  };
}

// ───────────────────────────── device preferences (never sent to a server in v1) ─────────────────────────────

/** Per-device, never stored on the account, survives logout. */
export interface InterfacePreferences {
  locale: Locale;
  themeMode: ThemeMode;
  hints: HintsMode;
}

export const DEFAULT_INTERFACE_PREFERENCES: InterfacePreferences = { locale: "ru", themeMode: "system", hints: "off" };

// ───────────────────────────── navigation ─────────────────────────────

/** The 36 registered screens (6 shared, 8 student, 22 staff). Registry: `src/navigation/registry.ts`. */
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
export type NavSection = {
  screen: ScreenId;
  /** Dictionary path under `dict`, e.g. "nav.student.overview". */
  labelKey: string;
  /** Site route, kept for traceability only. */
  webPath: string;
  /** "gear" = `shell.settings`. */
  placement: "tab" | "more" | "gear";
};

/** Tabs of the developer panel. */
export type DeveloperPanelTab = "status" | "actions" | "broadcast" | "settings";

/** The only thing the app navigates by (notifications, history references, search results). */
export type NavTarget =
  | { screen: "student.homeworks" }
  | { screen: "student.homework"; assignmentId: string }
  | { screen: "student.number"; number: string }
  | { screen: "content.number"; topicId: string; number: string }
  | { screen: "calls.list"; studentId: string }
  | { screen: "developer.panel"; tab: DeveloperPanelTab }
  | { screen: "developer.journal"; outcome?: "failed"; days?: number }
  | { screen: "planner.lessonBoard"; lessonId: string }
  | { screen: "teacher.student.review"; studentId: string; assignmentId?: string };

// ───────────────────────────── notifications ─────────────────────────────

export type NotificationItem = {
  id: string;
  /** A `NotificationType` or an unknown string from a newer server. */
  type: string;
  /** Rendered for `Accept-Language`. */
  title: string;
  body: string | null;
  /** Lets the app re-render the text on a language switch. */
  params: NotificationParams | null;
  /** Stored site path, diagnostics only — never parsed by the app. */
  href: string | null;
  /** `resolveHrefTarget(href, role)`, computed by the server / mock; null = only mark read. */
  target: NavTarget | null;
  readAt: IsoDateTime | null;
  createdAt: IsoDateTime;
};

export type NotificationsResponse = {
  /** Newest 20. */
  notifications: NotificationItem[];
  /** Count of ALL unread notifications. */
  unreadCount: number;
};

/** Shape of `params` per known notification type. */
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

/** `POST /devices` body. In the contract, but `ApiClient` v1 has no method for push registration. */
export type PushDeviceRequest = { pushToken: string; platform: "ios" | "android"; locale: Locale };

// ───────────────────────────── realtime ─────────────────────────────

export type DashboardRealtimeEvent =
  /** First frame of a stream; swallowed by the client. */
  | { kind: "connected"; occurredAt: IsoDateTime }
  | { kind: "students-changed"; occurredAt: IsoDateTime }
  | { kind: "topic-content-changed"; occurredAt: IsoDateTime; topicId?: string }
  | { kind: "student-progress-changed"; occurredAt: IsoDateTime; studentId: string; topicId?: string }
  | { kind: "student-deadlines-changed"; occurredAt: IsoDateTime; studentId: string; topicId?: string }
  | { kind: "lesson-activity"; occurredAt: IsoDateTime; lessonId: string; teacherId: string; studentId?: string };

/** What a `subscribeRealtime` listener receives: the five event kinds, never `connected`. */
export type RealtimeEvent = Exclude<DashboardRealtimeEvent, { kind: "connected" }>;

export type RealtimeConnectionState =
  | { status: "connecting" }
  /** After the swallowed `connected` frame. */
  | { status: "open"; connectedAt: IsoDateTime }
  /** Refused handshake; retried with backoff 5, 10, 20, 40, 60 s and never shown to the user. */
  | { status: "refused"; code: "tooManyConnections" | "rateLimited" | "serviceUnavailable"; retryAt: IsoDateTime }
  /** No listeners, app in background, or signed out. */
  | { status: "closed" };

/** `GET /sync/changes?since=` body. In the contract, but `ApiClient` v1 has no method for it. */
export type SyncChangesResponse = { serverTime: IsoDateTime; changed: RealtimeEvent["kind"][] };

// ───────────────────────────── streak / timeline ─────────────────────────────

export type TimelineEntry = { date: DateKey; closedCount: number; redCount: number };

export type StudentStreak = {
  currentStreak: number;
  bestStreak: number;
  solvedToday: number;
  solvedThisWeek: number;
  activeDaysThisWeek: number;
  /** 7 entries, last = today. `dayLabel` is ignored by the client (it formats the day itself). */
  dailyActivity: { date: DateKey; dayLabel: string; count: number }[];
};

/** Computed on the client from `StudentStreak.currentStreak`. */
export type StudentStreakColorMeta = {
  tier: StudentStreakColorTier;
  currentThreshold: number | null;
  nextThreshold: number | null;
  daysToNextThreshold: number | null;
};

// ───────────────────────────── number search (one shape for all roles) ─────────────────────────────

export type NumberFindResult = {
  /** Recorded spelling (leading zeros kept). */
  number: string;
  topicId: string;
  topicTitle: string;
};
