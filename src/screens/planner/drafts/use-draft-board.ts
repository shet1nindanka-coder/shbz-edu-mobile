import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

import { errorText, isNotFoundError, qk, useApi } from '@/api';
import type { HomeworkPlanBoardModel, HomeworkPlanItem, HomeworkPlanParticipant } from '@/api/types';
import { POLLING } from '@/api/types/limits';
import { notePlanRequested, planRequestedAtOf } from '@/components/lessons';
import { useRetryWait } from '@/components/retry-wait';
import { serverClockOffset } from '@/domain/server-clock';
import { format, plural, useI18n } from '@/i18n';

import { countReady, planSignature, planStateOf, statusRowsOnBoard } from '../shared/plan-state';
import { usePlanProgressObservers } from '../shared/use-plan-progress-observers';
import { useAppNavigation, useRefetchOnFocus, useScreenLive, useStillHere } from '@/navigation';
import { useNowTick } from '@/services/clock';
import { mergeQueryData, refreshQueries } from '@/services/query';
import {
  countIssuable,
  countIssued,
  idsWith,
  idsWithout,
  issueOutcomeOf,
  issueStampSignature,
  markDraftParticipantPending,
  replaceDraftItems,
  toDraftItems,
  type IssueOutcome,
} from './drafts-logic';

export type DraftNotice = { tone: 'success' | 'error'; text: string };

/** What one participant is busy with (its controls are disabled meanwhile). */
export type DraftParticipantBusy = 'items' | 'regenerate' | 'issue';

/**
 * Data and actions of the homework-draft board (docs/spec/05-teacher-lessons-plans.md §1.7, §3.6, §3.7,
 * §3.15, §3.16, §5.2): the board query, the generation poll (every 2 s while a plan is being built) and
 * every mutation with its cache updates.
 */
