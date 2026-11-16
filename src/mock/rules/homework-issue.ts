/**
 * The single point that creates a `HomeworkAssignment` — the mock port of the site's `lib/homework-issue.ts`.
 * Both issue operations call it: `teacherStudents.issueHomework` (manual assign) and
 * `planner.issueHomeworkPlan` (per participant of a draft) — docs/spec/90-addendum-6.md §6.1, §6.2, §12.
 *
 * Order of checks (the site's): (1) shape → `invalidData`; (2) student exists, is a STUDENT and — for a
 * TEACHER — is own, AND every id is a number of the topic → `studentOrNumberNotFound`; (3) any requested
 * number the student already solved (GREEN / YELLOW) → `solvedConflict` with the labels in numeric order;
 * (4) the transaction. A refusal creates nothing: no assignment, no status rows, no notification, no event.
 */
import type { ApiError } from "@/api/errors";
import type { IsoDateTime } from "@/api/types";
import { LIMITS } from "@/api/types";
import { computeMirroredDeadlines } from "@/domain/homework-deadline-mirror";
import { compareHomeworkNumbers } from "@/domain/numbers";
import { format } from "@/lib/i18n/format";

import type { MockUser } from "../store/schema";
import type { MockCore } from "./core";
import type { MockNotifications } from "./notifications";
import type { MockQueries } from "./queries";
import type { RealtimeEventInput } from "./realtime";

export type IssueHomeworkInput = {
  studentId: string;
  /** Who issues: a TEACHER only to own students, a DEVELOPER to any. Omit only for trusted internal calls. */
  issuedBy?: Pick<MockUser, "id" | "role">;
  topicId: string;
  homeworkNumberIds: readonly string[];
  /** A `Date` or an ISO string; must parse to a finite instant. */
  deadlineAt: Date | IsoDateTime | null | undefined;
  /** Trimmed and cut to 200 characters; empty → null (shown as «ДЗ N»). */
  title: string | null | undefined;
  /**
   * Issue from a homework draft: the participant is stamped (`issuedAssignmentId`, `issuedAt`) in the same
   * transaction, and only if it carries no stamp yet — otherwise everything is rolled back (`alreadyIssued`).
   */
  planParticipantId?: string;
};

export type IssueHomeworkFailureCode = "invalidData" | "studentOrNumberNotFound" | "solvedConflict" | "alreadyIssued";

export type IssueHomeworkResult =
  | { ok: true; assignmentId: string; deadlineAt: IsoDateTime; homeworkNumberIds: string[] }
  | {
      ok: false;
      code: IssueHomeworkFailureCode;
      /** HTTP status of the manual route for this failure. */
      status: number;
      /** Localised for the request language, ready to show. */
      message: string;
      /** With `solvedConflict`: labels in numeric order (leading zeros kept). */
      conflictNumbers?: string[];
    };

export interface MockHomework {
  /**
   * Issues a homework. Never throws for a business refusal — inspect `ok` (the draft loop collects failures,
   * the manual route throws `toError(result)`). On success it has created the assignment and its number links,
   * the status rows, recomputed the mirrored deadlines, created the `homework-assigned` notification and
   * published `student-deadlines-changed`.
   */
  issue(input: IssueHomeworkInput): IssueHomeworkResult;
  /** The `ApiError` the manual route answers with for a failed `issue()` (`409 solvedConflict` carries `params.numbers` and `details.conflictNumbers`). */
  toError(failure: Extract<IssueHomeworkResult, { ok: false }>): ApiError;
  /**
   * Brings `StudentTopicNumberStatus.deadlineAt` of the given numbers to "the nearest deadline among the
   * student's assignments that contain the number" (null when there is none). Call it after issuing AND after
   * cancelling a homework. Creates no rows: issuing creates them.
   */
  recomputeDeadlines(studentId: string, homeworkNumberIds: readonly string[]): void;
}

