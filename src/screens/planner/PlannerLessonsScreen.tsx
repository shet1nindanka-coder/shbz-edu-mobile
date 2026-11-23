import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import { errorText, qk, useApi } from '@/api';
import type { LessonListItem } from '@/api/types';
import { HandoutNotice, useHandout } from '@/components/lessons';
import { LoadFailure, isWaitingForNetwork } from '@/components/load-failure';
import { RetryWaitLine, useRetryWait } from '@/components/retry-wait';
import { serverClockOffset } from '@/domain/server-clock';
import { useI18n } from '@/i18n';
import { useAppNavigation, useRefetchOnFocus } from '@/navigation';
import { PlannerSegments, ShellAppBar, screenTitle } from '@/screens/shell';
import { useNowTick } from '@/services/clock';
import { usePullRefresh } from '@/services/query';
import { makeStyles, useTheme } from '@/theme';
import { Button, Card, Dialog, ListCard, LoadingState, Notice, Panel, Panels, Screen, SectionCaption, Text, TextButton } from '@/ui';

import { LessonDetail } from './lessons/lesson-detail';
import { LessonRow } from './lessons/lesson-row';
import { groupLessons, hasScheduleAdvanced, type LessonSectionKey } from './lessons/lessons-list-logic';
import { invalidateAroundLesson } from './shared/invalidate';

/** How many past lessons are shown at first, and how many «Показать ещё» adds: a year of lessons is long. */
const PAST_PAGE = 20;

