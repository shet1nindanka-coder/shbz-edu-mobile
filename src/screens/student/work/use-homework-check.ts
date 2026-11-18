import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

import { errorText, hasErrorCode, qk, useApi } from '@/api';
import type { GetHomeworkResponse, StudentCheckDto } from '@/api/types';
import { useRetryWait, type RetryWait } from '@/components/retry-wait';
import { format, useI18n } from '@/i18n';
import { mergeQueryData } from '@/services/query';
import { useEventAnnouncement } from '@/ui';

import { applyLatestCheck, applyStartedCheck, countVerdicts, isCheckRunning } from './logic';
import { mergeLocalWrite } from './merge-local-write';
import { usePoller } from './use-poller';

export type HomeworkCheckState = {
  /** `PENDING` / `CHECKING` and the status is still being followed. */
  running: boolean;
  starting: boolean;
  /** Five polls in a row failed: the screen no longer knows the status. */
  pollBroken: boolean;
  retryPoll: () => void;
  start: () => void;
  startError: string | null;
  dismissStartError: () => void;
  /** Cool-down after `429 rateLimited` (hourly limit, daily budget) or `503 queueFull`. */
  limit: RetryWait;
};

/**
 * The AI check of a homework (docs/spec/03-student-homework-lesson.md §1 H2.b, §5.2; 90-addendum-5 A.6):
 * starting it and following it with the site's polling loop. A poll answer carries only the check into the
 * cached detail; when the check ends (DONE / FAILED) the detail is read again, as the site's
 * `router.refresh()` does — the batch and the statuses of the poll answer may be older than an upload or
 * a deletion made on this screen meanwhile (`applyLatestCheck`).
 */
export function useHomeworkCheck(options: {
  assignmentId: string;
  check: StudentCheckDto | null;
  /** The detail has been read: until then `check` null means "not known yet", not "never checked". */
  loaded: boolean;
  /** The screen is focused and the app is in the foreground. */
  live: boolean;
  onGone: () => void;
}): HomeworkCheckState {
  const { assignmentId, check, loaded, live, onGone } = options;
  const api = useApi();
  const queryClient = useQueryClient();
  const { dict } = useI18n();
  const t = dict.student.check;
  const [startError, setStartError] = useState<string | null>(null);
  const limit = useRetryWait();

  const poll = useCallback(async () => {
    const detailKey = qk('studentWork', 'getHomework', assignmentId);
    let latest;
    try {
      latest = await queryClient.fetchQuery({
        queryKey: qk('studentWork', 'getLatestHomeworkCheck', assignmentId),
        queryFn: ({ signal }) => api.studentWork.getLatestHomeworkCheck(assignmentId, { signal }),
        staleTime: 0,
        // The polling loop counts failures itself.
        retry: false,
      });
    } catch (failure) {
      if (hasErrorCode(failure, 'homeworkNotFound')) onGone();
      throw failure;
    }
    mergeQueryData<GetHomeworkResponse>(queryClient, detailKey, (detail) => applyLatestCheck(detail, latest));
    const status = latest.check?.status;
    // The check ended: the batch (a DONE check detaches it) and the statuses come from a fresh read made
    // now, after every local upload and deletion. The answer is not copied for them.
    if (status === 'DONE' || status === 'FAILED') void queryClient.invalidateQueries({ queryKey: detailKey });
    if (status === 'DONE') {
      // Statuses were written and the batch was detached: everything derived from them is stale.
      void queryClient.invalidateQueries({ queryKey: qk('studentWork', 'listHomeworks') });
      void queryClient.invalidateQueries({ queryKey: qk('studentStudy', 'getHomeworkDeadlines') });
      void queryClient.invalidateQueries({ queryKey: qk('studentStudy', 'getNumberDetail') });
      void queryClient.invalidateQueries({ queryKey: qk('shell', 'getStreak') });
      void queryClient.invalidateQueries({ queryKey: qk('shell', 'listNotifications') });
    } else if (status === 'FAILED') {
      void queryClient.invalidateQueries({ queryKey: qk('studentWork', 'listHomeworks') });
    }
  }, [api, assignmentId, onGone, queryClient]);

  const inFlight = isCheckRunning(check?.status);
  const poller = usePoller({ active: inFlight && live, poll, resetKey: check?.id ?? null });

  const start = useMutation({
    mutationFn: () => api.studentWork.startHomeworkCheck(assignmentId),
    onMutate: () => setStartError(null),
    onSuccess: (result) => {
      mergeLocalWrite<GetHomeworkResponse>(queryClient, qk('studentWork', 'getHomework', assignmentId), (detail) =>
        applyStartedCheck(detail, result.check),
      );
      void queryClient.invalidateQueries({ queryKey: qk('studentWork', 'listHomeworks') });
    },
    onError: (failure) => {
      if (hasErrorCode(failure, 'homeworkNotFound')) return onGone();
      setStartError(errorText(failure, t.startFailed));
      limit.note(failure);
      // The server sees another state than the screen (a check already runs, the batch changed, the
      // switch was turned off): read it again.
      if (hasErrorCode(failure, 'alreadyRunning', 'attachPhotosFirst', 'photosChanged', 'noNumbers', 'checkDisabled')) {
        void queryClient.invalidateQueries({ queryKey: qk('studentWork', 'getHomework', assignmentId) });
      }
    },
  });

  const running = inFlight && !poller.broken;

  // The site's live region: a screen reader hears the status changes it cannot see — only while this
  // screen is in front; a change met in the background (the stack stays mounted and keeps polling) is
  // held and the latest one is spoken on return.
  const announce = useEventAnnouncement(live);
  const announced = useRef<string | null>(null);
  useEffect(() => {
    if (!loaded) return;
    if (!check) {
      // The screen opened with no check at all: the first check the student starts is a change and is
      // announced. Not reset when a check later vanishes from the cache, so its return is not "new".
      announced.current ??= 'none';
      return;
    }
    const signature = `${check.id}:${running ? 'RUNNING' : check.status}`;
    const previous = announced.current;
    announced.current = signature;
    // Nothing is announced for the state the screen opened with.
    if (previous === null || previous === signature) return;
    if (running) announce(t.statusRunning);
    else if (check.status === 'DONE') announce(format(t.statusDone, countVerdicts(check.results)));
    else if (check.status === 'FAILED') announce(t.statusFailed);
  }, [announce, check, loaded, running, t]);

  const { mutate } = start;
  return {
    running,
    starting: start.isPending,
    pollBroken: inFlight && poller.broken,
    retryPoll: poller.retry,
    start: useCallback(() => mutate(), [mutate]),
    startError,
    dismissStartError: useCallback(() => setStartError(null), []),
    limit,
  };
}
