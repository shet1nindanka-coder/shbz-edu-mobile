/**
 * Planner: lessons, live board, homework drafts (owner spec 05).
 * Source: docs/spec/00-unified-contract.md §1.4.6 (+ `ComposeBoardTopic`, declared once here and used by 04).
 *
 * A homework draft is addressed as `{planId}`, never `{lessonId}`. Stored `planParams` and the number bank
 * never travel inside a board payload (the bank is `GET /teacher/number-bank`).
 */
import type {
  AssignmentReason,
  CreatePlanOutcome,
  DerivedLessonStatus,
  HomeworkNumberStatus,
  IsoDateTime,
  LessonItemResult,
  PlanErrorRaw,
  SolutionCheckStatus,
  SolutionVerdict,
} from "./primitives";

// ───────────────────────────── lessons: list and creation ─────────────────────────────

export type LessonListItem = {
  id: string;
  title: string;
  status: DerivedLessonStatus;
  durationMinutes: number;
  createdAt: IsoDateTime;
  startsAt: IsoDateTime | null;
  groupId: string | null;
  groupName: string | null;
  /** Only when the lesson has no group and exactly one participant; else null. */
  soloStudentName: string | null;
  /** Items across all participants / items that already have a result. */
  resultsTotal: number;
  resultsMarked: number;
  participantsCount: number;
  /** Participants with `planGeneratedAt` / with a `planError`. */
  readyCount: number;
  failedCount: number;
};

/** `GET /teacher/lessons/new-options` — who a new lesson can be composed for. */
export type LessonTargetChooser = {
  groups: { id: string; name: string; membersCount: number }[];
  students: { id: string; name: string }[];
};

export type LessonFormMember = { id: string; name: string; speed: number | null };
export type TopicOption = { id: string; title: string };

/**
 * A topic of the manual compose / assign board. Declared once (owner 05), used by 04.
 * `conditionsLoaded` and `conditionLatex` are REQUIRED on the wire; `conditionsLoaded` is true on the first
 * topic only — other topics fetch `GET /topics/{topicId}/conditions` on selection.
 */
export type ComposeBoardTopic = {
  id: string;
  title: string;
  totalNumbers: number;
  conditionsLoaded: boolean;
  numbers: {
    /** `homeworkNumberId` */
    id: string;
    number: string;
    status: HomeworkNumberStatus | null;
    /** The number is in ANY lesson set of this student ("Already used in a lesson"). */
    inLesson: boolean;
    conditionLatex: string | null;
  }[];
};

/** `GET /teacher/lessons/new-form?groupId=|?studentId=`. */
export type LessonNewFormModel = {
  mode: "group" | "student";
  kicker: string;
  groupId: string | null;
  members: LessonFormMember[];
  topics: TopicOption[];
  /** Runtime switch: AI planner enabled and configured. */
  aiAvailable: boolean;
  /** Mode "student" only (statements of the first compose topic only); null in mode "group". */
  composeTopics: ComposeBoardTopic[] | null;
};

/** One topic of `GET /teacher/number-bank` (cache on the device). */
export type LessonBankTopic = { topicId: string; topicTitle: string; numbers: { id: string; number: string }[] };

/** `POST /teacher/lessons`. No `outputLocale` in the body — the server takes it from the request language. */
export type CreateLessonInput = {
  groupId?: string;
  /** 1..30 */
  studentIds: string[];
  /** ≤ 200 chars */
  title?: string;
  /** 15..240, default 60 */
  durationMinutes?: number;
  startsAt?: IsoDateTime;
  topicIds?: string[];
  /** ≤ 500 chars */
  teacherNote?: string;
  /** studentId → speed 1..10 or null */
  speeds?: Record<string, number | null>;
  /** Manual composition: no AI plan is requested (`plan: "skipped"`). */
  skipPlan?: boolean;
  /** Manual composition: `homeworkNumberId`s of the set. */
  numberIds?: string[];
};

/** HTTP 201 for every `plan` outcome, including "unavailable". The app always opens the board. */
export type CreateLessonResponse = { lessonId: string; plan: CreatePlanOutcome };

