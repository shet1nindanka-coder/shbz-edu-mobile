/**
 * Read helpers over the store — the "joins" every member needs, with the site's ordering rules. They return
 * stored rows (entities); building the DTO a role may see is the member's job (a row is never returned as is).
 */
import type {
  DerivedLessonStatus,
  HomeworkAssignment,
  HomeworkCheck,
  HomeworkCheckPhoto,
  HomeworkCheckResult,
  HomeworkNumberStatus,
  HomeworkSubmissionPhoto,
  Lesson,
  LessonAssignmentItem,
  LessonItemSubmission,
  LessonKind,
  LessonParticipant,
  LessonSubmissionPhoto,
  Notification,
  ParentCallLog,
  StudentGroup,
  StudentProfile,
  StudentTopicNumberStatus,
  Topic,
  TopicHomeworkNumber,
} from "@/api/types";
import { deriveLessonStatus } from "@/domain/lesson-status";
import { compareHomeworkNumbers, normalizeHomeworkNumber } from "@/domain/numbers";
import type { TimelineStatusRow } from "@/domain/progress-timeline";

import type { MockUser } from "../store/schema";
import type { MockCore } from "./core";

/** Name order used by every list of people (the site sorts by `name asc`). */
export function compareByName(left: { name: string }, right: { name: string }): number {
  return left.name.localeCompare(right.name, "ru");
}

const byCreatedAsc = (left: { createdAt: string }, right: { createdAt: string }) => left.createdAt.localeCompare(right.createdAt);
const byCreatedDesc = (left: { createdAt: string }, right: { createdAt: string }) => right.createdAt.localeCompare(left.createdAt);

export interface MockQueries {
  // ── people
  /** Any user by id. */
  user(id: string | null | undefined): MockUser | undefined;
  /** A user by id only if the role is STUDENT. */
  student(id: string | null | undefined): MockUser | undefined;
  /** A user by id only if the role is TEACHER. */
  teacher(id: string | null | undefined): MockUser | undefined;
  /** Students owned by a teacher, name asc. */
  studentsOfTeacher(teacherId: string): MockUser[];
  /** Every student, name asc. */
  allStudents(): MockUser[];
  /** Every teacher, name asc. */
  teachers(): MockUser[];
  /**
   * The students a staff user may see: a TEACHER — own students, a DEVELOPER — all of them. Name asc.
   */
  visibleStudents(viewer: MockUser): MockUser[];
  /** The `StudentProfile` of a student (a brand-new account has none). */
  profile(studentId: string): StudentProfile | undefined;
  group(id: string | null | undefined): StudentGroup | undefined;
  /** Groups of a teacher, `createdAt` asc. */
  groupsOfTeacher(teacherId: string): StudentGroup[];
  /** Students whose profile points at the group, name asc. */
  groupMembers(groupId: string): MockUser[];
  /** The group a student belongs to (at most one). */
  groupOfStudent(studentId: string): StudentGroup | undefined;

  // ── content
  /** Topics by `displayOrder`, then `createdAt`. */
  topicsOrdered(): Topic[];
  topic(id: string | null | undefined): Topic | undefined;
  /** Numbers of a topic by `displayOrder`, then numeric order of the label. */
  numbersOfTopic(topicId: string): TopicHomeworkNumber[];
  number(id: string | null | undefined): TopicHomeworkNumber | undefined;
  topicOfNumber(homeworkNumberId: string): Topic | undefined;
  /**
   * A number by its label, matched by the NORMALISED form ("010203" = "10203"). Without `topicId` the first
   * match by topic `displayOrder`, then topic `createdAt` wins — the rule of the number search.
   */
  findNumberByLabel(label: string, topicId?: string): TopicHomeworkNumber | undefined;
  /** Sorts numbers numerically by label (`compareHomeworkNumbers`). */
  sortNumbers<T extends { number: string }>(numbers: readonly T[]): T[];

