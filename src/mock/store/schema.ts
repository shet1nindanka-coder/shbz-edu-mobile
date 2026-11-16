/**
 * Shape of the mock store: one table per stored entity of docs/spec/00-unified-contract.md §1.2, the
 * mock-only tables (limiter buckets, deferred jobs, row / plan scripts) and three singletons (meta, site
 * settings, mock controls). Uniqueness rules: docs/spec/09-data-i18n-math.md §1.3.
 */
import type {
  AuditLog,
  CheckErrorCode,
  ErrorKind,
  HomeworkAssignment,
  HomeworkAssignmentNumber,
  HomeworkCheck,
  HomeworkCheckPhoto,
  HomeworkCheckResult,
  HomeworkSubmissionPhoto,
  Lesson,
  LessonAssignmentItem,
  LessonItemSubmission,
  LessonParticipant,
  LessonSubmissionPhoto,
  Notification,
  ParentCallLog,
  PlanErrorCode,
  ProgressStatusEvent,
  Session,
  SiteSettings,
  SolutionVerdict,
  StoredFile,
  StudentGroup,
  StudentProfile,
  StudentTopicNumberStatus,
  Topic,
  TopicHomeworkNumber,
  User,
} from "@/api/types";
import { normalizeHomeworkNumber } from "@/domain/numbers";

import type { MockFileSample } from "../assets";
import type { MockControls } from "../controls";
import type { TableSchema } from "./table";

// ───────────────────────────── mock-only row types ─────────────────────────────

/**
 * A user row plus the password. The mock compares passwords in PLAIN TEXT — it holds demo accounts only and
 * never leaves the device; a real server stores scrypt hashes. Never put this field into a response.
 */
export interface MockUser extends User {
  password: string;
}

/**
 * File metadata plus where the mock finds the bytes. Exactly one of `sample` / `localUri` is set:
 * - `sample` — key of the bundled sample file that stands in for a fixture file (`../assets.ts`);
 * - `localUri` — a file picked / captured in the app (uploads); the device layer keeps the bytes.
 */
export interface MockStoredFile extends StoredFile {
  sample: MockFileSample | null;
  localUri: string | null;
}

/** One limiter bucket (the site's `RateLimitBucket` row, plus the in-memory sliding limiter of the login). */
export interface LimiterBucket {
  /** `"<scope>|<identifier>"`. */
  id: string;
  scope: string;
  identifier: string;
  kind: "fixed" | "sliding";
  /** Fixed window: epoch ms of the window the hits belong to. */
  windowStart: number;
  /** Fixed window: hits counted in that window (refused attempts included). */
  hits: number;
  /** Sliding window: epoch ms of the accepted attempts, ascending. */
  stamps: number[];
  /** Fixed window: its length, kept so the demo screen can show the reset time. */
  windowMs: number;
  updatedAt: number;
}

/** Kinds of deferred work the core knows; a member may schedule its own kind (any string). */
export type MockJobKind =
  /** PENDING → CHECKING of a homework check. `refId` = `HomeworkCheck.id`. */
  | "homeworkCheck.begin"
  /** CHECKING → DONE / FAILED of a homework check. `refId` = `HomeworkCheck.id`. */
  | "homeworkCheck.finish"
  /** PENDING → CHECKING of a lesson submission. `refId` = `LessonItemSubmission.id`. */
  | "lessonSubmission.begin"
  /** CHECKING → DONE / FAILED of a lesson submission. `refId` = `LessonItemSubmission.id`. */
  | "lessonSubmission.finish"
  /** AI plan generation of one participant (lesson or homework draft). `refId` = `LessonParticipant.id`. */
  | "planGeneration";

/**
 * A deferred transition (docs/spec/90-addendum-6.md §5 rule 1). Never a timer callback: jobs are rows of
 * the persisted store and are executed lazily, at the start of the first API call made at or after `dueAt`,
 * so an app restart in the middle of a check loses nothing.
 */
export interface MockJob {
  id: string;
  kind: MockJobKind | (string & {});
  /** The row the job belongs to (see `MockJobKind`). */
  refId: string;
  /**
   * `"armed"` — the timer runs, `dueAt` is set. `"waiting"` — a seeded in-flight row: the timer starts when
   * the row is first returned to a client (`ctx.jobs.touch(refId)`), not at the seeded `createdAt`.
   */
  state: "waiting" | "armed";
  /** Delay between arming and execution, ms. */
  delayMs: number;
  /** Epoch ms of the execution moment; null while waiting. */
  dueAt: number | null;
  /** Free-form data for the handler (plain JSON). */
  payload: Record<string, unknown>;
  createdAt: number;
}

