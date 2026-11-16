import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

import { isNotFoundError, qk, useApi } from '@/api';
import type { LessonBoardItem, LessonBoardModel, LessonBoardParticipant, LessonItemResult } from '@/api/types';
import { POLLING } from '@/api/types/limits';
import { format, useI18n } from '@/i18n';
import { useAppNavigation } from '@/navigation';

import { errorText } from '../shared/error-text';
import { notePlanRequested, planRequestedAtOf } from '../shared/plan-anchors';
import { countReady, planSignature, planStateOf, statusSignatureRows } from '../shared/plan-state';
import { useNowTick } from '../shared/use-now-tick';
import { useRetryWait } from '../shared/use-retry-wait';
import {
  hasScheduleMovedOn,
  markParticipantPending,
  nextScheduleRefreshDelay,
  patchBoardItem,
  replaceParticipantItems,
  setIdsOf,
  withNumber,
  withoutNumber,
  type SetIds,
} from './board-logic';

export type BoardNotice = { tone: 'success' | 'error'; text: string };

/** What one participant is busy with (its set-editing controls are disabled meanwhile). */
export type ParticipantBusy = 'items' | 'regenerate';

/** The toast shown for 5 s after a number was removed: enough to re-send the previous set. */
export type UndoRemoval = { participantId: string; previous: SetIds; label: string };

const UNDO_REMOVE_MS = 5000;

/**
 * Data and actions of the lesson board (docs/spec/05-teacher-lessons-plans.md §1.3, §3.3–§3.8, §5):
 * the board query, the two polls (plan status every 2 s while a plan is being built, the live signature
 * every 15 s while the lesson runs), the schedule timers and every mutation with its cache updates.
 */
