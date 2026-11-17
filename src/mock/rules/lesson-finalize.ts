/**
 * Lazy closing of the results of a finished lesson — the mock port of the site's `lib/lesson-finalize.ts`
 * (docs/spec/05-teacher-lessons-plans.md §4.6, 09 §2.8 `les_g_unfinalized`).
 *
 * Start and end of a lesson follow the schedule, so there is no "finished" event. Every read that shows
 * lessons (the teacher's list and board, the student's Lesson tab, the student card, attendance) first calls
 * `finalizeDue(scope)`: for lessons that ended within the last 48 hours and are not marked yet, an unmarked
 * item with a submission becomes NOT_SOLVED, one without becomes SKIPPED (an item whose check is still
 * running is left alone), an unmarked participant gets PRESENT / ABSENT by activity, and the stored
 * `Lesson.status` becomes FINISHED — the "results are closed" mark.
 */
import type { AttendanceStatus, Lesson, LessonItemResult } from "@/api/types";
import { LIMITS } from "@/api/types";
import { decideEndOfLessonAttendance } from "@/domain/attendance";
import { decideEndOfLessonResult } from "@/domain/lesson-live";
import { deriveLessonStatus } from "@/domain/lesson-status";

import type { MockAudit } from "./audit";
import type { MockCore } from "./core";
import type { MockProgress } from "./progress";
import type { MockQueries } from "./queries";
import type { RealtimeEventInput } from "./realtime";

export type FinalizeScope = {
  /** Only this lesson. */
  lessonId?: string;
  /** Lessons of this teacher. */
  teacherId?: string;
  /** Lessons this student takes part in. */
  studentId?: string;
};

export type FinalizeResult = { finalized: boolean; notSolved: number; skipped: number; attendance: number };

export interface MockLessons {
  /**
   * Closes the results of every recently finished lesson in the scope (an empty scope = all lessons — what a
   * developer's read uses). Idempotent; call it at the start of each method that returns lessons.
   */
  finalizeDue(scope?: FinalizeScope): void;
  /** Closes the results of one lesson if it is finished and not marked yet. Idempotent. */
  finalize(lessonId: string): FinalizeResult;
}

/** Upper bound of a lesson's duration (`MAX_DURATION_MINUTES`), used to pre-filter candidates. */
const MAX_LESSON_DURATION_MS = LIMITS.lessonDurationMinutes.max * 60_000;
const NOTHING: FinalizeResult = { finalized: false, notSolved: 0, skipped: 0, attendance: 0 };

export function createLessons(
  core: MockCore,
  deps: { q: MockQueries; progress: MockProgress; audit: MockAudit; emit: (event: RealtimeEventInput) => void },
): MockLessons {
  const { store } = core;
  const { q, progress, audit, emit } = deps;

  const finalize = (lessonId: string): FinalizeResult => {
    const lesson = store.lessons.get(lessonId);
    if (!lesson || lesson.kind !== "LESSON" || lesson.status === "FINISHED") return NOTHING;
    if (deriveLessonStatus(lesson, core.now()) !== "FINISHED") return NOTHING;

    let notSolved = 0;
    let skipped = 0;
    let attendanceCount = 0;

    store.transaction(() => {
      for (const participant of store.participants.by("lessonId", lesson.id)) {
        const items = q.items(participant.id);
        const submissionsByItem = new Map(items.map((item) => [item.id, store.submissions.by("itemId", item.id)] as const));
        // Not marked by the teacher: "present" on any activity (opened the Lesson tab, handed something in), else "absent".
        const hadActivity = participant.joinedAt !== null || items.some((item) => (submissionsByItem.get(item.id)?.length ?? 0) > 0);
        const attendance: AttendanceStatus | null = decideEndOfLessonAttendance({ current: participant.attendance, hadActivity });

        for (const item of items) {
          const submissions = submissionsByItem.get(item.id) ?? [];
          const decision = decideEndOfLessonResult({
            currentResult: item.result,
            hasSubmission: submissions.length > 0,
            hasPendingCheck: submissions.some((submission) => submission.status === "PENDING" || submission.status === "CHECKING"),
          });
          if (!decision) continue;
          const result: LessonItemResult = decision === "SKIPPED" ? "SKIPPED" : "NOT_SOLVED";
          store.lessonItems.update(item.id, { result });
          progress.write({
            source: "lesson_end",
            result,
            studentId: participant.studentId,
            homeworkNumberId: item.homeworkNumberId,
            references: { lessonId: lesson.id, itemId: item.id },
          });
          if (result === "NOT_SOLVED") notSolved += 1;
          else skipped += 1;
        }

        if (attendance) {
          store.participants.update(participant.id, { attendance, updatedAt: core.nowIso() });
          attendanceCount += 1;
        }
      }
      store.lessons.update(lesson.id, { status: "FINISHED", updatedAt: core.nowIso() });
    });

    if (notSolved + skipped > 0 || attendanceCount > 0) {
      emit({ kind: "lesson-activity", lessonId: lesson.id, teacherId: lesson.teacherId });
    }
    audit.write({
      category: "DATA",
      action: "lesson.auto_results",
      // No actor, as on the site (lib/lesson-finalize.ts): the system name is written only on the
      // per-number progress.status rows, so the journal shows «—» here.
      targetType: "Lesson",
      targetId: lesson.id,
      targetLabel: lesson.title,
      text: { key: "lesson.auto_results", params: { notSolved, skipped, attendance: attendanceCount } },
      meta: { notSolved, skipped, attendance: attendanceCount },
    });

    return { finalized: true, notSolved, skipped, attendance: attendanceCount };
  };

  const endedAt = (lesson: Lesson): number =>
    lesson.finishedAt
      ? new Date(lesson.finishedAt).getTime()
      : (lesson.startsAt ? new Date(lesson.startsAt).getTime() : 0) + Math.max(0, lesson.durationMinutes) * 60_000;

  return {
    finalize,
    finalizeDue(scope = {}) {
      const now = core.now();
      const windowStart = now - LIMITS.lessonFinalizeWindowMs;
      const candidates = (scope.lessonId ? [store.lessons.get(scope.lessonId)] : scope.teacherId ? store.lessons.by("teacherId", scope.teacherId) : store.lessons.all()).filter(
        (lesson): lesson is Lesson => {
          if (!lesson || lesson.kind !== "LESSON" || lesson.status === "FINISHED") return false;
          if (scope.teacherId && lesson.teacherId !== scope.teacherId) return false;
          if (scope.studentId && !q.participantOf(lesson.id, scope.studentId)) return false;
          const finished = lesson.finishedAt ? new Date(lesson.finishedAt).getTime() : Number.NaN;
          const starts = lesson.startsAt ? new Date(lesson.startsAt).getTime() : Number.NaN;
          // The window keeps historical lessons, marked (or not) before live lessons existed, from getting red statuses retroactively.
          return finished >= windowStart || (starts <= now && starts >= windowStart - MAX_LESSON_DURATION_MS);
        },
      );

      for (const lesson of candidates.slice(0, 50)) {
        if (deriveLessonStatus(lesson, now) !== "FINISHED") continue;
        if (endedAt(lesson) < windowStart) continue;
        finalize(lesson.id);
      }
    },
  };
}
