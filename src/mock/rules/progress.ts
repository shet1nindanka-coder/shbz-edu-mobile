/**
 * Progress writer — the mock `lib/progress-write.ts`. EVERY change of a number's colour goes through
 * `write()`: it asks the ported policy (`decideProgressChange`), upserts the status row when the policy says
 * so, ALWAYS appends a `ProgressStatusEvent` (also when nothing is written) and mirrors the event into the
 * audit journal (`progress.status`, category DATA).
 *
 * A student can never change the colour: there is no student source.
 */
import type { IsoDateTime, ProgressEventContext, ProgressStatusEvent, StudentTopicNumberStatus } from "@/api/types";
import { decideProgressChange, type ProgressDecision, type ProgressIntent } from "@/domain/progress-policy";

import type { MockUser } from "../store/schema";
import type { MockAudit } from "./audit";
import type { MockCore } from "./core";
import type { MockQueries } from "./queries";

export type ProgressReferences = Pick<ProgressEventContext, "lessonId" | "itemId" | "assignmentId" | "checkId" | "submissionId">;

export type ProgressWriteInput = ProgressIntent & {
  studentId: string;
  homeworkNumberId: string;
  /** The acting teacher; omit for the system (AI check, end of lesson) — the history then shows «система». */
  actor?: Pick<MockUser, "id" | "name" | "role"> | null;
  /** What the change came from — lets the history link to the lesson / homework. */
  references?: ProgressReferences;
};

export type ProgressWriteResult = {
  decision: ProgressDecision;
  /** The history entry that was appended. */
  event: ProgressStatusEvent;
  /** The status row after the write; undefined when the policy wrote nothing and no row existed. */
  row: StudentTopicNumberStatus | undefined;
};

export interface MockProgress {
  /**
   * Applies one requested change: `ctx.progress.write({ source: "teacher", status: "GREEN", studentId, homeworkNumberId, actor: user })`,
   * `{ source: "homework_check", verdict, checkStartedAt, … }`, `{ source: "lesson_teacher", result, previousResult, … }`,
   * `{ source: "lesson_check", result, verdict, … }`, `{ source: "lesson_end", result, … }`.
   *
   * Call it inside the same `store.transaction` as the rows it belongs to (check results, lesson item result).
   * Publishing `student-progress-changed` is the CALLER's job (the site publishes once per operation, and only
   * when something was applied).
   */
  write(input: ProgressWriteInput): ProgressWriteResult;
  /**
   * Finds the status row of (student, number) or creates an empty one (status null, no `statusChangedAt`) —
   * for writing a note or a mirrored deadline.
   */
  ensureRow(studentId: string, homeworkNumberId: string): StudentTopicNumberStatus;
  /**
   * Deletes status rows that carry nothing: no colour, no note, no deadline AND no `statusChangedAt`. A row
   * with `statusChangedAt` is never deleted — an empty colour may be a fresh manual clear that protects the
   * number from the answer of an older check.
   */
  cleanupEmptyRows(studentId: string, homeworkNumberIds: readonly string[]): void;
}

export function createProgress(core: MockCore, q: MockQueries, audit: MockAudit): MockProgress {
  const { store } = core;

  const ensureRow = (studentId: string, homeworkNumberId: string): StudentTopicNumberStatus => {
    const existing = q.status(studentId, homeworkNumberId);
    if (existing) return existing;
    const now: IsoDateTime = core.nowIso();
    return store.statuses.insert({
      id: store.nextId("st"),
      studentId,
      homeworkNumberId,
      status: null,
      note: null,
      deadlineAt: null,
      statusChangedAt: null,
      createdAt: now,
      updatedAt: now,
    });
  };

  return {
    write(input) {
      const { studentId, homeworkNumberId, actor, references, ...intent } = input;
      const current = q.status(studentId, homeworkNumberId);
      const decision = decideProgressChange(
        current ? { status: current.status, statusChangedAt: current.statusChangedAt ? new Date(current.statusChangedAt) : null } : null,
        intent as ProgressIntent,
      );
      const recordedAt = core.nowIso();

      let row = current;
      if (decision.write) {
        row = store.statuses.update(ensureRow(studentId, homeworkNumberId).id, {
          status: decision.status,
          // A repeated manual mark still bumps the time: it protects the number from an older check's answer.
          statusChangedAt: recordedAt,
          updatedAt: recordedAt,
        });
      }

      const context: ProgressEventContext = { ...references };
      if ("verdict" in intent) context.verdict = intent.verdict;
      if ("result" in intent) context.lessonResult = intent.result;
      if (intent.source === "homework_check") context.checkStartedAt = intent.checkStartedAt.toISOString();

      const event = store.progressEvents.insert({
        id: store.nextId("pse"),
        createdAt: recordedAt,
        studentId,
        homeworkNumberId,
        source: intent.source,
        previousStatus: current?.status ?? null,
        requestedStatus: decision.requestedStatus,
        status: decision.status,
        decision: decision.reason,
        actorId: actor?.id ?? null,
        actorName: actor?.name ?? null,
        actorRole: actor?.role ?? null,
        context,
      });

      audit.write({
        category: "DATA",
        action: "progress.status",
        actor: actor ?? null,
        // System names are a Russian snapshot; the journal translates them (`auditActorNameFor`).
        actorName: actor ? undefined : intent.source === "lesson_end" ? "Автозавершение урока" : "Автопроверка",
        targetType: "ProgressStatusEvent",
        targetId: event.id,
        text: {
          key: "progress.status",
          params: { source: event.source, previousStatus: event.previousStatus, status: event.status, decision: event.decision },
        },
        meta: { eventId: event.id, studentId, homeworkNumberId, source: event.source, decision: event.decision, references: context },
      });

      return { decision, event, row };
    },
    ensureRow,
    cleanupEmptyRows(studentId, homeworkNumberIds) {
      for (const homeworkNumberId of homeworkNumberIds) {
        const row = q.status(studentId, homeworkNumberId);
        if (row && row.status === null && row.note === null && row.deadlineAt === null && row.statusChangedAt === null) {
          store.statuses.delete(row.id);
        }
      }
    },
  };
}