export function createHomework(
  core: MockCore,
  deps: { q: MockQueries; notify: MockNotifications; emit: (event: RealtimeEventInput) => void },
): MockHomework {
  const { store, errors } = core;
  const { q, notify, emit } = deps;

  class AlreadyIssued extends Error {}

  const recomputeDeadlines = (studentId: string, homeworkNumberIds: readonly string[]): void => {
    if (homeworkNumberIds.length === 0) return;
    const facts = store.homeworks.by("studentId", studentId).map((assignment) => ({
      deadlineAt: assignment.deadlineAt ? new Date(assignment.deadlineAt) : null,
      numbers: store.homeworkNumbers.by("assignmentId", assignment.id),
    }));
    const mirrored = computeMirroredDeadlines([...homeworkNumberIds], facts);
    const now = core.nowIso();
    for (const [homeworkNumberId, deadline] of mirrored) {
      const row = q.status(studentId, homeworkNumberId);
      const next = deadline ? deadline.toISOString() : null;
      if (row && row.deadlineAt !== next) store.statuses.update(row.id, { deadlineAt: next, updatedAt: now });
    }
  };

  const issue = (input: IssueHomeworkInput): IssueHomeworkResult => {
    const texts = core.dict().apiPlanner.homeworkIssue;
    const studentId = String(input.studentId ?? "").trim();
    const topicId = String(input.topicId ?? "").trim();
    const homeworkNumberIds = Array.from(new Set((input.homeworkNumberIds ?? []).map((value) => String(value ?? "").trim()).filter(Boolean)));
    const title = input.title ? input.title.trim().slice(0, LIMITS.maxTitleLength) : "";
    const deadline = input.deadlineAt instanceof Date ? input.deadlineAt : input.deadlineAt ? new Date(input.deadlineAt) : null;

    if (!studentId || !topicId || homeworkNumberIds.length === 0 || !deadline || Number.isNaN(deadline.getTime())) {
      return { ok: false, code: "invalidData", status: 400, message: texts.invalidData };
    }

    const student = q.student(studentId);
    const allowed = student !== undefined && (input.issuedBy?.role !== "TEACHER" || student.teacherId === input.issuedBy.id);
    const numbers = homeworkNumberIds.map((id) => q.number(id)).filter((number) => number !== undefined && number.topicId === topicId);
    if (!student || !allowed || numbers.length !== homeworkNumberIds.length) {
      return { ok: false, code: "studentOrNumberNotFound", status: 404, message: core.dict().apiCommon.studentOrNumberNotFound };
    }

    // Only SOLVED numbers are refused (GREEN — solved at once, YELLOW — solved after a self-check). A RED or
    // unmarked number can be issued again even when it already belongs to another assignment.
    const statuses = q.statusMap(studentId);
    const solved = Array.from(
      new Set(
        numbers
          .filter((number) => {
            const status = statuses.get(number!.id);
            return status === "GREEN" || status === "YELLOW";
          })
          .map((number) => number!.number),
      ),
    ).sort(compareHomeworkNumbers);
    if (solved.length > 0) {
      const template = solved.length > 1 ? texts.solvedConflictMany : texts.solvedConflictOne;
      return { ok: false, code: "solvedConflict", status: 409, conflictNumbers: solved, message: format(template, { numbers: solved.join(", ") }) };
    }

    const deadlineAt = deadline.toISOString();
    let assignmentId: string;
    try {
      assignmentId = store.transaction(() => {
        const now = core.nowIso();
        const assignment = store.homeworks.insert({
          id: store.nextId("hw"),
          studentId,
          topicId,
          title: title || null,
          deadlineAt,
          createdAt: now,
          updatedAt: now,
        });
        for (const homeworkNumberId of homeworkNumberIds) {
          store.homeworkNumbers.insert({ id: store.nextId("hwn"), assignmentId: assignment.id, homeworkNumberId });
          // The status row must exist before the mirror is recomputed: recomputation creates nothing.
          if (!q.status(studentId, homeworkNumberId)) {
            store.statuses.insert({
              id: store.nextId("st"),
              studentId,
              homeworkNumberId,
              status: null,
              note: null,
              deadlineAt,
              statusChangedAt: null,
              createdAt: now,
              updatedAt: now,
            });
          }
        }
        recomputeDeadlines(studentId, homeworkNumberIds);

        if (input.planParticipantId) {
          const participant = store.participants.get(input.planParticipantId);
          // The STORED stamp decides, even when the assignment it names no longer exists.
          if (!participant || participant.issuedAssignmentId !== null) throw new AlreadyIssued();
          store.participants.update(participant.id, { issuedAssignmentId: assignment.id, issuedAt: now, updatedAt: now });
        }
        return assignment.id;
      });
    } catch (error) {
      if (error instanceof AlreadyIssued) return { ok: false, code: "alreadyIssued", status: 409, message: texts.alreadyIssued };
      throw error;
    }

    // The text is rendered from params in the student's language when it is shown.
    notify.create({
      userId: studentId,
      type: "homework-assigned",
      params: {
        variant: "assigned",
        topic: q.topic(topicId)?.title ?? null,
        numbers: numbers.map((number) => number!.number).sort(compareHomeworkNumbers).join(", "),
        count: homeworkNumberIds.length,
        deadlineAt,
      },
      href: "/student/homeworks",
    });
    emit({ kind: "student-deadlines-changed", studentId, topicId });

    return { ok: true, assignmentId, deadlineAt, homeworkNumberIds };
  };

  return {
    issue,
    toError(failure) {
      if (failure.code === "solvedConflict") {
        const numbers = failure.conflictNumbers ?? [];
        return errors.make({
          status: failure.status,
          code: failure.code,
          message: failure.message,
          params: { numbers: numbers.join(", ") },
          details: { conflictNumbers: numbers },
        });
      }
      return errors.make({ status: failure.status, code: failure.code === "alreadyIssued" ? "homeworkAlreadyIssued" : failure.code, message: failure.message });
    },
    recomputeDeadlines,
  };
}
