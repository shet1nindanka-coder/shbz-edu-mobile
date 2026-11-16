/**
 * Student homework, photos, AI check and live lesson (owner spec 03, typed by 90-addendum-5 Part A).
 * Source: docs/spec/00-unified-contract.md §1.4.3.
 *
 * Privacy: none of these types carries `errorKind`, `errorNote`, `injectionSuspected`, `injectionNote`,
 * `confidence`, `copySuspected` or the raw provider error — a student never receives them.
 */
import type {
  CheckErrorCode,
  DerivedLessonStatus,
  HomeworkNumberStatus,
  IsoDateTime,
  LessonItemResult,
  SolutionCheckStatus,
  SolutionVerdict,
} from "./primitives";
import type { AttachedPhoto } from "./shared";
import type { HomeworkDeadlineSummary } from "./student-study";

// ───────────────────────────── homeworks ─────────────────────────────

/** Full homework list item; extends the light {@link HomeworkDeadlineSummary}. */
export type HomeworkSummaryDto = HomeworkDeadlineSummary & {
  topicId: string;
  createdAt: IsoDateTime;
  /** 0..100 */
  solvedPercent: number;
  /** Photos attached right now. */
  photosCount: number;
  /** Server-computed attention order (03 §4.1); the list arrives already sorted by it. */
  attentionRank: 0 | 1 | 2 | 3 | 4 | 5;
  latestCheckStatus: SolutionCheckStatus | null;
  numbers: { homeworkNumberId: string; number: string; status: HomeworkNumberStatus | null }[];
};

export type StudentCheckResultDto = {
  number: string;
  homeworkNumberId: string;
  verdict: SolutionVerdict;
  /** null for UNCERTAIN. */
  recognizedAnswer: string | null;
  /** UNCERTAIN: the neutral `dict.student.uncertainComment` in the request language. */
  comment: string | null;
};

export type StudentCheckDto = {
  id: string;
  status: SolutionCheckStatus;
  /** Non-null iff `status === "FAILED"`. */
  errorCode: CheckErrorCode | null;
  createdAt: IsoDateTime;
  /** Set for DONE and FAILED. */
  checkedAt: IsoDateTime | null;
  /** Sorted by number; may be [] when DONE (no solution found on the photos — a normal outcome). */
  results: StudentCheckResultDto[];
};

/** `GET /student/homeworks`. */
export type GetHomeworksResponse = {
  serverNow: IsoDateTime;
  /** false only when the homework table is missing on the server — not an error. */
  available: boolean;
  limits: { maxPhotosPerAssignment: number };
  /** Attention-sorted by the server. */
  assignments: HomeworkSummaryDto[];
};

export type StudentHomeworkNumberDto = {
  homeworkNumberId: string;
  number: string;
  conditionLatex: string | null;
  status: HomeworkNumberStatus | null;
  /** "" when none. */
  note: string;
};

/** `GET /student/homeworks/{assignmentId}`. */
export type GetHomeworkResponse = {
  serverNow: IsoDateTime;
  limits: { maxPhotosPerAssignment: number; noteMaxLength: 240 };
  notesEnabled: boolean;
  /** Runtime switch: AI enabled and configured. */
  aiCheckAvailable: boolean;
  assignment: Omit<HomeworkSummaryDto, "numbers"> & {
    /** Current batch, `createdAt` asc. */
    photos: AttachedPhoto[];
    latestCheck: StudentCheckDto | null;
    /** Sorted by number. */
    numbers: StudentHomeworkNumberDto[];
  };
};

/** `photos` = the created ones (all stored or none). */
export type UploadHomeworkPhotosResult = { photos: AttachedPhoto[]; photosCount: number };
export type DeleteHomeworkPhotoResult = { photosCount: number };
/** `check.status === "PENDING"`, `results: []`. */
export type StartHomeworkCheckResult = { check: StudentCheckDto };

/** `GET /student/homeworks/{assignmentId}/checks/latest` (poll). */
export type LatestHomeworkCheckResponse = {
  /** Newest by `createdAt`; null = never checked. */
  check: StudentCheckDto | null;
  /** Current batch after a possible detach (a DONE check consumes its photos). */
  photos: AttachedPhoto[];
  numbers: { homeworkNumberId: string; status: HomeworkNumberStatus | null }[];
  solvedCount: number;
};

// ───────────────────────────── live lesson ─────────────────────────────

export type LessonSubmissionDto = {
  id: string;
  itemId: string;
  status: SolutionCheckStatus;
  /** DONE only. */
  verdict: SolutionVerdict | null;
  /** DONE only; neutral text for UNCERTAIN. */
  comment: string | null;
  /** FAILED only. */
  errorCode: CheckErrorCode | null;
  submittedAt: IsoDateTime;
  checkedAt: IsoDateTime | null;
};

export type LessonItemDto = {
  /** `LessonAssignmentItem` id — what `submitLessonItem` takes. */
  id: string;
  order: number;
  isExtra: boolean;
  number: string;
  homeworkNumberId: string;
  topicId: string;
  topicTitle: string;
  conditionLatex: string | null;
  result: LessonItemResult | null;
  /** Latest by `submittedAt`. */
  submission: LessonSubmissionDto | null;
  /** Required, server-computed: the item accepts no more submissions. */
  closed: boolean;
  /** Required, server-computed: a submission may be sent right now. */
  canSubmit: boolean;
};

export type ActiveLessonDto = {
  lessonId: string;
  title: string;
  /** null = individual lesson. */
  groupName: string | null;
  startsAt: IsoDateTime;
  durationMinutes: number;
  /** `startsAt + durationMinutes`. */
  endsAt: IsoDateTime;
  joinedAt: IsoDateTime | null;
  /** `order` asc. */
  items: LessonItemDto[];
};

export type UpcomingLessonDto = {
  lessonId: string;
  title: string;
  startsAt: IsoDateTime;
  durationMinutes: number;
  groupName: string | null;
};

/** `GET /student/lesson`. No lesson → both `active` and `upcoming` are null. */
export type GetLessonResponse = {
  serverNow: IsoDateTime;
  limits: { maxPhotosPerSubmission: 3 };
  /** Runtime switch: AI enabled, lesson checks enabled and configured. */
  lessonCheckAvailable: boolean;
  active: ActiveLessonDto | null;
  upcoming: UpcomingLessonDto | null;
};

export type JoinLessonResult = { joinedAt: IsoDateTime };
/** `submission.status === "PENDING"`. */
export type SubmitLessonItemResult = { submission: LessonSubmissionDto };

export type LessonItemStateDto = Pick<LessonItemDto, "id" | "result" | "submission" | "closed" | "canSubmit">;

/** `GET /student/lessons/{lessonId}/state` (poll). Valid in any status; FINISHED ends the live screen. */
export type LessonStateResponse = {
  serverNow: IsoDateTime;
  status: DerivedLessonStatus;
  /** Every item of the participant, `order` asc. */
  items: LessonItemStateDto[];
};