  // ── progress
  /** The status row of (student, number), if any. */
  status(studentId: string, homeworkNumberId: string): StudentTopicNumberStatus | undefined;
  /** Every status row of a student. */
  statusesOfStudent(studentId: string): StudentTopicNumberStatus[];
  /** `homeworkNumberId → colour` of a student (numbers without a row are absent). */
  statusMap(studentId: string): Map<string, HomeworkNumberStatus | null>;
  /** The student's rows as input of `buildProgressTimelineEntries` / `computeStudentStreak`. */
  timelineRows(studentId: string): TimelineStatusRow[];

  // ── homework
  homework(id: string | null | undefined): HomeworkAssignment | undefined;
  /** Assignments of a student, `createdAt` asc. */
  homeworksOfStudent(studentId: string): HomeworkAssignment[];
  /** Numbers of an assignment in numeric order. */
  homeworkNumbers(assignmentId: string): TopicHomeworkNumber[];
  /** Photos attached to an assignment right now, `createdAt` asc. */
  homeworkPhotos(assignmentId: string): HomeworkSubmissionPhoto[];
  /** Checks of an assignment, newest first. */
  homeworkChecks(assignmentId: string): HomeworkCheck[];
  latestHomeworkCheck(assignmentId: string): HomeworkCheck | undefined;
  /** The PENDING / CHECKING check of an assignment (at most one). */
  activeHomeworkCheck(assignmentId: string): HomeworkCheck | undefined;
  checkResults(checkId: string): HomeworkCheckResult[];
  /** Snapshot photos of a check by `order`. */
  checkPhotos(checkId: string): HomeworkCheckPhoto[];
  /**
   * N of «ДЗ N»: 1-based position by `createdAt` among the student's assignments of the same topic (titled
   * ones count too). Pass it to `homeworkAssignmentLabel({ title, orderInTopic }, locale)`.
   */
  homeworkOrderInTopic(assignment: HomeworkAssignment): number;
  /** True when every number of the assignment is GREEN or YELLOW (and there is at least one). */
  isHomeworkCompleted(assignmentId: string): boolean;

  // ── lessons and drafts
  lesson(id: string | null | undefined): Lesson | undefined;
  /** Lessons (or drafts) of a teacher, `createdAt` desc. */
  lessonsOfTeacher(teacherId: string, kind: LessonKind): Lesson[];
  /** Lessons (or drafts) a student takes part in, `createdAt` desc. */
  lessonsOfStudent(studentId: string, kind: LessonKind): Lesson[];
  /** Participants of a lesson / draft ordered by student name. */
  participants(lessonId: string): LessonParticipant[];
  participant(id: string | null | undefined): LessonParticipant | undefined;
  /** The participation of a student in a lesson, if any. */
  participantOf(lessonId: string, studentId: string): LessonParticipant | undefined;
  /** Items of a participant by `order` (main part first, then the extra part). */
  items(participantId: string): LessonAssignmentItem[];
  item(id: string | null | undefined): LessonAssignmentItem | undefined;
  /** Submissions of an item, `submittedAt` asc. */
  submissions(itemId: string): LessonItemSubmission[];
  /** The newest submission of an item. */
  latestSubmission(itemId: string): LessonItemSubmission | undefined;
  submissionPhotos(submissionId: string): LessonSubmissionPhoto[];
  /** COMPUTED status of a lesson at "now" (`deriveLessonStatus`) — what every response carries. */
  lessonStatus(lesson: Pick<Lesson, "startsAt" | "durationMinutes" | "status" | "finishedAt">): DerivedLessonStatus;
  /** A participant whose plan is neither ready nor failed (`planGeneratedAt` and `planError` both null). */
  isPlanPending(participant: LessonParticipant): boolean;

  // ── calls and notifications
  /** Call journal of a student, newest first (`calledAt` desc, then `createdAt` desc). */
  callsOfStudent(studentId: string): ParentCallLog[];
  /** Notifications of a user, newest first. */
  notificationsOfUser(userId: string): Notification[];
}

