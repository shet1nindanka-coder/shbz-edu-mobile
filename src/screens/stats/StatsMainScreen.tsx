import { FlashList } from '@shopify/flash-list';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { RefreshControl, View, useWindowDimensions } from 'react-native';

import { errorText, qk, useApi } from '@/api';
import type { TeacherStatsEntry } from '@/api/types';
import { LoadFailure, isLoadFailed } from '@/components/load-failure';
import { useI18n } from '@/i18n';
import { useRefetchOnFocus, type ScreenParams } from '@/navigation';
import { ShellAppBar, screenTitle } from '@/screens/shell';
import { usePullRefresh } from '@/services/query';
import { makeStyles, useTheme } from '@/theme';
import { LoadingState, Notice, Screen, Segmented } from '@/ui';

import { STATS_VIEWS, initialStatsState, type StatsView } from './logic';
import { TeacherCard } from './parts/teacher-card';
import { PlatformView } from './views/platform-view';
import { ProgressView } from './views/progress-view';
import { TeachersView } from './views/teachers-view';

/** From this window width the three view names fit the header row at full size. */
const ROOMY_HEADER_FROM = 1024;

/** A row of the screen's list: one teacher card, or the whole body of a view that is not a list. */
type StatsRow = { kind: 'teacher'; entry: TeacherStatsEntry } | { kind: 'body' };
const BODY_ROWS: readonly StatsRow[] = [{ kind: 'body' }];

/** Route params of `stats.main`: the site's `?view=` and `?studentId=` (06 §1.6). */
export type StatsMainScreenProps = ScreenParams['stats.main'];

/**
 * `stats.main` (docs/spec/06-teacher-groups-calls-stats.md §1.6; layout: docs/design/glass-over-paper.md
 * §7, mockup D-stats): the developer's statistics tab. Three views behind the segmented control of the
 * header — «Прогресс учеников», «По учителям», «Метрики платформы» — each a scroll of cards: plain summary
 * figures first, then charts and rankings; a tablet puts the cards side by side. A view's data is
 * requested when the view is first opened and then kept, so switching back is instant. The screen is one
 * list: the cards of «По учителям» (one per teacher, no upper bound) are its rows — two columns of them on
 * a tablet — the other two views are a single row, and the head of the list stays mounted.
 *
 * Only a DEVELOPER has this screen (the registry and the server agree: `403 developerRightsRequired`
 * for anyone else). Statistics has no realtime event of its own: it refreshes on focus, on
 * pull-to-refresh and with the staff-wide invalidation of the `groups` member.
 */
