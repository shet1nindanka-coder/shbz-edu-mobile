import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

import { hasErrorCode, qk, useApi } from '@/api';
import type { ActiveLessonDto, GetLessonResponse, LessonItemDto, PhotoUpload } from '@/api/types';
import { useI18n } from '@/i18n';

import { errorText } from './error-text';
import { applyLessonState, applySubmission, hasRunningSubmission } from './logic';
import { usePoller } from './use-poller';
import { useRateLimit, type RateLimitWait } from './use-rate-limit';

export type LiveLessonState = {
  /** Sends the photos of one item for checking. */
  submit: (item: LessonItemDto, files: PhotoUpload[]) => void;
  /** Item whose photos are being uploaded right now; every submit control is off meanwhile. */
  uploadingItemId: string | null;
  /** 0..100 of that upload. */
  uploadPercent: number;
  /** Last failed submit per item id. */
  submitErrors: Record<string, string>;
  dismissSubmitError: (itemId: string) => void;
  pollBroken: boolean;
  retryPoll: () => void;
  /** Cool-down after `429 rateLimited` (hourly limit, daily budget) or `503 queueFull`. */
  limit: RateLimitWait;
};

function withoutKey(record: Record<string, string>, key: string): Record<string, string> {
  if (!(key in record)) return record;
  const next = { ...record };
  delete next[key];
  return next;
}

/**
 * The moving parts of a live lesson (docs/spec/03-student-homework-lesson.md §1 L2, §5.2; 90-addendum-5
 * A.5.8 – A.5.10, A.6): the "I am in class" call, submitting photos per item, and following the checks
 * with the site's polling loop. Every answer is folded into the cached lesson, so the cards, the summary
 * and the lock of the extra part follow without re-reading the whole lesson.
 */
export function useLiveLesson(lesson: ActiveLessonDto, live: boolean): LiveLessonState {
  const api = useApi();
  const queryClient = useQueryClient();
  const { dict } = useI18n();
  const t = dict.student.lessonView;
  const lessonId = lesson.lessonId;

  const [uploading, setUploading] = useState<{ itemId: string; percent: number } | null>(null);
  const [submitErrors, setSubmitErrors] = useState<Record<string, string>>({});
  // Grows with every accepted submission: the polling loop starts over with a clean failure counter.
  const [submitEpoch, setSubmitEpoch] = useState(0);
  const limit = useRateLimit();

  // "I am in class": once per entry into the live lesson, and only while the tab is really in front —
  // the call marks the student present. A failure never blocks the screen (the site swallows it too).
  const join = useMutation({ mutationFn: (id: string) => api.studentWork.joinLesson(id) });
  const { mutate: sendJoin } = join;
  const joinedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!live || joinedFor.current === lessonId) return;
    joinedFor.current = lessonId;
    sendJoin(lessonId, {
      onSuccess: ({ joinedAt }) => {
        queryClient.setQueryData<GetLessonResponse>(qk('studentWork', 'getLiveLesson'), (current) =>
          current?.active && current.active.lessonId === lessonId
            ? { ...current, active: { ...current.active, joinedAt } }
            : current,
        );
      },
      onError: (failure) => {
        // The lesson is over or was removed: let the tab go back to the waiting state.
        if (hasErrorCode(failure, 'lessonNotActive', 'lessonNotFound')) {
          void queryClient.invalidateQueries({ queryKey: qk('studentWork', 'getLiveLesson') });
        }
      },
    });
  }, [lessonId, live, queryClient, sendJoin]);

  const poll = useCallback(async () => {
    const lessonKey = qk('studentWork', 'getLiveLesson');
    let state;
    try {
      state = await queryClient.fetchQuery({
        queryKey: qk('studentWork', 'getLiveLessonState', lessonId),
        queryFn: ({ signal }) => api.studentWork.getLiveLessonState(lessonId, { signal }),
        staleTime: 0,
        // The polling loop counts failures itself.
        retry: false,
      });
    } catch (failure) {
      if (hasErrorCode(failure, 'lessonNotFound')) void queryClient.invalidateQueries({ queryKey: lessonKey });
      throw failure;
    }
    let resultChanged = false;
    queryClient.setQueryData<GetLessonResponse>(lessonKey, (current) => {
      if (!current?.active || current.active.lessonId !== lessonId) return current;
      const merged = applyLessonState(current, state);
      resultChanged = merged.resultChanged;
      return merged.next;
    });
    if (resultChanged) {
      // A lesson result is mirrored into the number's status: homework screens and the streak are stale.
      void queryClient.invalidateQueries({ queryKey: qk('studentWork', 'listHomeworks') });
      void queryClient.invalidateQueries({ queryKey: qk('studentWork', 'getHomework') });
      void queryClient.invalidateQueries({ queryKey: qk('studentStudy', 'getHomeworkDeadlines') });
      void queryClient.invalidateQueries({ queryKey: qk('studentStudy', 'getNumberDetail') });
      void queryClient.invalidateQueries({ queryKey: qk('shell', 'getStreak') });
    }
    // The scheduled end was reached or the teacher finished early: the tab returns to the waiting state.
    if (state.status !== 'ACTIVE') void queryClient.invalidateQueries({ queryKey: lessonKey });
  }, [api, lessonId, queryClient]);

  const checking = hasRunningSubmission(lesson.items);
  const poller = usePoller({ active: checking && live, poll, resetKey: `${lessonId}:${submitEpoch}` });

  const submission = useMutation({
    mutationFn: ({ item, files }: { item: LessonItemDto; files: PhotoUpload[] }) =>
      api.studentWork.submitLessonItem(lessonId, item.id, files, {
        onProgress: (percent) => setUploading({ itemId: item.id, percent }),
      }),
    onMutate: ({ item }) => {
      setUploading({ itemId: item.id, percent: 0 });
      setSubmitErrors((current) => withoutKey(current, item.id));
    },
    onSuccess: (result) => {
      queryClient.setQueryData<GetLessonResponse>(qk('studentWork', 'getLiveLesson'), (current) =>
        current ? applySubmission(current, result.submission) : current,
      );
      setSubmitEpoch((value) => value + 1);
    },
    onError: (failure, { item }) => {
      setSubmitErrors((current) => ({ ...current, [item.id]: errorText(failure, t.submitFailed) }));
      limit.note(failure);
      // The server sees another state than the screen: the lesson ended, the item was accepted or is
      // being checked, the extra part is locked, the check was switched off. Read the lesson again.
      if (
        hasErrorCode(
          failure,
          'lessonNotActive',
          'lessonNotFound',
          'itemNotFound',
          'alreadyAccepted',
          'extraPartLocked',
          'alreadyRunning',
          'checkDisabled',
        )
      ) {
        void queryClient.invalidateQueries({ queryKey: qk('studentWork', 'getLiveLesson') });
      }
    },
    onSettled: () => setUploading(null),
  });
  const { mutate: sendSubmission } = submission;

  return {
    submit: useCallback((item, files) => sendSubmission({ item, files }), [sendSubmission]),
    uploadingItemId: uploading?.itemId ?? null,
    uploadPercent: uploading?.percent ?? 0,
    submitErrors,
    dismissSubmitError: useCallback((itemId) => setSubmitErrors((current) => withoutKey(current, itemId)), []),
    pollBroken: checking && poller.broken,
    retryPoll: poller.retry,
    limit,
  };
}
