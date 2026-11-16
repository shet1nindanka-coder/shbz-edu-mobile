/**
 * Stored entities — rows of the mock store / database.
 * Source: docs/spec/00-unified-contract.md §1.2 (field comments, limits, delete rules: 09 §1.2 – §1.3;
 * visibility per role: 09 §1.5).
 *
 * NEVER returned as is: responses are projections (the DTO / Response / Model / Item types of the owner
 * files). An entity name is never reused for a projection, and a field the caller's role may not see is
 * absent from the DTO type.
 *
 * Schema-only tables with no code and no screens stay out of the mobile domain layer: `Test*`, `TopicMastery`.
 */
import type {
  AssignmentReason,
  AttendanceStatus,
  AuditCategory,
  ErrorKind,
  HomeworkNumberStatus,
  IsoDateTime,
  LessonItemResult,
  LessonKind,
  LessonStatus,
  Locale,
  NotificationType,
  ParentCallOutcome,
  PlanErrorRaw,
  ProgressDecisionReason,
  ProgressSource,
  ReasoningEffort,
  SolutionCheckStatus,
  SolutionVerdict,
  Subject,
  UserRole,
} from "./primitives";

// ───────────────────────────── people ─────────────────────────────

export interface User {
  id: string;
  name: string;
  /** The LOGIN (not necessarily a mailbox). */
  email: string;
  role: UserRole;
  /** Owner teacher of a STUDENT; null for staff and for unattributed students. */
  teacherId: string | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface StudentProfile {
  id: string;
  userId: string;
  subject: Subject | null;
  grade: number | null;
  levelScore: number | null;
  placedAt: IsoDateTime | null;
  /** 1..10, set by the teacher; hint for the AI planner. Never to STUDENT. */
  speed: number | null;
  /** Teacher's hint for the AI planner (≤ 300 chars). Never to STUDENT. */
  aiNote: string | null;
  aiPortrait: string | null;
  portraitUpdatedAt: IsoDateTime | null;
  /** A student is in at most one group. */
  groupId: string | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface StudentGroup {
  id: string;
  name: string;
  subject: Subject;
  /** 1..11 */
  grade: number | null;
  teacherId: string;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

/** Append-only journal of calls to parents. */
export interface ParentCallLog {
  id: string;
  studentId: string;
  teacherId: string | null;
  outcome: ParentCallOutcome;
  /** PERSONAL DATA: owning teacher and DEVELOPER only; never logged, never in notifications. */
  comment: string | null;
  calledAt: IsoDateTime;
  createdAt: IsoDateTime;
}

// ───────────────────────────── content ─────────────────────────────

/** File metadata. `storageKey` is server-only and not part of the mobile model. */
export interface StoredFile {
  id: string;
  originalName: string;
  mimeType: string;
  /** bytes */
  size: number;
  uploadedAt: IsoDateTime;
  uploadedById: string;
}

/** Shared topic — never attached to a single student. */
export interface Topic {
  id: string;
  title: string;
  description: string;
  displayOrder: number;
  subject: Subject;
  grade: number | null;
  theoryFileId: string | null;
  homeworkFileId: string | null;
  /** Never to STUDENT. */
  answersFileId: string | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

/** A problem inside a topic. Unique on (topicId, number). */
export interface TopicHomeworkNumber {
  id: string;
  topicId: string;
  /** Digits; leading zeros are significant ("010203"). Compared by the normalised form. */
  number: string;
  displayOrder: number;
  conditionLatex: string | null;
  /** Never to STUDENT. */
  answerLatex: string | null;
  answerFileId: string | null;
  estimatedMinutes: number | null;
  usableInDiagnostic: boolean;
}

// ───────────────────────────── per-student progress ─────────────────────────────

/** Per-student state of one number. Unique on (studentId, homeworkNumberId). */
export interface StudentTopicNumberStatus {
  id: string;
  studentId: string;
  homeworkNumberId: string;
  status: HomeworkNumberStatus | null;
  note: string | null;
  deadlineAt: IsoDateTime | null;
  /** Set on every status write, including a manual clear; rows with it are never deleted. */
  statusChangedAt: IsoDateTime | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface ProgressEventContext {
  lessonId?: string;
  itemId?: string;
  assignmentId?: string;
  checkId?: string;
  submissionId?: string;
  verdict?: SolutionVerdict;
  lessonResult?: LessonItemResult | null;
  checkStartedAt?: IsoDateTime;
}

/** One entry of the per-number progress history (kept until the student / number is deleted). */
export interface ProgressStatusEvent {
  id: string;
  createdAt: IsoDateTime;
  studentId: string;
  homeworkNumberId: string;
  source: ProgressSource;
  previousStatus: HomeworkNumberStatus | null;
  requestedStatus: HomeworkNumberStatus | null;
  status: HomeworkNumberStatus | null;
  decision: ProgressDecisionReason;
  actorId: string | null;
  actorName: string | null;
  actorRole: UserRole | null;
  context: ProgressEventContext;
}

// ───────────────────────────── homework ─────────────────────────────

export interface HomeworkAssignment {
  id: string;
  studentId: string;
  topicId: string;
  title: string | null;
  deadlineAt: IsoDateTime | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface HomeworkAssignmentNumber {
  id: string;
  assignmentId: string;
  homeworkNumberId: string;
}

/** A solution photo attached to a homework right now (not yet consumed by a DONE check). */
export interface HomeworkSubmissionPhoto {
  id: string;
  assignmentId: string;
  fileId: string;
  createdAt: IsoDateTime;
}

export interface HomeworkCheck {
  id: string;
  assignmentId: string;
  status: SolutionCheckStatus;
  /** 1 while the check is PENDING / CHECKING (at most one running check per assignment), else null. */
  activeSlot: 1 | null;
  modelUsed: string | null;
  /** Raw provider / server text. Staff only; a student receives `CheckErrorCode` instead. */
  error: string | null;
  createdAt: IsoDateTime;
  checkedAt: IsoDateTime | null;
}

/** Snapshot of a photo that a check consumed. */
export interface HomeworkCheckPhoto {
  id: string;
  checkId: string;
  fileId: string;
  order: number;
}

export interface HomeworkCheckResult {
  id: string;
  checkId: string;
  homeworkNumberId: string;
  verdict: SolutionVerdict;
  recognizedAnswer: string | null;
  comment: string | null;
  /** Diagnostics below: never to STUDENT. */
  confidence: number | null;
  copySuspected: boolean;
  copyReason: string | null;
  errorKind: ErrorKind | null;
  errorNote: string | null;
  injectionSuspected: boolean;
  injectionNote: string | null;
}

// ───────────────────────────── lessons and homework drafts ─────────────────────────────

/** Stored JSON of a kind=LESSON row; never part of any response. `outputLocale` is OPTIONAL (rows without it exist; readers default to "ru"). */
export interface LessonPlanParams {
  title: string;
  durationMinutes: number;
  topicIds: string[];
  teacherNote: string;
  outputLocale?: Locale;
}

/** Stored JSON of a kind=HOMEWORK row; never part of any response. */
export interface HomeworkPlanParams {
  title: string;
  topicId: string;
  deadlineAt: IsoDateTime;
  teacherNote: string;
  sourceLessonId: string | null;
  dailyMinutes: number;
  outputLocale?: Locale;
}

/** A lesson plan OR a homework draft, told apart by `kind`. */
export interface Lesson {
  id: string;
  title: string;
  subject: Subject;
  teacherId: string;
  /** null = individual lesson / draft. */
  groupId: string | null;
  /** Drafts: exactly one topic. */
  topicId: string | null;
  /** STORED status; the wire carries `DerivedLessonStatus`. */
  status: LessonStatus;
  kind: LessonKind;
  /** Drafts only. */
  deadlineAt: IsoDateTime | null;
  /** 15..240, default 60 */
  durationMinutes: number;
  planParams: LessonPlanParams | HomeworkPlanParams | null;
  startsAt: IsoDateTime | null;
  startedAt: IsoDateTime | null;
  /** Early finish by the teacher. */
  finishedAt: IsoDateTime | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface LessonParticipant {
  id: string;
  lessonId: string;
  studentId: string;
  attendance: AttendanceStatus;
  speed: number | null;
  /** Drafts: id of the issued `HomeworkAssignment` (no FK — cancelling the homework keeps the draft). */
  issuedAssignmentId: string | null;
  issuedAt: IsoDateTime | null;
  planSummary: string | null;
  planGeneratedAt: IsoDateTime | null;
  planError: PlanErrorRaw;
  joinedAt: IsoDateTime | null;
  queueOrder: number | null;
  helpedAt: IsoDateTime | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface LessonAssignmentItem {
  id: string;
  participantId: string;
  homeworkNumberId: string;
  order: number;
  reason: AssignmentReason;
  forReview: boolean;
  minutes: number | null;
  comment: string | null;
  /** Part of the additional (extra) section of a lesson plan. */
  isExtra: boolean;
  result: LessonItemResult | null;
  createdAt: IsoDateTime;
}

export interface LessonItemSubmission {
  id: string;
  itemId: string;
  status: SolutionCheckStatus;
  activeSlot: 1 | null;
  verdict: SolutionVerdict | null;
  recognizedAnswer: string | null;
  comment: string | null;
  confidence: number | null;
  errorKind: ErrorKind | null;
  errorNote: string | null;
  injectionSuspected: boolean;
  injectionNote: string | null;
  modelUsed: string | null;
  error: string | null;
  submittedAt: IsoDateTime;
  checkedAt: IsoDateTime | null;
}

/** At most 3 per submission. */
export interface LessonSubmissionPhoto {
  id: string;
  submissionId: string;
  fileId: string;
  order: number;
}

// ───────────────────────────── notifications, audit, settings, session ─────────────────────────────

export type NotificationParams = Record<string, string | number | boolean | null>;

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType | string;
  /** Russian snapshot; the wire item is rendered for the request language. */
  title: string;
  body: string | null;
  /** Site path. */
  href: string | null;
  params: NotificationParams | null;
  readAt: IsoDateTime | null;
  createdAt: IsoDateTime;
}

export interface AuditLog {
  id: string;
  createdAt: IsoDateTime;
  category: AuditCategory;
  action: string;
  outcome: "ok" | "failed";
  actorId: string | null;
  actorName: string | null;
  actorRole: UserRole | null;
  targetType: string | null;
  targetId: string | null;
  targetLabel: string | null;
  summary: string | null;
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  /** Decimal as a string. */
  costRub: string | null;
  durationMs: number | null;
  error: string | null;
  meta: Record<string, unknown> | null;
  clientIp: string | null;
}

/** Runtime settings managed from the developer panel. DEVELOPER only. */
export interface SiteSettings {
  aiEnabled: boolean;
  aiModel: string;
  aiShortlistModel: string;
  aiReasoningEffort: ReasoningEffort;
  aiMinConfidence: number;
  aiDailyLimit: number;
  aiPerStudentHourlyLimit: number;
  aiCheckConcurrency: number;
  photoRetentionDays: number;
  maxPhotosPerAssignment: number;
  completedChecksKept: number;
  lessonPlanEnabled: boolean;
  lessonPlanShortlistSize: number;
  lessonPlanMaxItems: number;
  lessonPlanConcurrency: number;
  aiPlanDailyLimit: number;
  homeworkPlanEnabled: boolean;
  homeworkPlanMaxItems: number;
  homeworkPlanShortlistSize: number;
  lessonCheckEnabled: boolean;
  lessonCheckDailyLimit: number;
  lessonCheckPerStudentHourlyLimit: number;
  lessonIdleWarnMinutes: number;
  lessonIdleAlertMinutes: number;
  loginHelpContact: string;
}

/** Mock session row (server: `Session` table, token stored hashed). TTL 30 days, absolute. */
export interface Session {
  id: string;
  token: string;
  userId: string;
  expiresAt: IsoDateTime;
  createdAt: IsoDateTime;
}