export function StatsMainScreen({ view: routeView, studentId: routeStudentId }: StatsMainScreenProps = {}) {
  const styles = useStyles();
  const theme = useTheme();
  const window = useWindowDimensions();
  const api = useApi();
  const queryClient = useQueryClient();
  const { locale, dict, m } = useI18n();
  const t = dict.planner.statistics;
  // A deep link (`/developer/statistics?view=teachers`, `?studentId=…`) chooses the initial view and
  // timeline student, like the site page; a later link with other params applies them again.
  const initial = initialStatsState(routeView, routeStudentId);
  const routeKey = `${initial.view}|${initial.timelineStudentId ?? ''}`;
  const [seenRouteKey, setSeenRouteKey] = useState(routeKey);
  const [view, setView] = useState<StatsView>(initial.view);
  const [visited, setVisited] = useState<ReadonlySet<StatsView>>(() => new Set<StatsView>([initial.view]));
  // The student the progress timeline is filtered by; undefined = every student. An unknown id falls
  // back to "all students" on the server (`timelineStudentId: null`), as on the site.
  const [timelineStudentId, setTimelineStudentId] = useState<string | undefined>(initial.timelineStudentId);
  // Why the latest change of that filter did not load (see `loadedFilter` below).
  const [filterError, setFilterError] = useState<string | null>(null);
  if (seenRouteKey !== routeKey) {
    setFilterError(null);
    setSeenRouteKey(routeKey);
    setView(initial.view);
    setVisited((seen) => (seen.has(initial.view) ? seen : new Set(seen).add(initial.view)));
    setTimelineStudentId(initial.timelineStudentId);
  }

  const progress = useQuery({
    queryKey: qk('groups', 'getStatisticsProgress', timelineStudentId),
    queryFn: () => api.groups.getStatisticsProgress(timelineStudentId),
    enabled: visited.has('teacher'),
    // Changing the timeline filter keeps the page on screen while the new timeline loads.
    placeholderData: keepPreviousData,
  });
  // The filter of the last timeline that loaded, and why the latest change of it did not. In TanStack
  // Query v5 the previous page is a placeholder only while the new filter is pending: once its read fails,
  // `progress.data` is gone with the picker that caused it. So a failed change goes back to the filter
  // that loaded — its numbers and the picker stay — and says why (90-addendum-1 A.3).
  const [loadedFilter, setLoadedFilter] = useState<{ id: string | undefined } | null>(null);
  if (progress.isSuccess && !progress.isPlaceholderData && (loadedFilter === null || loadedFilter.id !== timelineStudentId)) {
    setLoadedFilter({ id: timelineStudentId });
  }
  if (progress.isError && progress.data === undefined && loadedFilter !== null && loadedFilter.id !== timelineStudentId) {
    setFilterError(errorText(progress.error, m.common.errors.generic));
    setTimelineStudentId(loadedFilter.id);
  }
  const changeTimelineStudent = (studentId: string | undefined) => {
    setFilterError(null);
    setTimelineStudentId(studentId);
  };

  const teachers = useQuery({
    queryKey: qk('groups', 'getStatisticsTeachers'),
    queryFn: () => api.groups.getStatisticsTeachers(),
    enabled: visited.has('teachers'),
  });
  const platform = useQuery({
    queryKey: qk('groups', 'getStatisticsPlatform'),
    queryFn: () => api.groups.getStatisticsPlatform(),
    enabled: visited.has('developer'),
  });
  const current = view === 'teacher' ? progress : view === 'teachers' ? teachers : platform;
  useRefetchOnFocus([current]);

  const selectView = (next: StatsView) => {
    // A view visited before keeps its query mounted, so neither mounting nor focus asks for it again. On
    // the site every view is its own server render (`?view=`), fresh on each switch, and most of what these
    // numbers count (parent calls, lessons, groups, plans) publishes no realtime event: the view is re-read
    // whenever it is opened again; its cached numbers stay on screen meanwhile.
    const target = next === 'teacher' ? progress : next === 'teachers' ? teachers : platform;
    if (next !== view && visited.has(next)) void target.refetch();
    setView(next);
    setVisited((seen) => (seen.has(next) ? seen : new Set(seen).add(next)));
  };

  const pull = usePullRefresh([current]);
  const refreshing = pull.refreshing;
  const refresh = () => {
    // The slice of the drilldown is part of the progress view: it reloads with it.
    if (view === 'teacher') void queryClient.invalidateQueries({ queryKey: qk('groups', 'getStatisticsDrilldown') });
    pull.refresh();
  };

  const body = () => {
    if (view === 'teacher' && progress.data) {
      return (
        <ProgressView
          data={progress.data}
          filterPending={progress.isPlaceholderData && progress.fetchStatus === 'fetching'}
          onTimelineStudentChange={changeTimelineStudent}
        />
      );
    }
    // With teachers the cards are rows of the list; this is the empty state.
    if (view === 'teachers' && teachers.data) return <TeachersView data={teachers.data} />;
    if (view === 'developer' && platform.data) return <PlatformView data={platform.data} />;
    return isLoadFailed(current) ? (
      <LoadFailure query={current} testID="stats-error" />
    ) : (
      <LoadingState variant="cards" count={4} cardHeight={120} accessibilityLabel={m.common.a11y.loading} testID="stats-loading" />
    );
  };

  const teacherCards = view === 'teachers' && teachers.data && teachers.data.teachers.length > 0 ? teachers.data : null;
  const rows = useMemo<readonly StatsRow[]>(
    () => (teacherCards ? teacherCards.teachers.map((entry) => ({ kind: 'teacher', entry })) : BODY_ROWS),
    [teacherCards],
  );

  const failures = (
    <>
      {/* Cached numbers stay on screen when a refresh fails (offline): say so instead of replacing them. */}
      {current.isError && current.data ? (
        <Notice tone="error" text={errorText(current.error, m.common.errors.generic)} testID="stats-refresh-error" />
      ) : null}
      {view === 'teacher' && filterError ? (
        <Notice
          tone="error"
          text={filterError}
          onDismiss={() => setFilterError(null)}
          dismissLabel={m.common.actions.close}
          testID="stats-filter-error"
        />
      ) : null}
      {/* Offline, a new timeline filter waits for the connection while the previous numbers stay. */}
      {current.isPlaceholderData && current.fetchStatus === 'paused' ? (
        <Notice tone="error" text={m.common.errors.network} testID="stats-filter-offline" />
      ) : null}
    </>
  );
  const hasFailure =
    (current.isError && current.data !== undefined) ||
    (view === 'teacher' && filterError !== null) ||
    (current.isPlaceholderData && current.fetchStatus === 'paused');

  // A tablet lays the teacher cards out in two columns; a view that is one row keeps the whole width.
  const columns = theme.tablet && teacherCards ? 2 : 1;

  return (
    <Screen
      testID="stats-main-screen"
      header={
        <ShellAppBar
          title={screenTitle('stats.main', m.shell.tabs)}
          aside={
            <Segmented
              options={STATS_VIEWS.map((value) => ({ value, label: t.views[value] }))}
              value={view}
              onChange={selectView}
              accessibilityLabel={t.viewsAria}
              // No label is cut: where the row is too narrow the bar scrolls, the selected view kept in sight.
              scrollable={window.width < ROOMY_HEADER_FROM}
              role="tab"
              testID="stats-views"
            />
          }
        />
      }
      bottomInset={false}
      scroll={false}
      padded={false}
      maxWidth="full"
    >
      <FlashList
        // The number of columns cannot change on a mounted list.
        key={columns}
        numColumns={columns}
        data={rows}
        keyExtractor={(row) => (row.kind === 'teacher' ? row.entry.teacherId : 'body')}
        getItemType={(row) => row.kind}
        renderItem={({ item, index }) =>
          item.kind === 'teacher' && teacherCards ? (
            <View style={[styles.item, columns > 1 ? (index % columns === 0 ? styles.itemLeft : styles.itemRight) : null]}>
              <TeacherCard entry={item.entry} weekStarts={teacherCards.weekStarts} />
            </View>
          ) : (
            body()
          )
        }
        // The single "body" row shows whatever the current view and its query hold.
        extraData={[view, current.data, current.status, current.fetchStatus, current.isPlaceholderData, locale]}
        ListHeaderComponent={hasFailure ? <View style={styles.header}>{failures}</View> : null}
        ListFooterComponent={teacherCards ? <TeachersView data={teacherCards} /> : null}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
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
        testID="stats-list"
      />
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  listContent: { paddingHorizontal: t.space.gutter, paddingBottom: t.space.pageBottom },
  header: { gap: t.space.block, paddingBottom: t.space.block },
  // The gap between cards lives inside the cells: FlashList measures each one.
  item: { flex: 1, paddingBottom: t.space.block },
  // Two columns: each cell gives half of the gap between them.
  itemLeft: { paddingRight: t.space.block / 2 },
  itemRight: { paddingLeft: t.space.block / 2 },
}));
