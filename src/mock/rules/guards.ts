/**
 * Ownership guards. The site's rule (docs/spec/00-unified-contract.md §0): a TEACHER sees only own
 * students / groups / lessons, a DEVELOPER sees everything, and a missing OR foreign resource is a 404 with
 * the entity code — never a 403, so the caller cannot tell "not yours" from "does not exist".
 *
 * Every guard throws an `ApiError` and otherwise returns the row(s), so a method reads top-down:
 * `const user = ctx.auth.requireStaff(); const student = ctx.guard.student(user, studentId);`
 */
import type {
  HomeworkAssignment,
  Lesson,
  LessonAssignmentItem,
  LessonKind,
  LessonParticipant,
  NotFoundErrorCode,
  StudentGroup,
  Topic,
  TopicHomeworkNumber,
} from "@/api/types";

import type { MockUser } from "../store/schema";
import type { MockCore } from "./core";
import type { MessageSelector } from "./errors";
import type { MockQueries } from "./queries";

export interface MockGuards {
  /** True when `viewer` may act on the student: the owning TEACHER, any DEVELOPER, or the student themself. */
  canSeeStudent(viewer: MockUser, student: MockUser): boolean;
  /**
   * The student `studentId` if `viewer` (TEACHER own · DEVELOPER any) may act on them, else `404 studentNotFound`
   * (or the given code, e.g. `"studentOrNumberNotFound"`).
   */
  student(viewer: MockUser, studentId: string, code?: NotFoundErrorCode, message?: MessageSelector): MockUser;
  /** The group if `viewer` owns it (TEACHER) or is a DEVELOPER, else `404 groupNotFound`. */
  group(viewer: MockUser, groupId: string): StudentGroup;
  /**
   * The lesson (`kind: "LESSON"`) or homework draft (`kind: "HOMEWORK"`) if `viewer` created it (TEACHER) or is
   * a DEVELOPER, else `404 lessonNotFound` / `404 draftNotFound`. A draft id passed as a lesson id (and the
   * reverse) is a 404 too.
   */
  lesson(viewer: MockUser, lessonId: string, kind: LessonKind): Lesson;
  /** A lesson OR a draft owned by `viewer` (the shared `…/participants/{participantId}/…` handlers) — else `404 participantNotFound`. */
  lessonOrDraft(viewer: MockUser, lessonOrPlanId: string): Lesson;
  /** The participant of an owned lesson / draft, else `404 participantNotFound`. */
  participant(viewer: MockUser, lessonOrPlanId: string, participantId: string, message?: MessageSelector): { lesson: Lesson; participant: LessonParticipant };
  /** The item of an owned lesson's participant, else `404 itemNotFound`. */
  lessonItem(viewer: MockUser, lessonId: string, participantId: string, itemId: string): { lesson: Lesson; participant: LessonParticipant; item: LessonAssignmentItem };
  /** A homework of a student `viewer` may act on (staff), else `404 homeworkNotFound`. */
  homeworkOfVisibleStudent(viewer: MockUser, assignmentId: string): { assignment: HomeworkAssignment; student: MockUser };
  /** The student's OWN homework, else `404 homeworkNotFound`. */
  ownHomework(student: MockUser, assignmentId: string): HomeworkAssignment;
  /** The lesson the student takes part in (kind LESSON), else `404 lessonNotFound`. */
  ownLesson(student: MockUser, lessonId: string): { lesson: Lesson; participant: LessonParticipant };
  /** A topic, else `404 topicNotFound` (topics are shared — no ownership). */
  topic(topicId: string): Topic;
  /** A topic with its numbers in display order, else `404 topicNotFound`. */
  topicWithNumbers(topicId: string): { topic: Topic; numbers: TopicHomeworkNumber[] };
  /** A number by id, else `404 numberNotFound`. */
  number(homeworkNumberId: string, message?: MessageSelector): TopicHomeworkNumber;
}

