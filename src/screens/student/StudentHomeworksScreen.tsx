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
import { makeStyles, useTheme } from '@/theme';
import { EmptyState, ListCard, LoadingState, Notice, Panel, Panels, Screen, SectionCaption, Segmented, Text } from '@/ui';

import { HomeworkCard } from './work/homework-card';
import { HomeworkDetail } from './work/homework-detail';
import { splitHomeworks } from './work/logic';
import { useOnReturn, useScreenLive } from './work/use-screen-live';

type Segment = 'active' | 'done';

/**
 * `student.homeworks` (docs/spec/03-student-homework-lesson.md §1 H1; layout: docs/design/
 * glass-over-paper.md §8): every homework issued to the student as rows of one card — a title, the
 * deadline and «37/50» — in the server's "needs attention" order. «Активные» is what is still to do,
 * «Выполненные» what is closed. Number search lives in the header (shell action).
 *
 * A tablet shows both halves in the left panel and the selected homework in the right one, so a row
 * selects instead of pushing a screen.
 */
export function StudentHomeworksScreen() {
  const styles = useStyles();
  const theme = useTheme();
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

  // Tablet: the homework shown in the right panel — the picked one while it exists, else the first active.
  const [pickedId, setPickedId] = useState<string | null>(null);
  const all = [...active, ...archived];
  const selectedId = (pickedId && all.some((homework) => homework.id === pickedId) ? pickedId : null) ?? all[0]?.id ?? null;

  if (theme.tablet && data && hasHomeworks) {
    const rows = (list: HomeworkSummaryDto[]) =>
      list.map((homework, index) => (
        <HomeworkCard
          key={homework.id}
          homework={homework}
          nowMs={nowMs}
          onOpen={(picked) => setPickedId(picked.id)}
          selected={homework.id === selectedId}
          divider={index < list.length - 1}
        />
      ));
    return (
      <Screen testID="student-homeworks-screen" header={<ShellAppBar title={screenTitle('student.homeworks', m.shell.tabs)} />} scroll={false} maxWidth="full">
        {homeworks.isError ? (
          <Notice tone="error" text={errorText(homeworks.error, m.studentWork.list.refreshFailed)} testID="homeworks-refresh-error" />
        ) : null}
        <Panels>
          <Panel weight={2} padded={false} contentStyle={styles.listPanel} testID="homeworks-list">
            {active.length > 0 ? <SectionCaption style={styles.caption}>{m.studentWork.list.active}</SectionCaption> : null}
            {rows(active)}
            {archived.length > 0 ? <SectionCaption style={styles.caption}>{m.studentWork.list.done}</SectionCaption> : null}
            {rows(archived)}
          </Panel>
          {selectedId ? (
            <HomeworkDetail key={selectedId} assignmentId={selectedId} grid>
              {({ title, subtitle, body }) => (
                <Panel
                  weight={3}
                  header={
                    <>
                      <Text variant="sectionTitle" accessibilityRole="header" numberOfLines={2}>
                        {title}
                      </Text>
                      {subtitle ? (
                        <Text variant="small" color="textMuted">
                          {subtitle}
                        </Text>
                      ) : null}
                    </>
                  }
                  testID="homeworks-detail"
                >
                  {body}
                </Panel>
              )}
            </HomeworkDetail>
          ) : null}
        </Panels>
      </Screen>
    );
  }

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
          <EmptyState title={t.emptyTitle} testID="homeworks-empty" />
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

const useStyles = makeStyles((t) => ({
  listPanel: { gap: 0, paddingVertical: t.space.sm },
  caption: { paddingHorizontal: t.space.card, paddingTop: t.space.md, paddingBottom: t.space.xxs },
}));
