import { FlashList } from '@shopify/flash-list';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { RefreshControl, View } from 'react-native';

import { errorText, qk, useApi } from '@/api';
import type { LessonListItem } from '@/api/types';
import { ActionSheet, type SheetAction } from '@/components/action-sheet';
import { HandoutNotice, useHandout } from '@/components/lessons';
import { LoadFailure, isWaitingForNetwork } from '@/components/load-failure';
import { RetryWaitLine, useRetryWait } from '@/components/retry-wait';
import { serverClockOffset } from '@/domain/server-clock';
import { useI18n } from '@/i18n';
import { useAppNavigation, useRefetchOnFocus } from '@/navigation';
import { Hint } from '@/providers';
import { PlannerSegments, ShellAppBar, screenTitle } from '@/screens/shell';
import { useLatched } from '@/screens/teacher/students';
import { makeStyles, useTheme } from '@/theme';
import { Dialog, LoadingState, Notice, Screen, Text } from '@/ui';

import { ComposeCard } from './lessons/compose-card';
import { LessonCard } from './lessons/lesson-card';
import { buildLessonRows, groupLessons, hasScheduleAdvanced, type LessonListRow } from './lessons/lessons-list-logic';
import { invalidateAroundLesson } from './shared/invalidate';
import { useNowTick } from '@/services/clock';
import { usePullRefresh } from '@/services/query';

/**
 * `planner.lessons` (docs/spec/05-teacher-lessons-plans.md §1.1): root of the teacher's «занятия» tab —
 * the "compose a lesson" card and the lesson plans grouped into Today / Upcoming / Past.
 */
