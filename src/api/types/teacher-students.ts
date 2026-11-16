/**
 * Teacher: home, students, homework review / assign, progress history (owner spec 04).
 * Source: docs/spec/00-unified-contract.md §1.4.4.
 */
import type {
  DerivedLessonStatus,
  HomeworkNumberStatus,
  IsoDateTime,
  PlanErrorRaw,
  ProgressDecisionReason,
  ProgressSource,
  SolutionCheckStatus,
  SolutionVerdict,
} from "./primitives";
import type { ComposeBoardTopic, LessonBoardItem } from "./planner";
import type { AttachedPhoto, PhotoRef } from "./shared";

// ───────────────────────────── home and students list ─────────────────────────────

/** `GET /teacher/home`. */
export type TeacherHomeSummary = {
  stats: { totalTopics: number; totalNumbers: number; totalStudents: number; totalFiles: number; totalMarked: number };
  /** Parent-call reminders of own students (also `GET /teacher/parent-calls/counts`). */
  calls: { due: number; overdue: number };
};

export type TeacherStudentListItem = {
  id: string;
  name: string;
  /** The login. */
  email: string;
  greenCount: number;
  yellowCount: number;
  redCount: number;
  /** green + yellow + red */
  markedCount: number;
  /** green + yellow */
  solvedCount: number;
};

/** `POST /teacher/students`. `name` ≤ 120, `login` ≤ 254, `password` per the password policy. */
export type StudentCreateInput = { name: string; login: string; password: string };
export type CreatedStudent = { id: string; name: string; email: string };

export type TeacherStudentHeader = { id: string; name: string; email: string; createdAt: IsoDateTime };
/** `GET /teacher/students/{studentId}` — header of the student card. */
export type StudentCardResponse = { student: TeacherStudentHeader; activeHomeworksCount: number };

/** Body of the two password-reset endpoints (student, teacher). */
export type ResetPasswordRequest = { password: string };

// ───────────────────────────── homework review ─────────────────────────────

export type TeacherHomeworkCheckResult = {
  number: string;
  verdict: SolutionVerdict;
  recognizedAnswer: string | null;
  comment: string | null;
  copySuspected: boolean;
  copyReason: string | null;
  injectionSuspected: boolean;
  injectionNote: string | null;
};

export type TeacherHomeworkCheck = {
  id: string;
  status: SolutionCheckStatus;
  /** Raw text, staff only. */
  error: string | null;
  createdAt: IsoDateTime;
  checkedAt: IsoDateTime | null;
  /** Snapshot of the photos this check consumed. */
  photos: PhotoRef[];
  results: TeacherHomeworkCheckResult[];
};

export type TeacherHomeworkNumber = {
  homeworkNumberId: string;
  number: string;
  conditionLatex: string | null;
  answerLatex: string | null;
  status: HomeworkNumberStatus | null;
  /** The student's note; "" when none. */
  note: string;
};

export type TeacherHomeworkAssignment = {
  id: string;
  title: string | null;
  orderInTopic: number;
  topicId: string;
  topicTitle: string;
  deadlineAt: IsoDateTime | null;
  createdAt: IsoDateTime;
  numbers: TeacherHomeworkNumber[];
  /** Attached now, not yet consumed by a DONE check. */
  photos: AttachedPhoto[];
  /** Newest first, ≤ 15. */
  checks: TeacherHomeworkCheck[];
  latestCheck: TeacherHomeworkCheck | null;
  greenCount: number;
  yellowCount: number;
  redCount: number;
  markedCount: number;
  totalNumbers: number;
  progressPercent: number;
  solvedCount: number;
  solvedPercent: number;
};

/** `GET /teacher/students/{studentId}/homeworks`. `assignments` are attention-sorted. */
export type TeacherStudentHomeworks = {
  assignmentsEnabled: boolean;
  notesEnabled: boolean;
  assignments: TeacherHomeworkAssignment[];
};

// ───────────────────────────── assign board ─────────────────────────────