/** What a mocked model answer contains for one number (stored on `HomeworkCheckResult` / `LessonItemSubmission`). */
export type ScriptedResult = {
  /** Label, leading zeros kept. */
  number: string;
  verdict: SolutionVerdict;
  /** CORRECT 0.93 · INCORRECT 0.88 · UNCERTAIN 0.41 (below `aiMinConfidence`). */
  confidence: number;
  recognizedAnswer: string | null;
  comment: string | null;
  errorKind: ErrorKind | null;
  /** Teacher / planner only. */
  errorNote: string | null;
  /** Homework results only; never set by rule V. */
  copySuspected: false;
  /** Never set by rule V (fixtures only). */
  injectionSuspected: false;
};

/** Scripted terminal outcome of a seeded in-flight check (precedence 2 of rule V). */
export type MockRowScriptOutcome =
  /** Homework: any subset of the assignment's numbers; lesson: exactly one result. */
  | { kind: "results"; results: ScriptedResult[] }
  | { kind: "failed"; errorClass: CheckErrorCode };

/** Script attached to a seeded in-flight `HomeworkCheck` / `LessonItemSubmission` (mock store only, never on the wire). */
export interface MockRowScript {
  /** Id of the check / submission row. */
  id: string;
  /** The timer starts when the row is first returned to a client. */
  startOn: "firstRead";
  outcome: MockRowScriptOutcome;
}

/** Scripted outcome of a seeded pending plan generation (`LessonParticipant` with `planGeneratedAt: null`). */
export type MockPlanScriptOutcome =
  /** A ready set made of exactly these numbers (ids of `TopicHomeworkNumber`), in order. */
  | { kind: "items"; mainNumberIds: string[]; extraNumberIds: string[]; summary: string | null }
  /** A stored plan error. */
  | { kind: "error"; code: PlanErrorCode };

export interface MockPlanScript {
  /** Id of the `LessonParticipant` row. */
  id: string;
  outcome: MockPlanScriptOutcome;
}

// ───────────────────────────── tables ─────────────────────────────

/** Row type of every table. */
export type MockTableRows = {
  users: MockUser;
  sessions: Session;
  profiles: StudentProfile;
  groups: StudentGroup;
  parentCalls: ParentCallLog;
  files: MockStoredFile;
  topics: Topic;
  numbers: TopicHomeworkNumber;
  statuses: StudentTopicNumberStatus;
  progressEvents: ProgressStatusEvent;
  homeworks: HomeworkAssignment;
  homeworkNumbers: HomeworkAssignmentNumber;
  homeworkPhotos: HomeworkSubmissionPhoto;
  homeworkChecks: HomeworkCheck;
  homeworkCheckPhotos: HomeworkCheckPhoto;
  homeworkCheckResults: HomeworkCheckResult;
  lessons: Lesson;
  participants: LessonParticipant;
  lessonItems: LessonAssignmentItem;
  submissions: LessonItemSubmission;
  submissionPhotos: LessonSubmissionPhoto;
  notifications: Notification;
  auditLogs: AuditLog;
  limiterBuckets: LimiterBucket;
  jobs: MockJob;
  rowScripts: MockRowScript;
  planScripts: MockPlanScript;
};

export type MockTableName = keyof MockTableRows;

const pair = (left: string, right: string) => `${left}|${right}`;

/**
 * Unique constraints (09 §1.3) and the foreign-key lookups every member needs.
 * Read rows through `store.<table>.by("<index>", value)` / `.findUnique("<constraint>", value)`.
 */