export function PlannerLessonsScreen() {
  const styles = useStyles();
  const theme = useTheme();
  const api = useApi();
  const queryClient = useQueryClient();
  const navigation = useAppNavigation();
  const { dict, m } = useI18n();
  const t = dict.planner.lessonsList;
  const del = dict.planner.lessonDelete;

  const [menuFor, setMenuFor] = useState<LessonListItem | null>(null);
  const [deleting, setDeleting] = useState<LessonListItem | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const handout = useHandout();
  const deleteWait = useRetryWait();

  // Opening the list runs the lazy finalisation of finished lessons on the server, so it is always re-read.
  const lessons = useQuery({ queryKey: qk('planner', 'listLessons'), queryFn: () => api.planner.listLessons(), refetchOnMount: 'always' });
  // A tab root stays mounted: `refetchOnMount` covers the first visit only, so a list that went stale
  // while another tab or a board was open is re-read on the way back (00 §2.3 "refetch on focus").
  useRefetchOnFocus([lessons]);
  const data = lessons.data;

  // "Today" follows the server clock: a wrong device clock must not move lessons between sections.
  const deviceNow = useNowTick(60_000);
  const now = deviceNow + serverClockOffset(data?.serverNow, lessons.dataUpdatedAt);

  const rows = useMemo(() => (data ? buildLessonRows(groupLessons(data.lessons, now)) : []), [data, now]);
  const stickyIndices = useMemo(() => rows.flatMap((row, index) => (row.type === 'section' ? [index] : [])), [rows]);

  // A lesson that has started or ended by the clock since the list was read: read it again (the
  // statuses on the wire are computed by the server at response time).
  const refetchLessons = lessons.refetch;
  const lessonsFetching = lessons.isFetching;
  useEffect(() => {
    if (data && !lessonsFetching && hasScheduleAdvanced(data.lessons, now)) void refetchLessons();
    // Only the minute tick drives this check.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceNow]);

  const { refreshing, refresh } = usePullRefresh([lessons]);

  const remove = useMutation({
    mutationFn: (lesson: LessonListItem) => api.planner.deleteLesson(lesson.id),
    onSuccess: (_result, lesson) => {
      setDeleting(null);
      queryClient.removeQueries({ queryKey: qk('planner', 'getLessonBoard', lesson.id) });
      // The lesson also disappears from the student card, the group's lessons block and its attendance
      // table and statistics — the same set the board's own delete refreshes.
      invalidateAroundLesson(queryClient);
    },
    onError: (error) => {
      setDeleting(null);
      deleteWait.note(error);
      setDeleteError(errorText(error, del.failed));
      // `404 lessonNotFound`: somebody already removed it — show the list as it is now.
      void lessons.refetch();
    },
  });

  const open = (lesson: LessonListItem) => navigation.open({ screen: 'planner.lessonBoard', lessonId: lesson.id });
  const compose = () => navigation.open({ screen: 'planner.lessonNew' });

  // The menu keeps its lesson while it slides away: its rows must not collapse mid-animation, and the
  // chosen action runs only after the sheet has left (see `ActionSheet`).
  const menuLesson = useLatched(menuFor);
  const menuActions: SheetAction[] = menuLesson
    ? [
        { key: 'open', label: dict.planner.common.open, icon: 'forward', onPress: () => open(menuLesson) },
        {
          key: 'pdf',
          label: m.planner.lessonBoard.handout,
          icon: 'file',
          disabled: handout.wait.waiting,
          onPress: () => handout.open({ lessonId: menuLesson.id, createdAt: menuLesson.createdAt }),
        },
        {
          key: 'delete',
          label: del.label,
          icon: 'trash',
          tone: 'danger',
          disabled: deleteWait.waiting,
          onPress: () => {
            setDeleteError(null);
            setDeleting(menuLesson);
          },
        },
      ]
    : [];

  const sectionTitle: Record<'today' | 'upcoming' | 'past', string> = { today: t.today, upcoming: t.upcoming, past: t.past };
  const isEmpty = data !== undefined && data.lessons.length === 0;

  const header = (
    <View style={styles.header}>
      <PlannerSegments active="lessons" />
      {/* Cached lessons stay on screen when a refresh fails (offline): say so instead of replacing them. */}
      {lessons.isError && data ? <Notice tone="error" text={errorText(lessons.error, m.common.errors.generic)} testID="lessons-refresh-error" /> : null}
      {deleteError ? (
        <Notice tone="error" text={deleteError} onDismiss={() => setDeleteError(null)} dismissLabel={m.common.actions.close} testID="lessons-delete-error" />
      ) : null}
      {/* «Delete» in every lesson menu stays locked after a dismissed notice: the reason stays with it. */}
      <RetryWaitLine seconds={deleteWait.seconds} testID="lessons-delete-wait" />
      <HandoutNotice handout={handout} testID="lessons-handout-error" />
      <View style={styles.compose}>
        <Text variant="sectionTitle" accessibilityRole="header">
          {t.composeTitle}
        </Text>
        {isEmpty ? (
          // The empty state of the list: the invitation card with its own text.
          <ComposeCard hint={t.hintEmpty} onPress={compose} testID="lessons-compose" />
        ) : (
          <>
            <ComposeCard onPress={compose} testID="lessons-compose" />
            <Hint>
              <Text variant="caption" color="textMuted">
                {t.hint}
              </Text>
            </Hint>
          </>
        )}
      </View>
    </View>
  );

  const renderRow = ({ item }: { item: LessonListRow }) =>
    item.type === 'section' ? (
      <View style={styles.sectionHeader}>
        <Text variant="kicker" accessibilityRole="header" tabular>
          {`${sectionTitle[item.key]} · ${item.count}`}
        </Text>
      </View>
    ) : (
      <View style={styles.item}>
        <LessonCard lesson={item.lesson} onOpen={open} onMore={setMenuFor} />
      </View>
    );

  return (
    <Screen
      testID="planner-lessons-screen"
      header={<ShellAppBar title={screenTitle('planner.lessons', m.shell.tabs)} />}
      bottomInset={false}
      scroll={!data}
      padded={!data}
      onRefresh={data ? undefined : refresh}
      refreshing={refreshing}
    >
      {data ? (
        <FlashList
          data={rows}
          keyExtractor={(row) => (row.type === 'section' ? `section-${row.key}` : row.key)}
          getItemType={(row) => row.type}
          renderItem={renderRow}
          stickyHeaderIndices={stickyIndices}
          ListHeaderComponent={header}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refresh}
              tintColor={theme.colors.accentSolid}
              colors={[theme.colors.accentSolid]}
              progressBackgroundColor={theme.colors.cardBg}
            />
          }
          testID="lessons-list"
        />
      ) : lessons.isError || isWaitingForNetwork(lessons) ? (
        <View style={styles.state}>
          <PlannerSegments active="lessons" />
          <LoadFailure query={lessons} testID="lessons-error" />
        </View>
      ) : (
        <View style={styles.state}>
          <PlannerSegments active="lessons" />
          <LoadingState variant="cards" count={4} cardHeight={112} accessibilityLabel={m.common.a11y.loading} testID="lessons-loading" />
        </View>
      )}

      <ActionSheet visible={menuFor !== null} title={menuLesson?.title ?? ''} actions={menuActions} onClose={() => setMenuFor(null)} testID="lesson-menu" />

      <Dialog
        visible={deleting !== null}
        kicker={dict.topics.widgets.confirm.kicker}
        title={del.title}
        description={del.description}
        confirmLabel={dict.topics.widgets.confirm.confirm}
        pendingLabel={dict.topics.widgets.confirm.pending}
        cancelLabel={dict.topics.widgets.confirm.cancel}
        pending={remove.isPending}
        onConfirm={() => {
          if (deleting) remove.mutate(deleting);
        }}
        onCancel={() => setDeleting(null)}
        testID="lesson-delete-dialog"
      >
        {deleting ? (
          <Text variant="smallStrong" numberOfLines={2}>
            {deleting.title}
          </Text>
        ) : null}
      </Dialog>
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  // The gutters live in the rows, not in the list: a section heading that sticks is laid out by the
  // list itself and would lose a padding of the content container.
  listContent: { paddingTop: t.space.lg, paddingBottom: t.space.pageBottom },
  header: { gap: t.space.lg, paddingBottom: t.space.md, paddingHorizontal: t.space.gutter },
  compose: { gap: t.space.md },
  sectionHeader: { paddingTop: t.space.lg, paddingBottom: t.space.sm, paddingHorizontal: t.space.gutter, backgroundColor: t.colors.pageBg },
  item: { paddingBottom: t.space.md, paddingHorizontal: t.space.gutter },
  state: { gap: t.space.lg },
}));
