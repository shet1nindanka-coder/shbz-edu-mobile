import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { errorText, qk, useApi } from '@/api';
import type { HomeworkSummaryDto } from '@/api/types';
import { LoadFailure, isLoadFailed } from '@/components/load-failure';
import { serverClockOffset } from '@/domain/server-clock';
import { useI18n } from '@/i18n';
import { useAppNavigation } from '@/navigation';
import { ShellAppBar, screenTitle } from '@/screens/shell';
import { useServerNow } from '@/services/clock';
import { refreshQueries, usePullRefresh } from '@/services/query';
import { EmptyState, ListCard, LoadingState, Notice, Screen, Segmented } from '@/ui';

import { HomeworkCard } from './work/homework-card';
import { splitHomeworks } from './work/logic';
import { useOnReturn, useScreenLive } from './work/use-screen-live';

type Segment = 'active' | 'done';

/**
 * `student.homeworks` (docs/spec/03-student-homework-lesson.md §1 H1; layout: docs/design/
 * glass-over-paper.md §8): every homework issued to the student as rows of one card — a title, the
 * deadline and «37 из 50» — in the server's "needs attention" order. «Активные» is what is still to do,
 * «Выполненные» what is closed. Number search lives in the header (shell action).
 */
export function StudentHomeworksScreen() {
  const api = useApi();
  const queryClient = useQueryClient();
  const { dict, m } = useI18n();
  const t = dict.student.homeworks;
  const navigation = useAppNavigation();
  const live = useScreenLive();

  const [segment, setSegment] = useState<Segment>('active');

  const homeworks = useQuery({
    queryKey: qk('studentWork', 'listHomeworks'),
    queryFn: ({ signal }) => api.studentWork.listHomeworks({ signal }),
  });
  const data = homeworks.data;
  const { isStale } = homeworks;

  // Statuses change outside this screen (a check on the detail screen, a lesson, the teacher): the list
  // is re-read when the student comes back to it (00 §2.3 "refetch on focus").
  // A server-side change: a read already on its way (a realtime re-read) is kept, not cancelled.
  useOnReturn(live, () => {
    if (isStale) void refreshQueries(queryClient, { queryKey: qk('studentWork', 'listHomeworks'), exact: true });
  });

  const nowMs = useServerNow(data ? serverClockOffset(data.serverNow, homeworks.dataUpdatedAt) : 0);
  const { refreshing, refresh } = usePullRefresh([homeworks]);
  const open = (homework: HomeworkSummaryDto) => navigation.push({ screen: 'student.homework', assignmentId: homework.id });

  const hasHomeworks = Boolean(data && data.available && data.assignments.length > 0);
  const { active, archived } = splitHomeworks(data?.assignments ?? []);
  const shown = segment === 'active' ? active : archived;

  return (
    <Screen
      testID="student-homeworks-screen"
      header={
        <ShellAppBar
          title={screenTitle('student.homeworks', m.shell.tabs)}
          aside={
            hasHomeworks ? (
              <Segmented<Segment>
                options={[
                  { value: 'active', label: m.studentWork.list.active },
                  { value: 'done', label: m.studentWork.list.done },
                ]}
                value={segment}
                onChange={setSegment}
                accessibilityLabel={m.studentWork.list.segmentsA11y}
                fill
                testID="homeworks-segments"
              />
            ) : undefined
          }
        />
      }
      onRefresh={refresh}
      refreshing={refreshing}
    >
      {/* Cached homework stays on screen when a refresh fails (offline): say so instead of replacing it. */}
      {homeworks.isError && data ? (
        <Notice tone="error" text={errorText(homeworks.error, m.studentWork.list.refreshFailed)} testID="homeworks-refresh-error" />
      ) : null}

      {data ? (
        !data.available ? (
          // The homework tables are missing on the server: the section is unavailable, not broken.
          <Notice tone="warning" text={t.migrationNotice} testID="homeworks-unavailable" />
        ) : data.assignments.length === 0 ? (
          <EmptyState title={t.emptyTitle} hint={t.emptyHint} testID="homeworks-empty" />
        ) : shown.length === 0 ? (
          segment === 'active' ? (
            <Notice tone="success" text={dict.student.submissions.allDone} testID="homeworks-all-done" />
          ) : (
            <EmptyState variant="plain" title={m.studentWork.list.doneEmpty} testID="homeworks-done-empty" />
          )
        ) : (
          <ListCard testID="homeworks-list">
            {shown.map((homework, index) => (
              <HomeworkCard key={homework.id} homework={homework} nowMs={nowMs} onOpen={open} divider={index < shown.length - 1} />
            ))}
          </ListCard>
        )
      ) : isLoadFailed(homeworks) ? (
        <LoadFailure query={homeworks} testID="homeworks-error" />
      ) : (
        <LoadingState variant="list" accessibilityLabel={m.common.a11y.loading} testID="homeworks-loading" />
      )}
    </Screen>
  );
}
