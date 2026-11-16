/**
 * Groups, attendance, parent calls, statistics (owner spec 06).
 * Source: docs/spec/00-unified-contract.md §1.4.7.
 *
 * Privacy: `ParentCallEntry.comment` is personal data — visible only to the owning teacher and the
 * developer; never logged, never placed in notifications, never sent to a student.
 */
import type {
  AttendanceLessonStatus,
  AttendanceStatus,
  HomeworkNumberStatus,
  IsoDateTime,
  LessonStatus,
  ParentCallOutcome,
  ParentCallReminderState,
  ReportPeriod,
  Subject,
} from "./primitives";
import type { LessonListItem } from "./planner";
import type { TimelineEntry } from "./shared";
import type { TeacherStudentListItem } from "./teacher-students";

// ───────────────────────────── groups ─────────────────────────────

export type GroupListMember = { id: string; name: string; email: string; speed: number | null; aiNote: string | null };

export type GroupListItem = {
  id: string;
  name: string;
  subject: Subject;
  grade: number | null;
  createdAt: IsoDateTime;
  membersCount: number;
  members: GroupListMember[];
};

export type GroupMember = GroupListMember & {
  progress: { greenCount: number; yellowCount: number; redCount: number };
};

/** A student that can be added to the group; `groupId` = the group the student is in now (a student is in at most one). */
export type GroupCandidate = { id: string; name: string; email: string; groupId: string | null };

export type GroupDetail = {
  id: string;
  name: string;
  subject: Subject;
  grade: number | null;
  createdAt: IsoDateTime;
  /** Total `TopicHomeworkNumber` rows in the bank (returned, unused by the site UI). */
  totalNumbers: number;
  members: GroupMember[];
  allStudents: GroupCandidate[];
};

/** `GET /teacher/groups`. `canCreate` is false for a DEVELOPER. */
export type GroupsListResponse = { groups: GroupListItem[]; canCreate: boolean };

/** `POST /teacher/groups` (TEACHER only). An empty name → `400 invalidData`. */
export type CreateGroupRequest = { name: string; grade?: number | null; subject?: Subject };
export type CreateGroupResponse = { group: GroupListItem };

/** `GET /teacher/groups/{groupId}`. */
export type GroupDetailResponse = {
  group: GroupDetail;
  lessons: {
    total: number;
    recent: Pick<LessonListItem, "id" | "title" | "startsAt" | "createdAt" | "durationMinutes" | "status">[];
  };
};

export type RenameGroupRequest = { name: string };
export type RenameGroupResponse = { group: Pick<GroupDetail, "id" | "name"> };

export type AddMemberRequest = { studentId: string };
/** `movedFromGroupId` = the group the student was removed from, if any. */
export type AddMemberResponse = { member: GroupMember; movedFromGroupId: string | null };

/** `PATCH /teacher/students/{studentId}/ai-profile`. Full overwrite: speed integer 1..10 or null; aiNote ≤ 300 or null. */
export type AiProfileRequest = { speed: number | null; aiNote: string | null };
export type AiProfileResponse = { studentId: string; speed: number | null; aiNote: string | null };

// ───────────────────────────── group statistics ─────────────────────────────

/** Why a member needs attention (`code` values are data, not error codes). */
export type AttentionFlag =
  | { code: "overdue_homework"; count: number }
  | { code: "not_started" }
  | { code: "idle"; days: number }
  | { code: "red_month"; count: number };

export type GroupMemberRow = {
  id: string;
  name: string;
  closed7: number;
  closed30: number;
  red30: number;
  streak: number;
  overdueHomeworks: number;
  activeHomeworks: number;
  lastActivityAt: IsoDateTime | null;
  /** 1-based position after sorting by activity. */
  rank: number;
  idleDays: number | null;
  attention: AttentionFlag[];
};

/** `GET /teacher/groups/{groupId}/statistics`. */
export type GroupStatisticsResponse = {
  generatedAt: IsoDateTime;
  members: GroupMemberRow[];
  mostActiveId: string | null;
  leastActiveId: string | null;
  totals: { closed7: number; closed30: number; red30: number; overdueHomeworks: number; attentionCount: number };
};

// ───────────────────────────── attendance ─────────────────────────────

export type GroupAttendanceParticipant = {
  participantId: string;
  studentId: string;
  attendance: AttendanceStatus;
  joinedAt: IsoDateTime | null;
};

export type GroupAttendanceLesson = {
  id: string;
  title: string;
  startsAt: IsoDateTime;
  /** PLANNED lessons are not listed. */
  status: AttendanceLessonStatus;
  participants: GroupAttendanceParticipant[];
};

/** `GET /teacher/groups/{groupId}/attendance?period=` (default "year"). */
export type GroupAttendanceResponse = {
  period: ReportPeriod;
  since: IsoDateTime;
  until: IsoDateTime;
  members: { id: string; name: string }[];
  lessons: GroupAttendanceLesson[];
};

/** `PATCH /teacher/lessons/{lessonId}/participants/{participantId}/attendance` (lessons of kind LESSON only). */
export type SetAttendanceRequest = { attendance: AttendanceStatus };
/** Wire body; the typed method resolves to it without `ok`. */
export type SetAttendanceResponse = { ok: true; attendance: AttendanceStatus };

/** Computed on the client by the ported attendance helpers; `percent` is null when nothing is counted. */
export type AttendanceSummary = {
  counted: number;
  attended: number;
  late: number;
  absent: number;
  excused: number;
  percent: number | null;
};

// ───────────────────────────── parent calls ─────────────────────────────

