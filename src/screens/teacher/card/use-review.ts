import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { errorText, qk, useApi } from '@/api';
import type { HomeworkNumberStatus, TeacherHomeworkAssignment, TeacherStudentHomeworks } from '@/api/types';
import { useRetryWait } from '@/components/retry-wait';
import { format, useI18n } from '@/i18n';
import { useScreenFocused } from '@/navigation';

import { invalidateStudentData } from './invalidate';
import {
  ACCEPT_UNDO_MS,
  acceptVerdictChanges,
  applyStatuses,
  claimWrites,
  patchHomeworkStatuses,
  releaseWrites,
  sendStatusChunks,
  type StatusChangeEntry,
  statusBatchFailure,
  undoEntriesAfterAccept,
  type VerdictChange,
  type WriteOwners,
} from './review-logic';

/** The 10-second "AI verdicts accepted — Undo" toast: what to restore and where the batch came from. */
export type ReviewUndo = { assignmentId: string; label: string; previous: StatusChangeEntry[] };

type Statuses = Record<string, HomeworkNumberStatus | null>;

function without<T>(record: Record<string, T>, ids: readonly string[]): Record<string, T> {
  const next = { ...record };
  for (const id of ids) delete next[id];
  return next;
}

/**
 * Data and status writes of the homework review (docs/spec/04-teacher-students.md S4, §3.6, §4.3): the
 * homework list, optimistic traffic-light marks with rollback, "accept AI verdicts" as one batch and its
 * 10-second undo. A mark is highlighted at once; when the request fails it is taken back and the reason
 * is shown next to the number.
 */