/**
 * `planner.lessons` (docs/spec/05-teacher-lessons-plans.md §1.1; layout: mockup `T-lessons`): root of the
 * teacher's «занятия» section — the lesson plans as rows grouped into Today / Upcoming / Past. «Составить
 * занятие» is the button of the header. A phone opens the board on a tap; a tablet shows the tapped lesson
 * in the panel next to the list, with its actions (board, handout, delete).
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

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pastShown, setPastShown] = useState(PAST_PAGE);
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

  const sections = useMemo(() => (data ? groupLessons(data.lessons, now) : []), [data, now]);

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

  // The tablet panel shows the tapped lesson, or the first of the list (today's first when there is one).
  const ordered = sections.flatMap((section) => section.lessons);
  const selected = theme.tablet ? (ordered.find((lesson) => lesson.id === selectedId) ?? ordered[0] ?? null) : null;
  const pressRow = theme.tablet ? (lesson: LessonListItem) => setSelectedId(lesson.id) : open;

  const sectionTitle: Record<LessonSectionKey, string> = { today: t.today, upcoming: t.upcoming, past: t.past };
  const isEmpty = data !== undefined && data.lessons.length === 0;

  const header = (
    <ShellAppBar
      title={screenTitle('planner.lessons', m.shell.tabs)}
      aside={
        <View style={styles.aside}>
          <PlannerSegments active="lessons" />
          <Button label={dict.planner.lessonComposeCard.title} leftIcon="plus" onPress={compose} testID="lessons-compose" />
        </View>
      }
    />
  );

  const notices = (
    <>
      {/* Cached lessons stay on screen when a refresh fails (offline): say so instead of replacing them. */}
      {lessons.isError && data ? <Notice tone="error" text={errorText(lessons.error, m.common.errors.generic)} testID="lessons-refresh-error" /> : null}
      {deleteError ? (
        <Notice tone="error" text={deleteError} onDismiss={() => setDeleteError(null)} dismissLabel={m.common.actions.close} testID="lessons-delete-error" />
      ) : null}
      {/* «Delete» stays locked after a dismissed notice: the reason stays with it. */}
      <RetryWaitLine seconds={deleteWait.seconds} testID="lessons-delete-wait" />
      <HandoutNotice handout={handout} testID="lessons-handout-error" />
    </>
  );

  // The rows of one section; «Прошедшие» grows by pages, so a year of lessons does not open at once.
  const sectionRows = (key: LessonSectionKey, list: readonly LessonListItem[]) => {
    const shown = key === 'past' ? list.slice(0, pastShown) : list;
    const hasMore = shown.length < list.length;
    return (
      <>
        {shown.map((lesson, index) => (
          <LessonRow
            key={lesson.id}
            lesson={lesson}
            today={key === 'today'}
            now={now}
            selected={selected?.id === lesson.id}
            divider={hasMore || index < shown.length - 1}
            onPress={pressRow}
          />
        ))}
        {hasMore ? (
          <View style={styles.more}>
            <TextButton label={m.common.actions.showMore} onPress={() => setPastShown((current) => current + PAST_PAGE)} testID="lessons-past-more" />
          </View>
        ) : null}
      </>
    );
  };

  const emptyCard = (
    // The empty state of the list: an invitation with the site's own text.
    <Card dashed testID="lessons-empty">
      <Text variant="small" color="textMuted">
        {t.hintEmpty}
      </Text>
    </Card>
  );

  const body = !data ? (
    lessons.isError || isWaitingForNetwork(lessons) ? (
      <LoadFailure query={lessons} testID="lessons-error" />
    ) : (
      <LoadingState variant="list" count={5} accessibilityLabel={m.common.a11y.loading} testID="lessons-loading" />
    )
  ) : isEmpty ? (
    emptyCard
  ) : theme.tablet ? (
    <Panels testID="lessons-list">
      <Panel weight={3} padded={false} contentStyle={styles.listPanel}>
        {sections.map((section) => (
          <View key={section.key}>
            <SectionCaption style={styles.panelCaption}>{`${sectionTitle[section.key]} · ${section.lessons.length}`}</SectionCaption>
            {sectionRows(section.key, section.lessons)}
          </View>
        ))}
      </Panel>
      <Panel
        weight={2}
        footer={
          selected ? (
            <View style={styles.actions}>
              <Button label={m.planner.lessonsList.openBoard} rightIcon="forward" fullWidth onPress={() => open(selected)} testID="lesson-detail-open" />
              <Button
                label={m.planner.lessonBoard.handout}
                variant="outline"
                leftIcon="download"
                fullWidth
                disabled={handout.wait.waiting}
                onPress={() => handout.open({ lessonId: selected.id, createdAt: selected.createdAt })}
                testID="lesson-detail-handout"
              />
              <Button
                label={del.label}
                variant="danger"
                fullWidth
                disabled={deleteWait.waiting}
                onPress={() => {
                  setDeleteError(null);
                  setDeleting(selected);
                }}
                testID="lesson-detail-delete"
              />
            </View>
          ) : undefined
        }
      >
        {selected ? <LessonDetail lesson={selected} /> : null}
      </Panel>
    </Panels>
  ) : (
    <View style={styles.sections} testID="lessons-list">
      {sections.map((section) => (
        <View key={section.key} style={styles.section}>
          <SectionCaption>{`${sectionTitle[section.key]} · ${section.lessons.length}`}</SectionCaption>
          <ListCard>{sectionRows(section.key, section.lessons)}</ListCard>
        </View>
      ))}
    </View>
  );

  return (
    <Screen
      testID="planner-lessons-screen"
      header={header}
      bottomInset={false}
      scroll={!theme.tablet}
      maxWidth="full"
      onRefresh={refresh}
      refreshing={refreshing}
    >
      {notices}
      {body}

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
  // Tablet: the switch and the button stand in the header row; phone: one under the other, full width.
  aside: t.tablet ? { flexDirection: 'row', alignItems: 'center', gap: t.space.sm } : { gap: t.space.xs },
  sections: { gap: t.space.block },
  section: { gap: t.space.xs },
  listPanel: { paddingVertical: t.space.sm, gap: t.space.xs },
  panelCaption: { paddingHorizontal: t.space.card, paddingTop: t.space.sm, paddingBottom: t.space.xxs },
  more: { minHeight: t.sizes.control.md, alignItems: 'center', justifyContent: 'center' },
  actions: { gap: t.space.xs },
}));