export type ParentCallReminder = {
  state: ParentCallReminderState;
  /** Moscow calendar days since the last REACHED call (or since the student was created). */
  daysSinceAnchor: number;
  daysUntilDue: number;
  hasReachedCall: boolean;
};

export type ParentCallEntry = {
  id: string;
  outcome: ParentCallOutcome;
  /** PERSONAL DATA. */
  comment: string | null;
  calledAt: IsoDateTime;
  teacherName: string | null;
};

export type ParentCallStudentOverview = {
  studentId: string;
  studentName: string;
  teacherId: string | null;
  teacherName: string | null;
  reminder: ParentCallReminder;
  studentCreatedAt: IsoDateTime;
  lastReachedAt: IsoDateTime | null;
  /** The latest entry is NO_ANSWER and is newer than the last REACHED call (or there is none). */
  attemptAfterLastReached: boolean;
  attemptDaysAgo: number | null;
  totalCalls: number;
  /** Newest first, ≤ 20. */
  history: ParentCallEntry[];
};

/** `GET /teacher/parent-calls`. TEACHER: own students, `canRecord: true`; DEVELOPER: all students, read-only. */
export type ParentCallsOverviewResponse = {
  canRecord: boolean;
  students: ParentCallStudentOverview[];
  counts: { overdue: number; due: number; total: number };
};

/** `GET /teacher/parent-calls/counts`. */
export type ParentCallCounts = { due: number; overdue: number };

/** `GET /teacher/parent-calls/students/{studentId}/history?limit=100&before=<callId>`. */
export type ParentCallHistoryResponse = { studentId: string; calls: ParentCallEntry[]; hasMore: boolean };

/** `POST /teacher/parent-calls` (TEACHER only). `comment` ≤ 4000 chars. */
export type RecordCallRequest = { studentId: string; outcome: ParentCallOutcome; comment?: string };
export type RecordCallResponse = { call: ParentCallEntry; reminder: ParentCallReminder };

// ───────────────────────────── statistics (DEVELOPER) ─────────────────────────────

export type StatsStudent = TeacherStudentListItem;

export type StatsTopic = {
  id: string;
  title: string;
  greenCount: number;
  yellowCount: number;
  redCount: number;
  markedCount: number;
  totalStudents: number;
  totalNumbers: number;
  totalSlots: number;
  studentsWithActivity: number;
  progressPercent: number;
};

export type TeacherTopicsOverview = {
  students: StatsStudent[];
  topics: StatsTopic[];
  stats: { totalTopics: number; totalStudents: number; totalFiles: number; totalNumbers: number; totalMarked: number };
};

export type DeveloperStatistics = {
  homework: {
    total: number;
    completedCount: number;
    overdueCount: number;
    inProgressCount: number;
    withPhotosCount: number;
    photosTotal: number;
    issuedNumbersTotal: number;
    issuedNumbersSolved: number;
    issuedNumbersGreen: number;
    issuedNumbersYellow: number;
    issuedNumbersRed: number;
    issuedNumbersUnmarked: number;
  };
  content: {
    totalTopics: number;
    totalNumbers: number;
    numbersWithCondition: number;
    numbersWithAnswer: number;
    topicsWithTheory: number;
    topicsWithHomeworkFile: number;
    gaps: {
      topicId: string;
      title: string;
      noTheoryFile: boolean;
      noHomeworkFile: boolean;
      missingConditions: number;
      missingAnswers: number;
    }[];
  };
};

/** `GET /developer/statistics/progress?studentId=`. */
export type StatisticsProgressResponse = {
  overview: TeacherTopicsOverview;
  homework: DeveloperStatistics["homework"];
  /** 112 days. */
  timeline: TimelineEntry[];
  /** The student the timeline is filtered by, or null = everyone. */
  timelineStudentId: string | null;
};

/** `GET /developer/statistics/platform`. */
export type StatisticsPlatformResponse = {
  overview: TeacherTopicsOverview;
  homework: DeveloperStatistics["homework"];
  content: DeveloperStatistics["content"];
};

/** `GET /developer/statistics/drilldown?topicId=&studentId=` — one entry per number of the topic. */
export type DrilldownResponse = {
  numbers: { status: HomeworkNumberStatus | null; deadlineAt: IsoDateTime | null }[];
};

export type TeacherLessonEntry = {
  id: string;
  title: string;
  topicTitle: string | null;
  groupName: string | null;
  participantsCount: number;
  startsAt: IsoDateTime | null;
  createdAt: IsoDateTime;
  /** The STORED status — the only place on the wire where it is not derived. */
  status: LessonStatus;
};

export type TeacherStatsEntry = {
  teacherId: string;
  teacherName: string;
  teacherEmail: string;
  studentsCount: number;
  homeworkTotal: number;
  homework30d: number;
  callsReached: number;
  callsNoAnswer: number;
  lessonsTotal: number;
  lessonsFinished: number;
  /** 12 entries, aligned with `StatisticsTeachersResponse.weekStarts`. */
  lessonsByWeek: number[];
  /** ≤ 8 */
  recentLessons: TeacherLessonEntry[];
  /** ≤ 5 */
  topTopics: { title: string; count: number }[];
};

/** `GET /developer/statistics/teachers`. */
export type StatisticsTeachersResponse = {
  teachers: TeacherStatsEntry[];
  /** 12 entries. */
  weekStarts: IsoDateTime[];
  /** Rows that belong to no teacher. */
  unattributed: { students: number; homework: number; calls: number; lessons: number };
};