export function useReview(studentId: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  const { dict, m } = useI18n();
  const t = dict.students.review;
  const mt = m.teacher.review;
  const focused = useScreenFocused();

  const key = qk('teacherStudents', 'getStudentHomeworks', studentId);
  // A check that starts, fails or ends with "under review" verdicts emits no realtime event (04 §5.1),
  // so the list is re-read every time the screen is opened or comes back into focus.
  const homeworks = useQuery({ queryKey: key, queryFn: () => api.teacherStudents.getStudentHomeworks(studentId), refetchOnMount: 'always' });
  const refetch = homeworks.refetch;
  const wasFocused = useRef(focused);
  useEffect(() => {
    const returned = focused && !wasFocused.current;
    wasFocused.current = focused;
    if (returned) void refetch();
  }, [focused, refetch]);

  // Colours of the writes that are in flight; a settled write lives in the query cache instead.
  const [overrides, setOverrides] = useState<Statuses>({});
  const [savingIds, setSavingIds] = useState<readonly string[]>([]);
  const [numberErrors, setNumberErrors] = useState<Record<string, string>>({});
  const [assignmentErrors, setAssignmentErrors] = useState<Record<string, string>>({});
  const [undo, setUndo] = useState<ReviewUndo | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The accept batch an undo has to wait for: the two requests must reach the server in this order. It
  // resolves to the numbers the accept actually wrote, so the undo restores only those (none after a
  // failed accept).
  const acceptRun = useRef<Promise<ReadonlySet<string>>>(Promise.resolve(new Set<string>()));
  // One bucket for the single mark and the batch: 240 / 60 s.
  const wait = useRetryWait();
  const noteWait = wait.note;

  useEffect(
    () => () => {
      if (undoTimer.current) clearTimeout(undoTimer.current);
    },
    [],
  );

  // The write each number's override and lock belong to (see `releaseWrites`).
  const owners = useRef<WriteOwners>(new Map());
  const nextToken = useRef(0);

  /** A write starts: its colours are shown and its numbers locked. Returns the write's token for `finish`. */
  const begin = useCallback((entries: readonly StatusChangeEntry[]) => {
    const ids = entries.map((entry) => entry.homeworkNumberId);
    nextToken.current += 1;
    const token = nextToken.current;
    claimWrites(owners.current, ids, token);
    setOverrides((current) => {
      const next = { ...current };
      for (const entry of entries) next[entry.homeworkNumberId] = entry.status;
      return next;
    });
    setSavingIds((current) => [...current.filter((id) => !ids.includes(id)), ...ids]);
    setNumberErrors((current) => without(current, ids));
    return token;
  }, []);

  /**
   * A write has settled: its numbers go back to the cache colours and are unlocked — only those a newer
   * write (the undo of this accept, a tap) has not taken over meanwhile. An undo sent after the accept
   * keeps its restored colour and lock until it settles itself.
   */
  const finish = useCallback(
    (ids: readonly string[], token: number | undefined) => {
      const released = token === undefined ? [] : releaseWrites(owners.current, ids, token);
      if (released.length > 0) {
        setOverrides((current) => without(current, released));
        setSavingIds((current) => current.filter((id) => !released.includes(id)));
      }
      invalidateStudentData(queryClient);
    },
    [queryClient],
  );

  const patchCache = useCallback(
    (changes: readonly StatusChangeEntry[]) => {
      queryClient.setQueryData<TeacherStudentHomeworks>(qk('teacherStudents', 'getStudentHomeworks', studentId), (current) =>
        current ? patchHomeworkStatuses(current, changes) : current,
      );
    },
    [queryClient, studentId],
  );

  const sendBatch = useCallback(
    (entries: readonly StatusChangeEntry[]) => sendStatusChunks(entries, (chunk) => api.teacherStudents.setNumberStatuses(studentId, chunk)),
    [api, studentId],
  );

  // ───────────────────────────── one number ─────────────────────────────

  const mark = useMutation({
    mutationFn: (entry: StatusChangeEntry) => api.teacherStudents.setNumberStatus(studentId, entry.homeworkNumberId, entry.status),
    onMutate: (entry) => begin([entry]),
    onSuccess: (result, entry) => patchCache([{ homeworkNumberId: entry.homeworkNumberId, status: result.status }]),
    onError: (error, entry) => {
      // invalidData, studentOrNumberNotFound, unauthorized, rateLimited, serviceUnavailable, no connection:
      // the optimistic colour is taken back (dropping the override) and the message stays by the number.
      setNumberErrors((current) => ({ ...current, [entry.homeworkNumberId]: errorText(error, t.errors.saveStatus) }));
      noteWait(error);
    },
    onSettled: (_result, _error, entry, token) => finish([entry.homeworkNumberId], token),
  });

  // ───────────────────────────── accept AI verdicts / undo ─────────────────────────────

  const clearUndo = useCallback(() => {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = null;
    setUndo(null);
  }, []);

  const accept = useMutation({
    mutationFn: (input: { assignmentId: string; changes: VerdictChange[] }) =>
      sendBatch(input.changes.map((change) => ({ homeworkNumberId: change.homeworkNumberId, status: change.next }))),
    onMutate: (input) => {
      const token = begin(input.changes.map((change) => ({ homeworkNumberId: change.homeworkNumberId, status: change.next })));
      setAssignmentErrors((current) => without(current, [input.assignmentId]));
      // A new "accept" replaces the pending undo.
      if (undoTimer.current) clearTimeout(undoTimer.current);
      setUndo({
        assignmentId: input.assignmentId,
        label: format(t.verdictsAccepted, { n: input.changes.length }),
        previous: input.changes.map((change) => ({ homeworkNumberId: change.homeworkNumberId, status: change.previous })),
      });
      undoTimer.current = setTimeout(() => setUndo(null), ACCEPT_UNDO_MS);
      return token;
    },
    onSuccess: (results) => patchCache(results),
    onError: (error, input) => {
      const { reason, applied, appliedIds } = statusBatchFailure(error);
      let message = errorText(reason, t.errors.applyVerdicts);
      if (appliedIds.length === 0) {
        // Every request of the batch is a transaction and the first one failed: nothing was applied, so
        // there is nothing to undo.
        clearUndo();
      } else {
        // A batch of more than 100 changes failed part-way: the earlier requests are applied. The undo
        // (if it is still offered) covers exactly those, and the message says how many went through.
        patchCache(applied);
        const done = new Set(appliedIds);
        setUndo((current) => {
          if (!current || current.assignmentId !== input.assignmentId) return current;
          const previous = undoEntriesAfterAccept(current.previous, done);
          return { ...current, previous, label: format(t.verdictsAccepted, { n: previous.length }) };
        });
        message = `${message} ${format(mt.partlyApplied, { done: appliedIds.length, total: input.changes.length })}`;
      }
      setAssignmentErrors((current) => ({ ...current, [input.assignmentId]: message }));
      noteWait(reason);
    },
    onSettled: (_result, _error, input, token) => finish(input.changes.map((change) => change.homeworkNumberId), token),
  });

  const revert = useMutation({
    mutationFn: async (input: ReviewUndo) => {
      // Sent after the accept settles, and only for what the accept wrote: after a failed accept this
      // sends nothing at all.
      const entries = undoEntriesAfterAccept(input.previous, await acceptRun.current);
      return entries.length === 0 ? [] : sendBatch(entries);
    },
    onMutate: (input) => begin(input.previous),
    onSuccess: (results, input) => {
      patchCache(results);
      // The undo took back what a part-way failed accept had applied: its «Применено N из M.» no longer
      // describes the card, which is back where it was before the accept. A revert that sent nothing (the
      // accept applied nothing) keeps the accept's error.
      if (results.length > 0) setAssignmentErrors((current) => without(current, [input.assignmentId]));
    },
    onError: (error, input) => {
      const { reason, applied, appliedIds } = statusBatchFailure(error);
      let message = errorText(reason, t.errors.undoVerdicts);
      if (appliedIds.length > 0) {
        patchCache(applied);
        message = `${message} ${format(mt.partlyUndone, { done: appliedIds.length, total: input.previous.length })}`;
      }
      setAssignmentErrors((current) => ({ ...current, [input.assignmentId]: message }));
      noteWait(reason);
    },
    onSettled: (_result, _error, input, token) => finish(input.previous.map((entry) => entry.homeworkNumberId), token),
  });

  const effectiveStatus = useCallback(
    (homeworkNumberId: string, serverStatus: HomeworkNumberStatus | null) =>
      homeworkNumberId in overrides ? (overrides[homeworkNumberId] ?? null) : serverStatus,
    [overrides],
  );

  const data = homeworks.data;
  /** The homework list with the in-flight colours applied, counters included. */
  const assignments = useMemo(() => data?.assignments.map((assignment) => applyStatuses(assignment, overrides)), [data, overrides]);

  const acceptMutate = accept.mutateAsync;
  const acceptVerdicts = useCallback(
    (assignment: TeacherHomeworkAssignment) => {
      const changes = acceptVerdictChanges(assignment, effectiveStatus);
      if (changes.length === 0) return;
      const all = new Set(changes.map((change) => change.homeworkNumberId));
      acceptRun.current = acceptMutate({ assignmentId: assignment.id, changes }).then(
        () => all,
        (error: unknown) => new Set(statusBatchFailure(error).appliedIds),
      );
    },
    [acceptMutate, effectiveStatus],
  );

  const revertMutate = revert.mutate;
  const undoAccept = useCallback(() => {
    if (!undo) return;
    clearUndo();
    revertMutate(undo);
  }, [undo, clearUndo, revertMutate]);

  return {
    homeworks,
    data,
    assignments,
    savingIds,
    numberErrors,
    assignmentErrors,
    /** Status writes are cooling down after a refusal that named a wait. */
    wait,
    undo,
    /** Id of the homework whose "accept" batch is in flight. */
    acceptingId: accept.isPending ? (accept.variables?.assignmentId ?? null) : null,
    setStatus: (homeworkNumberId: string, status: HomeworkNumberStatus | null) => mark.mutate({ homeworkNumberId, status }),
    acceptVerdicts,
    undoAccept,
    dismissAssignmentError: (assignmentId: string) => setAssignmentErrors((current) => without(current, [assignmentId])),
  };
}