/** A compose topic without `inLesson`, with the per-number deadline. */
export type AssignBoardTopic = Omit<ComposeBoardTopic, "numbers"> & {
  numbers: (Omit<ComposeBoardTopic["numbers"][number], "inLesson"> & { deadlineAt: IsoDateTime | null })[];
};

/** `GET /teacher/students/{studentId}/assign-board`. */
export type AssignBoardResponse = { deadlinesEnabled: boolean; topics: AssignBoardTopic[] };

/** `POST /teacher/homeworks`. */
export type IssueHomeworkRequest = {
  studentId: string;
  topicId: string;
  homeworkNumberIds: string[];
  deadlineAt: IsoDateTime;
  title?: string;
};
export type IssueHomeworkResponse = { assignmentId: string; deadlineAt: IsoDateTime; homeworkNumberIds: string[] };

// ───────────────────────────── statuses and deadlines ─────────────────────────────

/** `PUT /teacher/students/{studentId}/numbers/{homeworkNumberId}/status`. `null` clears the mark. */
export type SetNumberStatusRequest = { status: HomeworkNumberStatus | null };
/** Wire body; the typed method resolves to it without `ok`. A repeated mark is recorded as "reaffirmed". */
export type SetNumberStatusResponse = {
  ok: true;
  status: HomeworkNumberStatus | null;
  statusChangedAt: IsoDateTime;
  decision: "changed" | "reaffirmed";
};

/** `POST /teacher/students/{studentId}/number-statuses`. 1..100 changes, one transaction, one history event per item. */
export type SetNumberStatusesRequest = { changes: { homeworkNumberId: string; status: HomeworkNumberStatus | null }[] };
export type SetNumberStatusesResponse = { results: { homeworkNumberId: string; status: HomeworkNumberStatus | null }[] };

/** `PUT /teacher/students/{studentId}/deadlines`. `deadlineAt: null` clears. No screen calls it in v1. */
export type SetDeadlinesRequest = { topicId: string; homeworkNumberIds: string[]; deadlineAt: IsoDateTime | null };
export type SetDeadlinesResponse = { deadlineAt: IsoDateTime | null; homeworkNumberIds: string[] };

// ───────────────────────────── progress history ─────────────────────────────

/** Where a history entry came from. `kind: "homework"` is never sent to a DEVELOPER. */
export type ProgressHistoryReference =
  | { kind: "lesson"; lessonId: string }
  | { kind: "homework"; assignmentId: string };

export type ProgressHistoryEntry = {
  id: string;
  createdAt: IsoDateTime;
  source: ProgressSource;
  actorName: string | null;
  previousStatus: HomeworkNumberStatus | null;
  requestedStatus: HomeworkNumberStatus | null;
  status: HomeworkNumberStatus | null;
  decision: ProgressDecisionReason;
  reference: ProgressHistoryReference | null;
};

/** `GET /progress-history?studentId=&homeworkNumberId=&cursor=`. Codes, not labels. */
export type ProgressHistoryPage = {
  studentName: string;
  number: string;
  topicTitle: string;
  currentStatus: HomeworkNumberStatus | null;
  /** `createdAt` desc; page size 20. */
  entries: ProgressHistoryEntry[];
  /** Pass to the next call; null = last page. */
  nextCursor: string | null;
};

// ───────────────────────────── student card: lessons tab ─────────────────────────────

/** One lesson of `GET /teacher/students/{studentId}/lessons` (`createdAt` desc). */
export type TeacherStudentLesson = {
  /** `lessonId` */
  id: string;
  /** This student's participant row in the lesson. */
  participantId: string;
  title: string;
  status: DerivedLessonStatus;
  durationMinutes: number;
  createdAt: IsoDateTime;
  startsAt: IsoDateTime | null;
  groupName: string | null;
  /** `!planGeneratedAt && !planError` — AI plan generation is still running for this participant. */
  planPending: boolean;
  planError: PlanErrorRaw;
  items: Pick<LessonBoardItem, "id" | "homeworkNumberId" | "number" | "topicTitle" | "isExtra" | "result">[];
};