export function createGuards(core: MockCore, q: MockQueries): MockGuards {
  const { errors } = core;

  const canSeeStudent = (viewer: MockUser, student: MockUser): boolean => {
    if (student.role !== "STUDENT") return false;
    if (viewer.role === "DEVELOPER") return true;
    if (viewer.role === "TEACHER") return student.teacherId === viewer.id;
    return viewer.id === student.id;
  };

  const ownsLesson = (viewer: MockUser, lesson: Lesson): boolean =>
    viewer.role === "DEVELOPER" || (viewer.role === "TEACHER" && lesson.teacherId === viewer.id);

  const lessonOrDraft = (viewer: MockUser, lessonOrPlanId: string): Lesson => {
    const lesson = q.lesson(lessonOrPlanId);
    if (!lesson || !ownsLesson(viewer, lesson)) throw errors.notFound("participantNotFound");
    return lesson;
  };

  const participant = (viewer: MockUser, lessonOrPlanId: string, participantId: string, message?: MessageSelector) => {
    const lesson = q.lesson(lessonOrPlanId);
    const row = q.participant(participantId);
    if (!lesson || !ownsLesson(viewer, lesson) || !row || row.lessonId !== lesson.id) {
      throw errors.notFound("participantNotFound", message);
    }
    return { lesson, participant: row };
  };

  const topic = (topicId: string): Topic => {
    const row = q.topic(topicId);
    if (!row) throw errors.notFound("topicNotFound");
    return row;
  };

  return {
    canSeeStudent,
    student(viewer, studentId, code = "studentNotFound", message) {
      const row = q.student(studentId);
      if (!row || viewer.role === "STUDENT" || !canSeeStudent(viewer, row)) throw errors.notFound(code, message);
      return row;
    },
    group(viewer, groupId) {
      const row = q.group(groupId);
      const owns = row !== undefined && (viewer.role === "DEVELOPER" || (viewer.role === "TEACHER" && row.teacherId === viewer.id));
      if (!row || !owns) throw errors.notFound("groupNotFound");
      return row;
    },
    lesson(viewer, lessonId, kind) {
      const row = q.lesson(lessonId);
      if (!row || row.kind !== kind || !ownsLesson(viewer, row)) {
        throw errors.notFound(kind === "HOMEWORK" ? "draftNotFound" : "lessonNotFound");
      }
      return row;
    },
    lessonOrDraft,
    participant,
    lessonItem(viewer, lessonId, participantId, itemId) {
      const lesson = q.lesson(lessonId);
      const row = q.participant(participantId);
      const item = q.item(itemId);
      if (!lesson || lesson.kind !== "LESSON" || !ownsLesson(viewer, lesson) || !row || row.lessonId !== lesson.id || !item || item.participantId !== row.id) {
        throw errors.notFound("itemNotFound");
      }
      return { lesson, participant: row, item };
    },
    homeworkOfVisibleStudent(viewer, assignmentId) {
      const assignment = q.homework(assignmentId);
      const student = q.student(assignment?.studentId);
      if (!assignment || !student || viewer.role === "STUDENT" || !canSeeStudent(viewer, student)) throw errors.notFound("homeworkNotFound");
      return { assignment, student };
    },
    ownHomework(student, assignmentId) {
      const assignment = q.homework(assignmentId);
      if (!assignment || assignment.studentId !== student.id) throw errors.notFound("homeworkNotFound");
      return assignment;
    },
    ownLesson(student, lessonId) {
      const lesson = q.lesson(lessonId);
      const row = lesson && lesson.kind === "LESSON" ? q.participantOf(lesson.id, student.id) : undefined;
      if (!lesson || !row) throw errors.notFound("lessonNotFound");
      return { lesson, participant: row };
    },
    topic,
    topicWithNumbers(topicId) {
      const row = topic(topicId);
      return { topic: row, numbers: q.numbersOfTopic(row.id) };
    },
    number(homeworkNumberId, message) {
      const row = q.number(homeworkNumberId);
      if (!row) throw errors.notFound("numberNotFound", message);
      return row;
    },
  };
}