// ───────────────────────────── lesson board ─────────────────────────────

/** Latest live submission of an item, as the teacher sees it. Staff only. */
export type LessonBoardSubmission = {
  status: SolutionCheckStatus;
  verdict: SolutionVerdict | null;
  submittedAt: IsoDateTime;
  checkedAt: IsoDateTime | null;
  injectionSuspected: boolean;
  injectionNote: string | null;
  /** `StoredFile` ids of the submission photos (≤ 3). */
  photoFileIds: string[];
};

export type LessonBoardItem = {
  id: string;
  homeworkNumberId: string;
  number: string;
  conditionLatex: string | null;
  reason: AssignmentReason;
  minutes: number | null;
  comment: string | null;
  isExtra: boolean;
  result: LessonItemResult | null;
  topicTitle: string;
  /** The student's current traffic light for this number. */
  studentStatus: HomeworkNumberStatus | null;
  submission: LessonBoardSubmission | null;
};

export type LessonBoardParticipant = {
  /** `participantId` */
  id: string;
  studentId: string;
  studentName: string;
  speed: number | null;
  planSummary: string | null;
  planGeneratedAt: IsoDateTime | null;
  planError: PlanErrorRaw;
  createdAt: IsoDateTime;
  joinedAt: IsoDateTime | null;
  items: LessonBoardItem[];
};

/** `GET /teacher/lessons/{lessonId}`. No `bank`, no `planParams`. */
export type LessonBoardModel = {
  serverNow: IsoDateTime;
  id: string;
  title: string;
  kind: "LESSON";
  status: DerivedLessonStatus;
  startsAt: IsoDateTime | null;
  createdAt: IsoDateTime;
  finishedAt: IsoDateTime | null;
  durationMinutes: number;
  group: { id: string; name: string } | null;
  participants: LessonBoardParticipant[];
  aiAvailable: boolean;
  /** Runtime thresholds of the "student is idle" markers on the live board. */
  idleWarnMinutes: number;
  idleAlertMinutes: number;
};

/** `GET /teacher/lessons/{lessonId}/status` (poll 2000 ms on the board, 2500 ms on the student card). */
export type LessonPlanStatus = {
  total: number;
  ready: number;
  failed: number;
  pending: number;
  participants: {
    participantId: string;
    studentId: string;
    name: string;
    planGeneratedAt: IsoDateTime | null;
    planError: PlanErrorRaw;
    itemsCount: number;
  }[];
};

/** `GET /teacher/lessons/{lessonId}/live` — refetch the board when `signature` changes. */
export type LessonLiveSnapshot = { signature: string };

/** `PATCH /teacher/lessons/{lessonId}` body. */
export type ScheduleLessonRequest = { startsAt: IsoDateTime };
/** Wire body; the typed method resolves to it without `ok`. */
export type ScheduleLessonResponse = { ok: true; status: DerivedLessonStatus; reopened: boolean };
/** Wire body; `finalized` counts the items closed automatically. */
export type FinishLessonResponse = { ok: true; finalized: { notSolved: number; skipped: number } };

/** `PATCH …/participants/{participantId}/items` (lessons and drafts). Each list ≤ 40. */
export type SaveSetRequest = { homeworkNumberIds: string[]; extraHomeworkNumberIds?: string[] };
/** Wire body: the whole set after the change. The typed method resolves to the bare `items`. */
export type SaveSetResponse = { ok: true; items: LessonBoardItem[] };

/** Wire body; `planRequestedAt` anchors the 15-minute "stale plan" timer. */
export type RegenerateResponse = { ok: true; planRequestedAt: IsoDateTime };

export type SetItemResultRequest = { result: LessonItemResult | null };
/** Wire body; `studentStatus` = the resulting traffic light of the number. */
export type SetItemResultResponse = { ok: true; result: LessonItemResult | null; studentStatus: HomeworkNumberStatus | null };

/** Options of the lesson handout (lessons only; a draft id → `404 noHomeworkHandout`). */
export type HandoutOptions = {
  /** "pdf" may answer `503 pdfRendererUnavailable` — the app then offers "html". */
  format: "pdf" | "html";
  /** Only that participant's set. */
  studentId?: string;
  /** Answer sheet. */
  answers?: boolean;
};