export function createQueries(core: MockCore): MockQueries {
  const { store } = core;

  const topicsOrdered = () =>
    store.topics.all().sort((left, right) => left.displayOrder - right.displayOrder || left.createdAt.localeCompare(right.createdAt));

  const numbersOfTopic = (topicId: string) =>
    store.numbers.by("topicId", topicId).sort((left, right) => left.displayOrder - right.displayOrder || compareHomeworkNumbers(left.number, right.number));

  const homeworkNumbers = (assignmentId: string) => {
    const numbers: TopicHomeworkNumber[] = [];
    for (const link of store.homeworkNumbers.by("assignmentId", assignmentId)) {
      const number = store.numbers.get(link.homeworkNumberId);
      if (number) numbers.push(number);
    }
    return numbers.sort((left, right) => compareHomeworkNumbers(left.number, right.number));
  };

  const homeworkChecks = (assignmentId: string) => store.homeworkChecks.by("assignmentId", assignmentId).sort(byCreatedDesc);

  const submissions = (itemId: string) =>
    store.submissions.by("itemId", itemId).sort((left, right) => left.submittedAt.localeCompare(right.submittedAt));

  const lessonsWhere = (rows: Lesson[], kind: LessonKind) => rows.filter((lesson) => lesson.kind === kind).sort(byCreatedDesc);

  const studentById = (id: string | null | undefined) => {
    const user = store.users.get(id);
    return user && user.role === "STUDENT" ? user : undefined;
  };

  return {
    user: (id) => store.users.get(id),
    student: studentById,
    teacher(id) {
      const user = store.users.get(id);
      return user && user.role === "TEACHER" ? user : undefined;
    },
    studentsOfTeacher: (teacherId) => store.users.by("teacherId", teacherId).filter((user) => user.role === "STUDENT").sort(compareByName),
    allStudents: () => store.users.by("role", "STUDENT").sort(compareByName),
    teachers: () => store.users.by("role", "TEACHER").sort(compareByName),
    visibleStudents(viewer) {
      if (viewer.role === "DEVELOPER") return store.users.by("role", "STUDENT").sort(compareByName);
      if (viewer.role === "TEACHER") return store.users.by("teacherId", viewer.id).filter((user) => user.role === "STUDENT").sort(compareByName);
      return [];
    },
    profile: (studentId) => store.profiles.findUnique("userId", studentId),
    group: (id) => store.groups.get(id),
    groupsOfTeacher: (teacherId) => store.groups.by("teacherId", teacherId).sort(byCreatedAsc),
    groupMembers(groupId) {
      const members: MockUser[] = [];
      for (const profile of store.profiles.by("groupId", groupId)) {
        const user = studentById(profile.userId);
        if (user) members.push(user);
      }
      return members.sort(compareByName);
    },
    groupOfStudent: (studentId) => store.groups.get(store.profiles.findUnique("userId", studentId)?.groupId),

    topicsOrdered,
    topic: (id) => store.topics.get(id),
    numbersOfTopic,
    number: (id) => store.numbers.get(id),
    topicOfNumber: (homeworkNumberId) => store.topics.get(store.numbers.get(homeworkNumberId)?.topicId),
    findNumberByLabel(label, topicId) {
      const candidates = store.numbers.by("normalized", normalizeHomeworkNumber(label));
      if (topicId !== undefined) return candidates.find((number) => number.topicId === topicId);
      const order = new Map(topicsOrdered().map((topic, index) => [topic.id, index] as const));
      return candidates.sort((left, right) => (order.get(left.topicId) ?? 0) - (order.get(right.topicId) ?? 0))[0];
    },
    sortNumbers: (numbers) => [...numbers].sort((left, right) => compareHomeworkNumbers(left.number, right.number)),

    status: (studentId, homeworkNumberId) => store.statuses.findUnique("studentNumber", `${studentId}|${homeworkNumberId}`),
    statusesOfStudent: (studentId) => store.statuses.by("studentId", studentId),
    statusMap(studentId) {
      const map = new Map<string, HomeworkNumberStatus | null>();
      for (const row of store.statuses.by("studentId", studentId)) map.set(row.homeworkNumberId, row.status);
      return map;
    },
    timelineRows: (studentId) =>
      store.statuses.by("studentId", studentId).map((row) => ({ status: row.status, statusChangedAt: row.statusChangedAt, updatedAt: row.updatedAt })),

    homework: (id) => store.homeworks.get(id),
    homeworksOfStudent: (studentId) => store.homeworks.by("studentId", studentId).sort(byCreatedAsc),
    homeworkNumbers,
    homeworkPhotos: (assignmentId) => store.homeworkPhotos.by("assignmentId", assignmentId).sort(byCreatedAsc),
    homeworkChecks,
    latestHomeworkCheck: (assignmentId) => homeworkChecks(assignmentId)[0],
    activeHomeworkCheck: (assignmentId) => store.homeworkChecks.findUnique("activeSlot", `${assignmentId}|1`),
    checkResults: (checkId) => store.homeworkCheckResults.by("checkId", checkId),
    checkPhotos: (checkId) => store.homeworkCheckPhotos.by("checkId", checkId).sort((left, right) => left.order - right.order),
    homeworkOrderInTopic(assignment) {
      const sameTopic = store.homeworks
        .by("studentId", assignment.studentId)
        .filter((row) => row.topicId === assignment.topicId)
        .sort((left, right) => byCreatedAsc(left, right) || left.id.localeCompare(right.id));
      return Math.max(1, sameTopic.findIndex((row) => row.id === assignment.id) + 1);
    },
    isHomeworkCompleted(assignmentId) {
      const assignment = store.homeworks.get(assignmentId);
      if (!assignment) return false;
      const links = store.homeworkNumbers.by("assignmentId", assignmentId);
      if (links.length === 0) return false;
      return links.every((link) => {
        const status = store.statuses.findUnique("studentNumber", `${assignment.studentId}|${link.homeworkNumberId}`)?.status;
        return status === "GREEN" || status === "YELLOW";
      });
    },

    lesson: (id) => store.lessons.get(id),
    lessonsOfTeacher: (teacherId, kind) => lessonsWhere(store.lessons.by("teacherId", teacherId), kind),
    lessonsOfStudent(studentId, kind) {
      const lessons: Lesson[] = [];
      for (const participant of store.participants.by("studentId", studentId)) {
        const lesson = store.lessons.get(participant.lessonId);
        if (lesson) lessons.push(lesson);
      }
      return lessonsWhere(lessons, kind);
    },
    participants(lessonId) {
      const name = (participant: LessonParticipant) => store.users.get(participant.studentId)?.name ?? "";
      return store.participants.by("lessonId", lessonId).sort((left, right) => name(left).localeCompare(name(right), "ru"));
    },
    participant: (id) => store.participants.get(id),
    participantOf: (lessonId, studentId) => store.participants.findUnique("lessonStudent", `${lessonId}|${studentId}`),
    items: (participantId) => store.lessonItems.by("participantId", participantId).sort((left, right) => left.order - right.order),
    item: (id) => store.lessonItems.get(id),
    submissions,
    latestSubmission(itemId) {
      const rows = submissions(itemId);
      return rows[rows.length - 1];
    },
    submissionPhotos: (submissionId) => store.submissionPhotos.by("submissionId", submissionId).sort((left, right) => left.order - right.order),
    lessonStatus: (lesson) => deriveLessonStatus(lesson, core.now()),
    isPlanPending: (participant) => participant.planGeneratedAt === null && participant.planError === null,

    callsOfStudent: (studentId) =>
      store.parentCalls.by("studentId", studentId).sort((left, right) => right.calledAt.localeCompare(left.calledAt) || right.createdAt.localeCompare(left.createdAt)),
    notificationsOfUser: (userId) => store.notifications.by("userId", userId).sort(byCreatedDesc),
  };
}
