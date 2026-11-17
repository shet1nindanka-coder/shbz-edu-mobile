import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { errorText, isNotFoundError, qk, useApi } from '@/api';
import type { LessonItemResult, TeacherStudentLesson } from '@/api/types';
import { POLLING } from '@/api/types/limits';
import { notePlanRequested, planRequestedAtOf } from '@/components/lessons';
import { useRetryWait } from '@/components/retry-wait';
import { useI18n } from '@/i18n';
// One memory of accepted "Retry" requests for the lesson board and this card: a plan retried on either
// screen is not shown as "lost" on the other.

import { invalidateStudentData } from './invalidate';
import {
  lessonPlanState,
  lessonSetIds,
  markLessonPending,
  patchItemResult,
  patchLessonItems,
  planSettled,
  setWithNumber,
  setWithoutNumber,
  syncPendingSince,
  type LessonItem,
  type LessonPlanState,
  type LessonSetIds,
} from './lessons-logic';
import { useRefetchOnFocus, useScreenLive } from '@/navigation';
import { useNowTick } from '@/services/clock';

/** What one lesson is busy with: its set-editing controls are disabled meanwhile. */
export type LessonBusy = 'items' | 'regenerate';

type LessonsData = { lessons: TeacherStudentLesson[] };
type Results = Record<string, LessonItemResult | null>;

function without<T>(record: Record<string, T>, ids: readonly string[]): Record<string, T> {
  const next = { ...record };
  for (const id of ids) delete next[id];
  return next;
}

/**
 * Data and writes of the "Lessons" segment (docs/spec/04-teacher-students.md S6, §3.11 – §3.13, §5.2):
 * the student's lessons, the 2.5 s plan-status poll while a plan is being built, optimistic lesson
 * results, set editing and "Retry" of the AI selection. Errors are kept per lesson — they are shown
 * inside the card the action was taken in.
 */
