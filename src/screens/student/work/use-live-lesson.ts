import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

import { errorText, hasErrorCode, qk, useApi } from '@/api';
import type { ActiveLessonDto, GetLessonResponse, LessonItemDto, PhotoUpload } from '@/api/types';
import { useRetryWait, type RetryWait } from '@/components/retry-wait';
import { checkErrorText } from '@/domain/solution-check-error-text';
import { format, useI18n } from '@/i18n';
import { mergeQueryData, refreshQueries } from '@/services/query';
import { useEventAnnouncement } from '@/ui';

import { applyLessonState, applySubmission, hasRunningSubmission, lessonItemChip, trackLessonOutcomes } from './logic';
import { mergeLocalWrite } from './merge-local-write';
import { usePoller } from './use-poller';

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
  limit: RetryWait;
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
  const { dict, m } = useI18n();
  const t = dict.student.lessonView;
  const lessonId = lesson.lessonId;

  const [uploading, setUploading] = useState<{ itemId: string; percent: number } | null>(null);
  const [submitErrors, setSubmitErrors] = useState<Record<string, string>>({});
  // Grows with every accepted submission: the polling loop starts over with a clean failure counter.
  const [submitEpoch, setSubmitEpoch] = useState(0);
  const limit = useRetryWait();

  // "I am in class": on entry into the live lesson until it has gone through, and only while the tab is
  // really in front — the call marks the student present. A failure never blocks the screen (the site
  // swallows it too) and is repeated on the next entry.
  const join = useMutation({ mutationFn: (id: string) => api.studentWork.joinLesson(id) });
  const { mutate: sendJoin } = join;
  const joinedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!live || joinedFor.current === lessonId) return;
    joinedFor.current = lessonId;
    sendJoin(lessonId, {
      onSuccess: ({ joinedAt }) => {
        mergeQueryData<GetLessonResponse>(queryClient, qk('studentWork', 'getLiveLesson'), (current) =>
          current.active && current.active.lessonId === lessonId
            ? { ...current, active: { ...current.active, joinedAt } }
            : current,
        );
      },
      onError: (failure) => {
        // The lesson is over or was removed: let the tab go back to the waiting state.
        if (hasErrorCode(failure, 'lessonNotActive', 'lessonNotFound')) {
          void queryClient.invalidateQueries({ queryKey: qk('studentWork', 'getLiveLesson') });
          return;
        }
        // Not joined yet (no connection, 429, 503): the next entry into the tab sends the call again, as
        // every new visit of the site's lesson page does. Never retried on the spot — only a later
        // `live` false → true transition re-runs this effect.
        if (joinedFor.current === lessonId) joinedFor.current = null;
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
      // Poll answers are server-driven: re-read without cancelling a read already on its way
      // (`refreshQueries`); only the student's own writes below cancel on purpose.
      if (hasErrorCode(failure, 'lessonNotFound')) void refreshQueries(queryClient, { queryKey: lessonKey, exact: true });
      throw failure;
    }
    // `applyLessonState` keeps an item's submission when the answer is older than it (read on the server
    // before a photo sent from here), so the item stays "checking" and the loop keeps polling until the
    // server state catches up.
    let resultChanged = false;
    mergeQueryData<GetLessonResponse>(queryClient, lessonKey, (current) => {
      if (!current.active || current.active.lessonId !== lessonId) return current;
      const merged = applyLessonState(current, state);
      resultChanged = merged.resultChanged;
      return merged.next;
    });
    if (resultChanged) {
      // A lesson result is mirrored into the number's status: homework screens and the streak are stale.
      void refreshQueries(queryClient, { queryKey: qk('studentWork', 'listHomeworks') });
      void refreshQueries(queryClient, { queryKey: qk('studentWork', 'getHomework') });
      void refreshQueries(queryClient, { queryKey: qk('studentStudy', 'getHomeworkDeadlines') });
      void refreshQueries(queryClient, { queryKey: qk('studentStudy', 'getNumberDetail') });
      void refreshQueries(queryClient, { queryKey: qk('shell', 'getStreak') });
    }
    // The scheduled end was reached or the teacher finished early: the tab returns to the waiting state.
    if (state.status !== 'ACTIVE') void refreshQueries(queryClient, { queryKey: lessonKey, exact: true });
  }, [api, lessonId, queryClient]);

  // The outcome of a photo the student is waiting for is spoken: the "checking" line it replaces was the
  // only live region, and the chip, the comment and the failure line that appear instead have none (an
  // `alert` role is silent on Android, iOS has no live regions). One direct announcement per finished
  // check, on both platforms, and nothing for the state the screen opened with (`trackLessonOutcomes`).
  // Only the screen the student is on speaks (another tab can be updated by a realtime re-read): an
  // outcome met in the background is held and spoken on return (`useEventAnnouncement`).
  const announce = useEventAnnouncement(live);
  const runningSeen = useRef<Map<string, string>>(new Map());
  useEffect(() => {
    const tracked = trackLessonOutcomes(runningSeen.current, lesson.items);
    runningSeen.current = tracked.running;
    if (tracked.finished.length === 0) return;
    const texts: string[] = [];
    for (const itemId of tracked.finished) {
      const item = lesson.items.find((candidate) => candidate.id === itemId);
      const submission = item?.submission;
      if (!item || !submission) continue;
      let outcome: string;
      if (submission.status === 'FAILED') {
        outcome = checkErrorText(submission.errorCode, dict.student.checkErrors);
      } else {
        const chip = lessonItemChip(item);
        const label = chip?.kind === 'result' ? t.results[chip.result] : chip?.kind === 'verdict' ? t.verdicts[chip.verdict] : '';
        outcome = [label, submission.comment ?? ''].filter((part) => part.trim() !== '').join('. ');
      }
      if (outcome) texts.push(format(m.studentWork.lesson.outcomeA11y, { number: item.number, outcome }));
    }
    if (texts.length === 0) return;
    announce(texts.join(' '));
  }, [announce, dict.student.checkErrors, lesson.items, m.studentWork.lesson.outcomeA11y, t]);

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
      mergeLocalWrite<GetLessonResponse>(queryClient, qk('studentWork', 'getLiveLesson'), (current) =>
        applySubmission(current, result.submission),
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