export const TABLE_SCHEMAS: { [K in MockTableName]: TableSchema<MockTableRows[K]> } = {
  users: {
    // `User.email` (the login) is unique.
    unique: { email: (row) => row.email },
    indexes: { teacherId: (row) => row.teacherId, role: (row) => row.role },
  },
  sessions: {
    unique: { token: (row) => row.token },
    indexes: { userId: (row) => row.userId },
  },
  profiles: {
    // One profile per student; `groupId` on it ⇒ a student belongs to at most one group.
    unique: { userId: (row) => row.userId },
    indexes: { groupId: (row) => row.groupId },
  },
  groups: { indexes: { teacherId: (row) => row.teacherId } },
  parentCalls: { indexes: { studentId: (row) => row.studentId, teacherId: (row) => row.teacherId } },
  files: { indexes: { uploadedById: (row) => row.uploadedById } },
  topics: {},
  numbers: {
    // (topicId, number) is unique; the normalised form additionally rejects "twins" ("010203" vs "10203").
    unique: {
      topicNumber: (row) => pair(row.topicId, row.number),
      topicNormalizedNumber: (row) => pair(row.topicId, normalizeHomeworkNumber(row.number)),
    },
    indexes: { topicId: (row) => row.topicId, normalized: (row) => normalizeHomeworkNumber(row.number) },
  },
  statuses: {
    unique: { studentNumber: (row) => pair(row.studentId, row.homeworkNumberId) },
    indexes: { studentId: (row) => row.studentId, homeworkNumberId: (row) => row.homeworkNumberId },
  },
  progressEvents: {
    indexes: {
      studentId: (row) => row.studentId,
      homeworkNumberId: (row) => row.homeworkNumberId,
      studentNumber: (row) => pair(row.studentId, row.homeworkNumberId),
    },
  },
  homeworks: { indexes: { studentId: (row) => row.studentId, topicId: (row) => row.topicId } },
  homeworkNumbers: {
    unique: { assignmentNumber: (row) => pair(row.assignmentId, row.homeworkNumberId) },
    indexes: { assignmentId: (row) => row.assignmentId, homeworkNumberId: (row) => row.homeworkNumberId },
  },
  homeworkPhotos: { indexes: { assignmentId: (row) => row.assignmentId, fileId: (row) => row.fileId } },
  homeworkChecks: {
    // (assignmentId, activeSlot) ⇒ at most one PENDING / CHECKING check per assignment.
    unique: { activeSlot: (row) => (row.activeSlot === null ? null : pair(row.assignmentId, String(row.activeSlot))) },
    indexes: { assignmentId: (row) => row.assignmentId },
  },
  homeworkCheckPhotos: {
    unique: {
      checkFile: (row) => pair(row.checkId, row.fileId),
      checkOrder: (row) => pair(row.checkId, String(row.order)),
    },
    indexes: { checkId: (row) => row.checkId, fileId: (row) => row.fileId },
  },
  homeworkCheckResults: {
    indexes: { checkId: (row) => row.checkId, homeworkNumberId: (row) => row.homeworkNumberId },
  },
  lessons: {
    indexes: { teacherId: (row) => row.teacherId, groupId: (row) => row.groupId, topicId: (row) => row.topicId },
  },
  participants: {
    unique: { lessonStudent: (row) => pair(row.lessonId, row.studentId) },
    indexes: { lessonId: (row) => row.lessonId, studentId: (row) => row.studentId },
  },
  lessonItems: {
    unique: { participantNumber: (row) => pair(row.participantId, row.homeworkNumberId) },
    indexes: { participantId: (row) => row.participantId, homeworkNumberId: (row) => row.homeworkNumberId },
  },
  submissions: {
    // (itemId, activeSlot) ⇒ at most one active submission per lesson item.
    unique: { activeSlot: (row) => (row.activeSlot === null ? null : pair(row.itemId, String(row.activeSlot))) },
    indexes: { itemId: (row) => row.itemId },
  },
  submissionPhotos: {
    unique: {
      submissionFile: (row) => pair(row.submissionId, row.fileId),
      submissionOrder: (row) => pair(row.submissionId, String(row.order)),
    },
    indexes: { submissionId: (row) => row.submissionId, fileId: (row) => row.fileId },
  },
  notifications: { indexes: { userId: (row) => row.userId } },
  auditLogs: {},
  limiterBuckets: {},
  jobs: { indexes: { refId: (row) => row.refId } },
  rowScripts: {},
  planScripts: {},
};

export const MOCK_TABLE_NAMES = Object.keys(TABLE_SCHEMAS) as MockTableName[];

// ───────────────────────────── singletons and snapshot ─────────────────────────────

/** Bump when a stored shape changes: an older snapshot on the device is then discarded and re-seeded. */
export const MOCK_STORE_VERSION = 1;

export interface MockMeta {
  version: number;
  /** Seed anchor, epoch ms: every fixture timestamp is an offset from it. */
  t0: number;
  /** `FIXTURES_REVISION` the dataset was seeded from; a stored dataset of another revision is re-seeded at start. */
  fixtures: number;
  /** Increments on every seed / reset. */
  generation: number;
  /** Source of `store.nextId()`. */
  idCounter: number;
  /** Re-seed automatically at start when `now − t0 > 24 h`. */
  autoReseed: boolean;
}

/** The whole store as plain JSON. */
export interface MockSnapshot {
  meta: MockMeta;
  settings: SiteSettings;
  controls: MockControls;
  tables: { [K in MockTableName]: MockTableRows[K][] };
}
