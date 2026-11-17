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
  chunkChanges,
  patchHomeworkStatuses,
  type StatusChangeEntry,
  type VerdictChange,
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
  const { dict } = useI18n();
  const t = dict.students.review;
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
  // The accept batch an undo has to wait for: the two requests must reach the server in this order.
  const acceptRun = useRef<Promise<unknown>>(Promise.resolve());
  // One bucket for the single mark and the batch: 240 / 60 s.
  const wait = useRetryWait();
  const noteWait = wait.note;

  useEffect(
    () => () => {
      if (undoTimer.current) clearTimeout(undoTimer.current);
    },
    [],
  );

  const begin = useCallback((entries: readonly StatusChangeEntry[]) => {
    const ids = entries.map((entry) => entry.homeworkNumberId);
    setOverrides((current) => {
      const next = { ...current };
      for (const entry of entries) next[entry.homeworkNumberId] = entry.status;
      return next;
    });
    setSavingIds((current) => [...current.filter((id) => !ids.includes(id)), ...ids]);
    setNumberErrors((current) => without(current, ids));
  }, []);

  const finish = useCallback(
    (ids: readonly string[]) => {
      setOverrides((current) => without(current, ids));
      setSavingIds((current) => current.filter((id) => !ids.includes(id)));
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
    async (entries: readonly StatusChangeEntry[]) => {
      const results: StatusChangeEntry[] = [];
      for (const chunk of chunkChanges(entries)) {
        const response = await api.teacherStudents.setNumberStatuses(studentId, chunk);
        results.push(...response.results);
      }
      return results;
    },
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
    onSettled: (_result, _error, entry) => finish([entry.homeworkNumberId]),
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
      begin(input.changes.map((change) => ({ homeworkNumberId: change.homeworkNumberId, status: change.next })));
      setAssignmentErrors((current) => without(current, [input.assignmentId]));
      // A new "accept" replaces the pending undo.
      if (undoTimer.current) clearTimeout(undoTimer.current);
      setUndo({
        assignmentId: input.assignmentId,
        label: format(t.verdictsAccepted, { n: input.changes.length }),
        previous: input.changes.map((change) => ({ homeworkNumberId: change.homeworkNumberId, status: change.previous })),
      });
      undoTimer.current = setTimeout(() => setUndo(null), ACCEPT_UNDO_MS);
    },
    onSuccess: (results) => patchCache(results),
    onError: (error, input) => {
      // The batch is one transaction: nothing was applied, so there is nothing to undo.
      clearUndo();
      setAssignmentErrors((current) => ({ ...current, [input.assignmentId]: errorText(error, t.errors.applyVerdicts) }));
      noteWait(error);
    },
    onSettled: (_result, _error, input) => finish(input.changes.map((change) => change.homeworkNumberId)),
  });

  const revert = useMutation({
    mutationFn: async (input: ReviewUndo) => {
      await acceptRun.current;
      return sendBatch(input.previous);
    },
    onMutate: (input) => begin(input.previous),
    onSuccess: (results) => patchCache(results),
    onError: (error, input) => {
      setAssignmentErrors((current) => ({ ...current, [input.assignmentId]: errorText(error, t.errors.undoVerdicts) }));
      noteWait(error);
    },
    onSettled: (_result, _error, input) => finish(input.previous.map((entry) => entry.homeworkNumberId)),
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
      acceptRun.current = acceptMutate({ assignmentId: assignment.id, changes }).catch(() => undefined);
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

export type ReviewController = ReturnType<typeof useReview>;
