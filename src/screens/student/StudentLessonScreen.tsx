import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import { qk, useApi } from '@/api';
import { useI18n } from '@/i18n';
import { ShellAppBar, screenTitle } from '@/screens/shell';
import { ErrorState, LoadingState, Notice, Screen } from '@/ui';

import { errorText } from './work/error-text';
import { LessonLive } from './work/lesson-live';
import { LessonWaiting } from './work/lesson-waiting';
import { delayUntilLessonEdge, secondsUntil, serverClockOffset } from './work/logic';
import { useOnReturn, useScreenLive } from './work/use-screen-live';
import { useServerNow } from './work/use-server-now';

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
  const { dict, m } = useI18n();
  const live = useScreenLive();
  const [refreshing, setRefreshing] = useState(false);

  const lesson = useQuery({
    queryKey: qk('studentWork', 'getLiveLesson'),
    queryFn: ({ signal }) => api.studentWork.getLiveLesson({ signal }),
    // The lesson is derived from the clock and carries runtime switches: a cached answer, however
    // young, is only a placeholder while the tab asks again.
    refetchOnMount: 'always',
  });
  const data = lesson.data;
  const { refetch } = lesson;

  // Back on the tab or back in the foreground: timers do not run reliably while hidden, and a lesson may
  // have started, ended or been rescheduled meanwhile.
  useOnReturn(live, () => void refetch());

  const serverOffsetMs = data ? serverClockOffset(data.serverNow, lesson.dataUpdatedAt) : 0;
  const nowMs = useServerNow(serverOffsetMs, 15_000);
  // A cached "active" lesson whose scheduled end has passed is not shown as live (offline, a cold start
  // from the persisted cache): the tab waits while the re-read is on its way.
  const active = data?.active && secondsUntil(data.active.endsAt, nowMs) > 0 ? data.active : null;

  useLessonEdgeRefresh({
    moment: data ? (data.active ? data.active.endsAt : (data.upcoming?.startsAt ?? null)) : null,
    serverOffsetMs,
    live,
    dataUpdatedAt: lesson.dataUpdatedAt,
    refetch: () => void refetch(),
  });

  const refresh = () => {
    setRefreshing(true);
    void refetch().finally(() => setRefreshing(false));
  };
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
          <LessonWaiting upcoming={data.active ? null : data.upcoming} serverOffsetMs={serverOffsetMs} />
        </>
      ) : lesson.isError ? (
        <ErrorState
          title={dict.shells.errorTitle}
          description={errorText(lesson.error, m.common.errors.generic)}
          retryLabel={dict.common.retry}
          onRetry={() => void refetch()}
          retrying={lesson.isFetching}
          testID="lesson-error"
        />
      ) : (
        <LoadingState variant="cards" count={2} accessibilityLabel={m.common.a11y.loading} testID="lesson-loading" />
      )}
    </Screen>
  );
}