// ───────────────────────────── homework drafts ─────────────────────────────

export type HomeworkPlanListItem = {
  id: string;
  title: string;
  deadlineAt: IsoDateTime | null;
  createdAt: IsoDateTime;
  topicTitle: string | null;
  groupName: string | null;
  participantsCount: number;
  readyCount: number;
  failedCount: number;
  issuedCount: number;
};

/** `GET /teacher/homework-plans/new-form?lessonId=[&studentId=]|?groupId=|?studentId=`. */
export type HomeworkPlanNewModel = {
  kicker: string;
  topics: TopicOption[];
  members: { id: string; name: string }[];
  defaultTopicId: string | null;
  defaultTitle: string;
  groupId: string | null;
  sourceLessonId: string | null;
};

/** `POST /teacher/homework-plans`. */
export type CreateHomeworkPlanInput = {
  topicId: string;
  deadlineAt: IsoDateTime;
  /** ≤ 200 chars */
  title?: string;
  /** ≤ 500 chars */
  teacherNote?: string;
  /** 15..240, default 60 */
  dailyMinutes?: number;
  sourceLessonId?: string;
  groupId?: string;
  /** 1..30 */
  studentIds: string[];
};

export type CreateHomeworkPlanResponse = { planId: string; plan: Exclude<CreatePlanOutcome, "skipped"> };

export type HomeworkPlanItem = Pick<
  LessonBoardItem,
  "id" | "homeworkNumberId" | "number" | "conditionLatex" | "reason" | "minutes" | "comment" | "studentStatus"
>;

export type HomeworkPlanParticipant = {
  id: string;
  studentId: string;
  studentName: string;
  planSummary: string | null;
  planGeneratedAt: IsoDateTime | null;
  planError: PlanErrorRaw;
  /** Set once the participant's set was issued as a homework (the assignment may since have been cancelled). */
  issuedAssignmentId: string | null;
  issuedAt: IsoDateTime | null;
  createdAt: IsoDateTime;
  items: HomeworkPlanItem[];
};

/** `GET /teacher/homework-plans/{planId}`. */
export type HomeworkPlanBoardModel = {
  serverNow: IsoDateTime;
  id: string;
  title: string;
  topicId: string;
  topicTitle: string;
  deadlineAt: IsoDateTime | null;
  daysUntilDeadline: number | null;
  group: { id: string; name: string } | null;
  sourceLesson: { id: string; title: string } | null;
  aiAvailable: boolean;
  participants: HomeworkPlanParticipant[];
  /** All numbers of the draft's topic (for manual additions). */
  topicNumbers: { id: string; number: string }[];
};

/** `GET /teacher/homework-plans/{planId}/status` (poll 2000 ms). */
export type HomeworkPlanStatus = {
  total: number;
  ready: number;
  failed: number;
  issued: number;
  pending: number;
  participants: {
    participantId: string;
    studentId: string;
    name: string;
    planGeneratedAt: IsoDateTime | null;
    planError: PlanErrorRaw;
    issuedAssignmentId: string | null;
    issuedAt: IsoDateTime | null;
    itemsCount: number;
  }[];
};

/** `POST /teacher/homework-plans/{planId}/issue` body. Omitted / empty = all participants. */
export type IssueHomeworkPlanRequest = { participantIds?: string[] };

/** Per-participant failure of an issue (a field value of a 200 response, not an envelope code). */
export type IssueFailureCode =
  | "emptySet"
  | "solvedConflict"
  | "studentOrNumberNotFound"
  | "invalidData"
  | "internalError"
  | "migrationMissing";

/** Wire body. Partial success is a 200: per-participant failures are in `failed[]`. */
export type IssueResult = {
  ok: true;
  issued: { participantId: string; studentId: string; name: string; assignmentId: string }[];
  failed: {
    participantId: string;
    studentId: string;
    name: string;
    code: IssueFailureCode;
    /** Localized. */
    message: string;
    /** `solvedConflict` only. */
    conflictNumbers?: string[];
  }[];
};