export function useLessonBoard(lessonId: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  const navigation = useAppNavigation();
  const { dict } = useI18n();
  const t = dict.planner.lessonBoard;
  const boardKey = qk('planner', 'getLessonBoard', lessonId);

  // Opening the board runs the lazy finalisation of this lesson on the server, so it is always re-read.
  const board = useQuery({ queryKey: boardKey, queryFn: () => api.planner.getLessonBoard(lessonId), refetchOnMount: 'always' });
  const data = board.data;
  const refetchBoard = board.refetch;
  const boardUpdatedAt = board.dataUpdatedAt;
  const boardFetching = board.isFetching;

  // One clock for stale plans, idle chips and "N min ago": the device clock corrected by the server's.
  const deviceNow = useNowTick(30_000);
  const rawOffset = data ? Date.parse(data.serverNow) - boardUpdatedAt : 0;
  const clockOffset = Number.isFinite(rawOffset) ? rawOffset : 0;
  const now = deviceNow + clockOffset;

  const [notice, setNotice] = useState<BoardNotice | null>(null);
  const [busy, setBusy] = useState<Record<string, ParticipantBusy>>({});
  const [savingItemIds, setSavingItemIds] = useState<readonly string[]>([]);
  const [itemErrors, setItemErrors] = useState<Record<string, string>>({});
  const [undo, setUndo] = useState<UndoRemoval | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // One countdown per rate-limit bucket: create + regenerate (10 / 60 s), set saves (60 / 60 s),
  // result marks (240 / 60 s), and the lesson itself (schedule, finish, delete: 30 / 60 s each).
  const planWait = useRetryWait();
  const itemsWait = useRetryWait();
  const resultWait = useRetryWait();
  const lessonWait = useRetryWait();

  const patchBoard = useCallback(
    (update: (current: LessonBoardModel) => LessonBoardModel) => {
      queryClient.setQueryData<LessonBoardModel>(boardKey, (current) => (current ? update(current) : current));
    },
    // The key is rebuilt on every render from the same strings.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [queryClient, lessonId],
  );

  /** Everything else that shows this lesson: the list, the student card's "Lessons" tab, the group page. */
  const invalidateAround = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: qk('planner', 'listLessons') });
    void queryClient.invalidateQueries({ queryKey: qk('teacherStudents') });
    void queryClient.invalidateQueries({ queryKey: qk('groups', 'getGroup') });
    void queryClient.invalidateQueries({ queryKey: qk('groups', 'getGroupAttendance') });
    void queryClient.invalidateQueries({ queryKey: qk('groups', 'getGroupStatistics') });
  }, [queryClient]);

  const fail = useCallback(
    (error: unknown, fallback: string) => {
      setNotice({ tone: 'error', text: errorText(error, fallback) });
      // A participant, an item or the whole lesson that is gone (404), or a set that changed under the
      // teacher (409): show what is really there now.
      void refetchBoard();
    },
    [refetchBoard],
  );

  // ───────────────────────────── plan generation poll ─────────────────────────────

  const participants = data?.participants;
  const pendingCount = participants ? participants.filter((participant) => planStateOf(participant, now, planRequestedAtOf(participant.id)).pending).length : 0;
  const polling = pendingCount > 0;

  const status = useQuery({
    queryKey: qk('planner', 'getLessonStatus', lessonId),
    queryFn: () => api.planner.getLessonStatus(lessonId),
    enabled: polling,
    refetchInterval: polling ? POLLING.planStatusBoardMs : false,
    // A failed poll is ignored: the next tick tries again.
    retry: false,
    staleTime: 0,
    gcTime: 0,
  });
  const statusData = status.data;
  const statusUpdatedAt = status.dataUpdatedAt;

  useEffect(() => {
    if (!polling || !participants || !statusData || boardFetching) return;
    // A status older than the board describes the past (e.g. the moment before an accepted "Retry").
    if (statusUpdatedAt < boardUpdatedAt) return;
    if (planSignature(statusSignatureRows(statusData.participants)) !== planSignature(participants)) void refetchBoard();
  }, [polling, participants, statusData, statusUpdatedAt, boardUpdatedAt, boardFetching, refetchBoard]);

  // ───────────────────────────── live activity poll (fallback of the realtime event) ─────────────────────────────

  const isLive = data?.status === 'ACTIVE';
  const live = useQuery({
    queryKey: qk('planner', 'getLessonLive', lessonId),
    queryFn: () => api.planner.getLessonLive(lessonId),
    enabled: isLive,
    refetchInterval: isLive ? POLLING.lessonLiveMs : false,
    retry: false,
    staleTime: 0,
    gcTime: 0,
  });
  const liveSignature = live.data?.signature;
  const lastLiveSignature = useRef<string | null>(null);

  useEffect(() => {
    if (liveSignature === undefined) return;
    // The very first value only initialises the comparison.
    if (lastLiveSignature.current !== null && lastLiveSignature.current !== liveSignature) void refetchBoard();
    lastLiveSignature.current = liveSignature;
  }, [liveSignature, refetchBoard]);

  // ───────────────────────────── schedule: the status flips by the clock ─────────────────────────────

  const startsAt = data?.startsAt ?? null;
  const finishedAt = data?.finishedAt ?? null;
  const durationMinutes = data?.durationMinutes ?? 0;
  const boardStatus = data?.status ?? null;

  useEffect(() => {
    if (boardStatus === null) return undefined;
    const delay = nextScheduleRefreshDelay({ status: boardStatus, startsAt, durationMinutes, finishedAt }, Date.now() + clockOffset);
    if (delay === null) return undefined;
    const timer = setTimeout(() => void refetchBoard(), delay);
    return () => clearTimeout(timer);
  }, [boardStatus, startsAt, durationMinutes, finishedAt, clockOffset, refetchBoard]);

  // Safety net of the timer (a sleeping device does not run timers): every tick compares the schedule
  // with the status the board arrived with.
  useEffect(() => {
    if (boardStatus === null || boardFetching) return;
    if (hasScheduleMovedOn({ status: boardStatus, startsAt, durationMinutes, finishedAt }, Date.now() + clockOffset)) void refetchBoard();
    // Only the 30-second tick drives this check: a re-read must never trigger the next one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceNow]);

  // ───────────────────────────── mutations ─────────────────────────────

  const clearUndo = useCallback(() => {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = null;
    setUndo(null);
  }, []);

  useEffect(
    () => () => {
      if (undoTimer.current) clearTimeout(undoTimer.current);
    },
    [],
  );

  const setBusyFor = (participantId: string, value: ParticipantBusy | null) =>
    setBusy((current) => {
      const next = { ...current };
      if (value) next[participantId] = value;
      else delete next[participantId];
      return next;
    });

  const saveSet = useMutation({
    mutationFn: (input: { participantId: string; ids: SetIds; undo?: UndoRemoval }) =>
      api.planner.saveLessonItems(lessonId, input.participantId, input.ids.mainIds, input.ids.extraIds),
    onMutate: (input) => {
      setNotice(null);
      setBusyFor(input.participantId, 'items');
    },
    onSuccess: (items, input) => {
      patchBoard((current) => replaceParticipantItems(current, input.participantId, items));
      void queryClient.invalidateQueries({ queryKey: qk('planner', 'listLessons') });
      void queryClient.invalidateQueries({ queryKey: qk('teacherStudents', 'listStudentLessons') });
      if (input.undo) {
        if (undoTimer.current) clearTimeout(undoTimer.current);
        setUndo(input.undo);
        undoTimer.current = setTimeout(() => setUndo(null), UNDO_REMOVE_MS);
      }
    },
    onError: (error) => {
      itemsWait.note(error);
      // `numbersRequired`, `participantNotFound`, `homeworkAlreadyIssued`, `blockedNumbers`, `saveFailed`.
      fail(error, t.saveItemsFailed);
    },
    onSettled: (_result, _error, input) => setBusyFor(input.participantId, null),
  });
  const mutateSet = saveSet.mutate;

  const removeItem = useCallback(
    (participant: LessonBoardParticipant, item: LessonBoardItem) => {
      clearUndo();
      const previous = setIdsOf(participant.items);
      mutateSet({
        participantId: participant.id,
        ids: withoutNumber(previous, item.homeworkNumberId),
        undo: { participantId: participant.id, previous, label: format(t.removedFromSet, { n: item.number }) },
      });
    },
    [clearUndo, mutateSet, t.removedFromSet],
  );

  const undoRemoval = useCallback(() => {
    if (!undo) return;
    clearUndo();
    // The re-created row is a new item: reason NEW, no result.
    mutateSet({ participantId: undo.participantId, ids: undo.previous });
  }, [undo, clearUndo, mutateSet]);

  const addNumber = useCallback(
    (participant: LessonBoardParticipant, homeworkNumberId: string, toExtra: boolean) => {
      clearUndo();
      mutateSet({ participantId: participant.id, ids: withNumber(setIdsOf(participant.items), homeworkNumberId, toExtra) });
    },
    [clearUndo, mutateSet],
  );

  const regenerate = useMutation({
    mutationFn: (participantId: string) => api.planner.regenerateParticipant(lessonId, participantId),
    onMutate: (participantId) => {
      setNotice(null);
      setBusyFor(participantId, 'regenerate');
    },
    onSuccess: (accepted, participantId) => {
      // The stale timer restarts from the moment the server accepted the retry.
      notePlanRequested(participantId, accepted.planRequestedAt);
      patchBoard((current) => markParticipantPending(current, participantId));
      void queryClient.invalidateQueries({ queryKey: qk('planner', 'listLessons') });
    },
    onError: (error) => {
      planWait.note(error);
      // `participantNotFound`, `homeworkAlreadyIssued`, `budgetExhausted`, `plannerUnavailable`, `queueFull`:
      // the previous set and error stay as they are.
      fail(error, t.regenerateFailed);
    },
    onSettled: (_result, _error, participantId) => setBusyFor(participantId, null),
  });

  const markResult = useMutation({
    mutationFn: (input: { participantId: string; itemId: string; result: LessonItemResult | null }) =>
      api.planner.setItemResult(lessonId, input.participantId, input.itemId, input.result),
    onMutate: (input) => {
      const previous = queryClient
        .getQueryData<LessonBoardModel>(boardKey)
        ?.participants.find((participant) => participant.id === input.participantId)
        ?.items.find((item) => item.id === input.itemId);
      // Optimistic: the traffic light lights up at once, the server catches up.
      patchBoard((current) => patchBoardItem(current, input.participantId, input.itemId, { result: input.result }));
      setSavingItemIds((current) => [...current, input.itemId]);
      setItemErrors((current) => {
        if (!(input.itemId in current)) return current;
        const next = { ...current };
        delete next[input.itemId];
        return next;
      });
      return { previous: previous ? { result: previous.result, studentStatus: previous.studentStatus } : null };
    },
    onSuccess: (saved, input) => {
      patchBoard((current) => patchBoardItem(current, input.participantId, input.itemId, { result: saved.result, studentStatus: saved.studentStatus }));
      // The result is mirrored onto the student's number status and appended to its history.
      invalidateAround();
    },
    onError: (error, input, context) => {
      resultWait.note(error);
      // Nothing was saved: the mark goes back to what it was (the re-read may not get through either).
      if (context?.previous) {
        const previous = context.previous;
        patchBoard((current) => patchBoardItem(current, input.participantId, input.itemId, previous));
      }
      // The error sits in the row of the number, not at the top of the board; the board is re-read.
      setItemErrors((current) => ({ ...current, [input.itemId]: errorText(error, t.saveResultFailed) }));
      void refetchBoard();
    },
    onSettled: (_result, _error, input) => setSavingItemIds((current) => current.filter((id) => id !== input.itemId)),
  });

  const schedule = useMutation({
    mutationFn: (startsAtIso: string) => api.planner.scheduleLesson(lessonId, startsAtIso),
    onMutate: () => setNotice(null),
    onSuccess: () => {
      void refetchBoard();
      invalidateAround();
    },
    onError: (error) => {
      lessonWait.note(error);
      // `invalidStartsAt`, `lessonNotFound`, `alreadyFinished`, `alreadyClosed`, `scheduleFailed`.
      fail(error, t.scheduleFailed);
    },
  });

  const finish = useMutation({
    mutationFn: () => api.planner.finishLesson(lessonId),
    onMutate: () => setNotice(null),
    onSuccess: () => {
      void refetchBoard();
      invalidateAround();
    },
    onError: (error) => {
      lessonWait.note(error);
      // `lessonNotFound`, `lessonNotActive` (the lesson has ended meanwhile), `finishFailed`.
      fail(error, t.finishFailed);
    },
  });

  const remove = useMutation({
    mutationFn: () => api.planner.deleteLesson(lessonId),
    onMutate: () => setNotice(null),
    onSuccess: () => {
      // The cached board is left alone: dropping it now would make this still-mounted screen read the
      // deleted lesson once more and flash "not found" during the transition.
      invalidateAround();
      navigation.open({ screen: 'planner.lessons' });
    },
    onError: (error) => {
      lessonWait.note(error);
      fail(error, t.deleteFailed);
    },
  });

  return {
    board,
    data,
    /** The lesson is gone (deleted, or it now belongs to another teacher). */
    notFound: board.isError && isNotFoundError(board.error),
    now,
    pendingCount,
    readyCount: participants ? countReady(participants) : 0,
    notice,
    dismissNotice: () => setNotice(null),
    busy,
    savingItemIds,
    itemErrors,
    undo,
    undoRemoval,
    waits: { plan: planWait, items: itemsWait, result: resultWait, lesson: lessonWait },
    removeItem,
    addNumber,
    regenerate: (participantId: string) => regenerate.mutate(participantId),
    markResult: (participantId: string, itemId: string, result: LessonItemResult | null) => markResult.mutate({ participantId, itemId, result }),
    schedule,
    finish,
    remove,
  };
}

export type LessonBoardController = ReturnType<typeof useLessonBoard>;
