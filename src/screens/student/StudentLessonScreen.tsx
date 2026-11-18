import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { errorText, qk, useApi } from '@/api';
import { LoadFailure, isLoadFailed } from '@/components/load-failure';
import { serverClockOffset } from '@/domain/server-clock';
import { useI18n } from '@/i18n';
import { ShellAppBar, screenTitle } from '@/screens/shell';
import { useServerNow } from '@/services/clock';
import { useKeepScreenAwake } from '@/services/keep-awake';
import { refreshQueries, usePullRefresh } from '@/services/query';
import { LoadingState, Notice, Screen } from '@/ui';

import { LessonLive } from './work/lesson-live';
import { LessonWaiting } from './work/lesson-waiting';
import { UNAVAILABLE_RECHECK_MS, delayUntilLessonEdge, secondsUntil } from './work/logic';
import { useOnReturn, useScreenLive } from './work/use-screen-live';

/**
 * A response younger than this that still shows a moment already passed will not change by asking again
 * (the site's 30 s re-check interval, `LESSON_START_CHECK_INTERVAL_MS`).
 */
const EDGE_RETRY_GUARD_MS = 30_000;

/**
 * Re-reads the lesson when its next schedule edge passes on the SERVER clock: the start of the upcoming
 * lesson (waiting → live) or the scheduled end of the active one (live → waiting), each with the site's
 * 1 s grace (03 §5.3). The timer is re-armed when the screen becomes live again, which covers a sleeping
 * device; one response triggers at most one re-read, so a wrong device clock cannot loop.
 */
function useLessonEdgeRefresh(options: {
  moment: string | null;
  serverOffsetMs: number;
  live: boolean;
  dataUpdatedAt: number;
  refetch: () => void;
}): void {
  const { moment, serverOffsetMs, live, dataUpdatedAt, refetch } = options;
  const refetchRef = useRef(refetch);
  useEffect(() => {
    refetchRef.current = refetch;
  });
  useEffect(() => {
    if (!live || !moment) return;
    const delay = delayUntilLessonEdge(moment, Date.now() + serverOffsetMs);
    if (delay === null) return;
    if (delay === 0 && Date.now() - dataUpdatedAt < EDGE_RETRY_GUARD_MS) return;
    const timer = setTimeout(() => refetchRef.current(), delay);
    return () => clearTimeout(timer);
  }, [dataUpdatedAt, live, moment, serverOffsetMs]);
}

/**
 * `student.lesson` (docs/spec/03-student-homework-lesson.md §1 L1 / L2): one tab, two states. While no
 * lesson is in progress it waits (and says when the next one is); during a lesson it is the classwork.
 * The lesson is derived from the schedule, so the tab switches by local timers on the server clock —
 * realtime `lesson-activity` and the `/state` poll only accelerate it.
 */
export function StudentLessonScreen() {
  const api = useApi();
  const queryClient = useQueryClient();
  const { m } = useI18n();
  const live = useScreenLive();

  const lesson = useQuery({
    queryKey: qk('studentWork', 'getLiveLesson'),
    queryFn: ({ signal }) => api.studentWork.getLiveLesson({ signal }),
    // The lesson is derived from the clock and carries runtime switches: a cached answer, however
    // young, is only a placeholder while the tab asks again.
    refetchOnMount: 'always',
    // The submit buttons are off while the lesson check is reported as switched off: keep asking.
    refetchInterval: (query) =>
      live && query.state.data?.active && !query.state.data.lessonCheckAvailable ? UNAVAILABLE_RECHECK_MS : false,
  });
  const data = lesson.data;

  // Back on the tab or back in the foreground: timers do not run reliably while hidden, and a lesson may
  // have started, ended or been rescheduled meanwhile. Server-side changes: a read already on its way is
  // kept (`refreshQueries`), not cancelled.
  useOnReturn(live, () => void refreshQueries(queryClient, { queryKey: qk('studentWork', 'getLiveLesson'), exact: true }));

  const serverOffsetMs = data ? serverClockOffset(data.serverNow, lesson.dataUpdatedAt) : 0;
  const nowMs = useServerNow(serverOffsetMs, 15_000);
  // A cached "active" lesson whose scheduled end has passed is not shown as live (offline, a cold start
  // from the persisted cache): the tab waits while the re-read is on its way.
  const active = data?.active && secondsUntil(data.active.endsAt, nowMs) > 0 ? data.active : null;

  // During the classwork the phone lies next to the notebook, untouched for minutes: the screen stays on
  // (03 §6 "keep the screen awake", optional). Only while this tab is in front and the app is open.
  useKeepScreenAwake(live && active !== null);

  // The server computes `upcoming` even while a lesson is active (90-addendum-5 A.5.7), so the waiting
  // state of an expired cached lesson still knows what comes next — unless that has started as well.
  const upcoming =
    data?.upcoming && (!data.active || secondsUntil(data.upcoming.startsAt, nowMs) > 0) ? data.upcoming : null;

  useLessonEdgeRefresh({
    moment: active ? active.endsAt : (upcoming?.startsAt ?? null),
    serverOffsetMs,
    live,
    dataUpdatedAt: lesson.dataUpdatedAt,
    // A schedule edge is a server-side change: a read already on its way (a realtime re-read, the return
    // to the tab) is kept and followed by one more instead of being cancelled.
    refetch: () => void refreshQueries(queryClient, { queryKey: qk('studentWork', 'getLiveLesson'), exact: true }),
  });

  const { refreshing, refresh } = usePullRefresh([lesson]);
  const refreshError = lesson.isError && data ? errorText(lesson.error, m.studentWork.lesson.refreshFailed) : null;
  const header = <ShellAppBar title={screenTitle('student.lesson', m.shell.tabs)} />;

  if (data && active) {
    return (
      <Screen testID="student-lesson-screen" header={header} bottomInset={false} scroll={false} padded={false}>
        <LessonLive
          // Upload state, errors and the "joined" mark belong to one lesson.
          key={active.lessonId}
          data={data}
          lesson={active}
          serverOffsetMs={serverOffsetMs}
          live={live}
          refreshing={refreshing}
          onRefresh={refresh}
          refreshError={refreshError}
        />
      </Screen>
    );
  }

  return (
    <Screen testID="student-lesson-screen" header={header} bottomInset={false} onRefresh={refresh} refreshing={refreshing}>
      {data ? (
        <>
          {refreshError ? <Notice tone="error" text={refreshError} testID="lesson-refresh-error" /> : null}
          <LessonWaiting upcoming={upcoming} serverOffsetMs={serverOffsetMs} />
        </>
      ) : isLoadFailed(lesson) ? (
        <LoadFailure query={lesson} testID="lesson-error" />
      ) : (
        <LoadingState variant="cards" count={2} accessibilityLabel={m.common.a11y.loading} testID="lesson-loading" />
      )}
    </Screen>
  );
}