export function useDraftBoard(planId: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  const navigation = useAppNavigation();
  const stillHere = useStillHere();
  const { dict, locale } = useI18n();
  const t = dict.planner.homeworkPlans.board;
  const boardKey = qk('planner', 'getHomeworkPlanBoard', planId);

  // Days until the deadline, issue stamps and the AI switch are computed at response time: always re-read.
  const board = useQuery({ queryKey: boardKey, queryFn: () => api.planner.getHomeworkPlanBoard(planId), refetchOnMount: 'always' });
  // The board stays mounted under the screens it opens (the student card, the source lesson): what went
  // stale meanwhile is re-read when it comes back (00 §2.3 "refetch on focus" — the realtime fallback).
  useRefetchOnFocus([board]);
  // The generation poll below runs only while the board is on screen and the app is in the foreground.
  const screenLive = useScreenLive();
  const data = board.data;
  const refetchBoard = board.refetch;
  /**
   * A re-read asked for by the server side (the generation poll saw a new plan or issue stamp): unlike
   * `refetchBoard` it never cancels a read in flight (most likely a realtime refresh of the same change)
   * and is followed by one more read instead. `refetchBoard` stays for the teacher's own actions.
   */
  const refreshBoard = useCallback(
    () => void refreshQueries(queryClient, { queryKey: qk('planner', 'getHomeworkPlanBoard', planId), exact: true }),
    [queryClient, planId],
  );
  const boardUpdatedAt = board.dataUpdatedAt;
  const boardFetching = board.isFetching;

  // The stale-plan clock: the device clock corrected by the server's.
  const deviceNow = useNowTick(30_000);
  // `boardUpdatedAt` is the time of the last real read: local patches keep it (see `patchBoard`).
  const now = deviceNow + serverClockOffset(data?.serverNow, boardUpdatedAt);
  /** Device time of the latest local patch of the cached board (the poll guard below needs it). */
  const patchedAt = useRef(0);

  const [notice, setNotice] = useState<DraftNotice | null>(null);
  const [issueFailures, setIssueFailures] = useState<IssueOutcome['failures']>([]);
  const [busy, setBusy] = useState<Record<string, DraftParticipantBusy>>({});
  const [issuingAll, setIssuingAll] = useState(false);

  // One countdown per rate-limit bucket: regenerate shares `api:lesson-plan` (10 / 60 s) with creating a
  // lesson; set saves (60 / 60 s); issue and delete share `api:homework-plan` (30 / 60 s).
  const planWait = useRetryWait();
  const itemsWait = useRetryWait();
  const draftWait = useRetryWait();

  const patchBoard = useCallback(
    (update: (current: HomeworkPlanBoardModel) => HomeworkPlanBoardModel) => {
      // The fetch time stays as it was: the board clock pairs it with `serverNow` of that fetch.
      mergeQueryData<HomeworkPlanBoardModel>(queryClient, boardKey, update);
      patchedAt.current = Date.now();
    },
    // The key is rebuilt on every render from the same strings.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [queryClient, planId],
  );

  const fail = useCallback(
    (error: unknown, fallback: string) => {
      setNotice({ tone: 'error', text: errorText(error, fallback) });
      // A participant or the whole draft that is gone (404), or a set that was issued or changed under
      // the teacher (409): show what is really there now.
      void refetchBoard();
    },
    [refetchBoard],
  );

  const setBusyFor = (participantId: string, value: DraftParticipantBusy | null) =>
    setBusy((current) => {
      const next = { ...current };
      if (value) next[participantId] = value;
      else delete next[participantId];
      return next;
    });

  // ───────────────────────────── plan generation poll ─────────────────────────────

  const participants = data?.participants;
  const pendingCount = participants ? participants.filter((participant) => planStateOf(participant, now, planRequestedAtOf(participant.id)).pending).length : 0;
  const polling = pendingCount > 0;

  const status = useQuery({
    queryKey: qk('planner', 'getHomeworkPlanStatus', planId),
    queryFn: () => api.planner.getHomeworkPlanStatus(planId),
    enabled: polling && screenLive,
    refetchInterval: polling && screenLive ? POLLING.planStatusBoardMs : false,
    // A failed poll is ignored: the next tick tries again.
    retry: false,
    staleTime: 0,
    gcTime: 0,
  });
  const statusData = status.data;
  const statusUpdatedAt = status.dataUpdatedAt;
  const lastStamps = useRef<string | null>(null);

  useEffect(() => {
    if (!polling) lastStamps.current = null;
  }, [polling]);

  useEffect(() => {
    if (!polling || !participants || !statusData || boardFetching) return;
    // A status older than the board describes the past (e.g. the moment before an accepted "Regenerate").
    if (statusUpdatedAt < Math.max(boardUpdatedAt, patchedAt.current)) return;
    const rows = statusRowsOnBoard(
      statusData.participants,
      participants.map((participant) => participant.id),
    );
    const stamps = issueStampSignature(rows);
    // The first value only initialises the comparison: the board may hide a stamp the status still reports.
    const stampsMoved = lastStamps.current !== null && lastStamps.current !== stamps;
    lastStamps.current = stamps;
    if (stampsMoved || planSignature(rows) !== planSignature(participants)) refreshBoard();
  }, [polling, participants, statusData, statusUpdatedAt, boardUpdatedAt, boardFetching, refreshBoard]);

  // A plan that arrived or failed also changes the drafts list (its «ошибок: N» chip): it is not polled. A
  // server-side change, so the re-read never cancels a list read already in flight (`refreshQueries`).
  const refreshDraftList = useCallback(() => void refreshQueries(queryClient, { queryKey: qk('planner', 'listHomeworkPlans') }), [queryClient]);
  usePlanProgressObservers(participants, refreshDraftList);

  // ───────────────────────────── set editing ─────────────────────────────

  const saveSet = useMutation({
    mutationFn: (input: { participantId: string; ids: string[] }) => api.planner.saveLessonItems(planId, input.participantId, input.ids, []),
    onMutate: (input) => {
      setNotice(null);
      setBusyFor(input.participantId, 'items');
    },
    onSuccess: (items, input) => {
      patchBoard((current) => replaceDraftItems(current, input.participantId, toDraftItems(items)));
    },
    onError: (error) => {
      itemsWait.note(error);
      // `numbersRequired`, `participantNotFound`, `homeworkAlreadyIssued`, `blockedNumbers`, `saveFailed`.
      fail(error, t.saveItemsFailed);
    },
    onSettled: (_result, _error, input) => setBusyFor(input.participantId, null),
  });
  const mutateSet = saveSet.mutate;

  // No undo toast on this board: a removed number is one tap away in "add a problem".
  const removeItem = useCallback(
    (participant: HomeworkPlanParticipant, item: HomeworkPlanItem) => mutateSet({ participantId: participant.id, ids: idsWithout(participant.items, item.id) }),
    [mutateSet],
  );

  const addNumber = useCallback(
    (participant: HomeworkPlanParticipant, homeworkNumberId: string) => mutateSet({ participantId: participant.id, ids: idsWith(participant.items, homeworkNumberId) }),
    [mutateSet],
  );

  // ───────────────────────────── regenerate ─────────────────────────────

  const regenerate = useMutation({
    mutationFn: (participantId: string) => api.planner.regenerateParticipant(planId, participantId),
    onMutate: (participantId) => {
      setNotice(null);
      setBusyFor(participantId, 'regenerate');
    },
    onSuccess: (accepted, participantId) => {
      // The stale timer restarts from the moment the server accepted the request.
      notePlanRequested(participantId, accepted.planRequestedAt);
      patchBoard((current) => markDraftParticipantPending(current, participantId));
      void queryClient.invalidateQueries({ queryKey: qk('planner', 'listHomeworkPlans') });
    },
    onError: (error) => {
      planWait.note(error);
      // `participantNotFound`, `homeworkAlreadyIssued`, `budgetExhausted`, `plannerUnavailable`, `queueFull`:
      // the previous set and error stay as they are.
      fail(error, t.regenerateFailed);
    },
    onSettled: (_result, _error, participantId) => setBusyFor(participantId, null),
  });

  // ───────────────────────────── issue ─────────────────────────────

  const issue = useMutation({
    // `null` = «Выдать всем»: an empty list means every participant, the empty sets included.
    mutationFn: (participantId: string | null) => api.planner.issueHomeworkPlan(planId, participantId ? [participantId] : []),
    onMutate: (participantId) => {
      setNotice(null);
      setIssueFailures([]);
      if (participantId) setBusyFor(participantId, 'issue');
      else setIssuingAll(true);
    },
    onSuccess: (result) => {
      const outcome = issueOutcomeOf(result);
      if (outcome.notice === 'issuedTo') {
        setNotice({ tone: 'success', text: format(t.issuedTo, { n: plural(locale, outcome.issuedCount, t.issuedToForms) }) });
      } else if (outcome.notice === 'alreadyIssued') {
        setNotice({ tone: 'success', text: t.alreadyIssued });
      }
      setIssueFailures(outcome.failures);
      void refetchBoard();
      void queryClient.invalidateQueries({ queryKey: qk('planner', 'listHomeworkPlans') });
      // The new homework appears on the student's card, the assign board and the teacher's overview.
      if (outcome.issuedCount > 0) void queryClient.invalidateQueries({ queryKey: qk('teacherStudents') });
    },
    onError: (error) => {
      draftWait.note(error);
      // `missingTopicOrDeadline`, `deadlinePassed`, `draftNotFound`.
      fail(error, t.issueFailed);
    },
    onSettled: (_result, _error, participantId) => {
      if (participantId) setBusyFor(participantId, null);
      else setIssuingAll(false);
    },
  });

  // ───────────────────────────── delete ─────────────────────────────

  const remove = useMutation({
    mutationFn: () => api.planner.deleteHomeworkPlan(planId),
    onMutate: () => setNotice(null),
    onSuccess: () => {
      // The cached board is left alone: dropping it now would make this still-mounted screen read the
      // deleted draft once more and flash "not found" during the transition.
      void queryClient.invalidateQueries({ queryKey: qk('planner', 'listHomeworkPlans') });
      // Only from the board itself: a teacher who has left it meanwhile is not moved.
      if (stillHere()) navigation.open({ screen: 'planner.drafts' });
    },
    onError: (error) => {
      draftWait.note(error);
      fail(error, t.deleteFailed);
    },
  });

  const anyBusy = issuingAll || Object.keys(busy).length > 0;

  return {
    board,
    data,
    /** The draft is gone (deleted, its topic was removed, or it now belongs to another teacher). */
    notFound: board.isError && isNotFoundError(board.error),
    now,
    pendingCount,
    readyCount: participants ? countReady(participants) : 0,
    issuedCount: participants ? countIssued(participants) : 0,
    issuableCount: participants ? countIssuable(participants) : 0,
    notice,
    dismissNotice: () => setNotice(null),
    issueFailures,
    dismissIssueFailures: () => setIssueFailures([]),
    busy,
    issuingAll,
    anyBusy,
    waits: { plan: planWait, items: itemsWait, draft: draftWait },
    removeItem,
    addNumber,
    regenerate: (participantId: string) => regenerate.mutate(participantId),
    issueOne: (participantId: string) => issue.mutate(participantId),
    issueAll: () => issue.mutate(null),
    remove,
  };
}

export type DraftBoardController = ReturnType<typeof useDraftBoard>;