export function useStudentLessons(studentId: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  const { dict } = useI18n();
  const t = dict.students.lessons;
  // The plan poll runs only while this screen is focused AND the app is in the foreground: TanStack's focus
  // manager does not follow AppState on React Native, so a background tick would keep hitting the server.
  const screenLive = useScreenLive();
  const now = useNowTick(30_000);

  const key = qk('teacherStudents', 'listStudentLessons', studentId);
  // The site does not cache this read: lesson statuses follow the clock.
  const list = useQuery({ queryKey: key, queryFn: () => api.teacherStudents.listStudentLessons(studentId), refetchOnMount: 'always' });
  useRefetchOnFocus([list]);
  const refetch = list.refetch;
  const data = list.data;

  // Results of the writes that are in flight; a settled write lives in the query cache instead.
  const [resultOverrides, setResultOverrides] = useState<Results>({});
  const [savingItemIds, setSavingItemIds] = useState<readonly string[]>([]);
  const [busy, setBusy] = useState<Record<string, LessonBusy>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  // One countdown per rate-limit bucket: results 240 / 60 s, set saves 60 / 60 s, plan 10 / 60 s.
  const resultWait = useRetryWait();
  const itemsWait = useRetryWait();
  const planWait = useRetryWait();
  const noteResultWait = resultWait.note;
  const noteItemsWait = itemsWait.note;
  const notePlanWait = planWait.note;

  const patch = useCallback(
    (update: (current: LessonsData) => LessonsData) => {
      queryClient.setQueryData<LessonsData>(qk('teacherStudents', 'listStudentLessons', studentId), (current) => (current ? update(current) : current));
    },
    [queryClient, studentId],
  );

  const fail = useCallback((lessonId: string, error: unknown, fallback: string) => {
    setErrors((current) => ({ ...current, [lessonId]: errorText(error, fallback) }));
  }, []);

  // ───────────────────────────── plan generation poll ─────────────────────────────

  const pendingLessons = useMemo(() => data?.lessons.filter((lesson) => lesson.planPending) ?? [], [data]);
  const statuses = useQueries({
    queries: pendingLessons.map((lesson) => ({
      queryKey: qk('planner', 'getLessonStatus', lesson.id),
      queryFn: () => api.planner.getLessonStatus(lesson.id),
      enabled: screenLive,
      refetchInterval: screenLive ? POLLING.planStatusStudentCardMs : false,
      // A failed poll is ignored: the next tick tries again.
      retry: false,
      staleTime: 0,
      gcTime: 0,
    })),
  });
  // When this screen first saw each lesson pending (the site's `pendingSinceRef`): the 15-minute "lost"
  // timer starts here, not at `lesson.createdAt`, so an old lesson whose plan is being rebuilt shows the
  // spinner after an app restart. Held per mount, like the site page: re-opening the tab starts it anew.
  // No re-render is needed after stamping: an unstamped lesson already reads as pending, and the stamp is
  // "now", so the 30 s tick is what eventually moves it to "stale".
  const pendingSince = useRef(new Map<string, number>());
  const pendingKey = pendingLessons.map((lesson) => lesson.id).join(' ');
  useEffect(() => {
    syncPendingSince(pendingSince.current, pendingKey === '' ? [] : pendingKey.split(' '), Date.now());
  }, [pendingKey]);

  const listUpdatedAt = list.dataUpdatedAt;
  const listFetching = list.isFetching;
  // A status older than the list describes the past (e.g. the moment before an accepted "Retry").
  const settled = pendingLessons.some((lesson, index) => {
    const status = statuses[index];
    return status !== undefined && status.dataUpdatedAt >= listUpdatedAt && planSettled(status.data, lesson.participantId);
  });
  useEffect(() => {
    if (settled && !listFetching) void refetch();
  }, [settled, listFetching, refetch]);

  // ───────────────────────────── lesson result of one item ─────────────────────────────

  const result = useMutation({
    mutationFn: (input: { lesson: TeacherStudentLesson; item: LessonItem; result: LessonItemResult | null }) =>
      api.planner.setItemResult(input.lesson.id, input.lesson.participantId, input.item.id, input.result),
    onMutate: (input) => {
      setResultOverrides((current) => ({ ...current, [input.item.id]: input.result }));
      setSavingItemIds((current) => [...current.filter((id) => id !== input.item.id), input.item.id]);
      setErrors((current) => without(current, [input.lesson.id]));
    },
    onSuccess: (response, input) => patch((current) => patchItemResult(current, input.lesson.id, input.item.id, response.result)),
    onError: (error, input) => {
      // invalidResult, itemNotFound, rateLimited, no connection: the optimistic mark is taken back.
      fail(input.lesson.id, error, t.errors.saveResult);
      noteResultWait(error);
    },
    onSettled: (_response, _error, input) => {
      setResultOverrides((current) => without(current, [input.item.id]));
      setSavingItemIds((current) => current.filter((id) => id !== input.item.id));
      // The result mirrors onto the number's colour: the review, the assign board and the lesson board.
      invalidateStudentData(queryClient);
    },
  });

  // ───────────────────────────── the set ─────────────────────────────

  // The trash icon has no press guard and `busy` disables it one render late: one set write per lesson at a time.
  const itemsInFlight = useRef(new Set<string>());
  const saveItems = (lesson: TeacherStudentLesson, ids: LessonSetIds) => {
    if (itemsInFlight.current.has(lesson.id)) return;
    itemsInFlight.current.add(lesson.id);
    items.mutate({ lesson, ids });
  };

  const items = useMutation({
    mutationFn: (input: { lesson: TeacherStudentLesson; ids: LessonSetIds }) =>
      api.planner.saveLessonItems(input.lesson.id, input.lesson.participantId, input.ids.mainIds, input.ids.extraIds),
    onMutate: (input) => {
      setBusy((current) => ({ ...current, [input.lesson.id]: 'items' }));
      setErrors((current) => without(current, [input.lesson.id]));
    },
    onSuccess: (saved, input) => patch((current) => patchLessonItems(current, input.lesson.id, saved)),
    onError: (error, input) => {
      // numbersRequired, participantNotFound, homeworkAlreadyIssued, blockedNumbers (the message names
      // the numbers the student has already submitted), rateLimited, no connection.
      fail(input.lesson.id, error, t.errors.saveItems);
      noteItemsWait(error);
    },
    onSettled: (_saved, _error, input) => {
      itemsInFlight.current.delete(input.lesson.id);
      setBusy((current) => without(current, [input.lesson.id]));
      invalidateStudentData(queryClient);
    },
  });

  // ───────────────────────────── retry of the AI selection ─────────────────────────────

  const regenerate = useMutation({
    mutationFn: (lesson: TeacherStudentLesson) => api.planner.regenerateParticipant(lesson.id, lesson.participantId),
    onMutate: (lesson) => {
      setBusy((current) => ({ ...current, [lesson.id]: 'regenerate' }));
      setErrors((current) => without(current, [lesson.id]));
    },
    onSuccess: (response, lesson) => {
      notePlanRequested(lesson.participantId, response.planRequestedAt);
      // Pending again at once; the previous set stays until the new plan replaces it.
      patch((current) => markLessonPending(current, lesson.id));
    },
    onError: (error, lesson) => {
      // participantNotFound, homeworkAlreadyIssued, budgetExhausted (no wait is named), plannerUnavailable,
      // queueFull, rateLimited, no connection.
      fail(lesson.id, error, t.errors.regenerate);
      notePlanWait(error);
      if (isNotFoundError(error)) void refetch();
    },
    onSettled: (_response, _error, lesson) => {
      setBusy((current) => without(current, [lesson.id]));
      void queryClient.invalidateQueries({ queryKey: qk('planner') });
    },
  });

  /** The lessons with the in-flight results applied. */
  const lessons = useMemo(
    () =>
      data?.lessons.map((lesson) =>
        lesson.items.some((item) => item.id in resultOverrides)
          ? { ...lesson, items: lesson.items.map((item) => (item.id in resultOverrides ? { ...item, result: resultOverrides[item.id] ?? null } : item)) }
          : lesson,
      ),
    [data, resultOverrides],
  );

  const planStateOf = useCallback(
    (lesson: TeacherStudentLesson): LessonPlanState =>
      lessonPlanState(lesson, now, pendingSince.current.get(lesson.id), planRequestedAtOf(lesson.participantId)),
    [now],
  );

  return {
    list,
    lessons,
    now,
    busy,
    savingItemIds,
    errors,
    waits: { result: resultWait, items: itemsWait, plan: planWait },
    planStateOf,
    markResult: (lesson: TeacherStudentLesson, item: LessonItem, value: LessonItemResult | null) => result.mutate({ lesson, item, result: value }),
    removeItem: (lesson: TeacherStudentLesson, item: LessonItem) =>
      saveItems(lesson, setWithoutNumber(lessonSetIds(lesson.items), item.homeworkNumberId)),
    addNumber: (lesson: TeacherStudentLesson, homeworkNumberId: string, toExtra: boolean) =>
      saveItems(lesson, setWithNumber(lessonSetIds(lesson.items), homeworkNumberId, toExtra)),
    regenerate: (lesson: TeacherStudentLesson) => regenerate.mutate(lesson),
    dismissError: (lessonId: string) => setErrors((current) => without(current, [lessonId])),
  };
}

export type StudentLessonsController = ReturnType<typeof useStudentLessons>;
