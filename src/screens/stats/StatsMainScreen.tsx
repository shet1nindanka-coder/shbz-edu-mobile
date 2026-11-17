import { FlashList } from '@shopify/flash-list';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { RefreshControl, View } from 'react-native';

import { errorText, qk, useApi } from '@/api';
import type { TeacherStatsEntry } from '@/api/types';
import { LoadFailure, isLoadFailed } from '@/components/load-failure';
import { useI18n } from '@/i18n';
import { useRefetchOnFocus } from '@/navigation';
import { ShellAppBar, screenTitle } from '@/screens/shell';
import { makeStyles, useTheme } from '@/theme';
import { LoadingState, Notice, PageHeader, Screen, Segmented } from '@/ui';

import { STATS_VIEWS, type StatsView } from './logic';
import { TeacherCard } from './parts/teacher-card';
import { PlatformView } from './views/platform-view';
import { ProgressView } from './views/progress-view';
import { TeachersView } from './views/teachers-view';

/**
 * `stats.main` (docs/spec/06-teacher-groups-calls-stats.md §1.6): the developer's statistics tab. Three
 * views behind one segmented control — «Прогресс учеников», «По учителям», «Метрики платформы» — each a
 * vertical scroll of cards. A view's data is requested when the view is first opened and then kept, so
 * switching back is instant. The screen is one list: the cards of «По учителям» (one per teacher, no
 * upper bound) are its rows, the other two views are a single row, and the header stays mounted.
 *
 * Only a DEVELOPER has this screen (the registry and the server agree: `403 developerRightsRequired`
 * for anyone else). Statistics has no realtime event of its own: it refreshes on focus, on
 * pull-to-refresh and with the staff-wide invalidation of the `groups` member.
 */
/** A row of the screen's list: one teacher card, or the whole body of a view that is not a list. */
type StatsRow = { kind: 'teacher'; entry: TeacherStatsEntry } | { kind: 'body' };
const BODY_ROWS: readonly StatsRow[] = [{ kind: 'body' }];

export function StatsMainScreen() {
  const styles = useStyles();
  const theme = useTheme();
  const api = useApi();
  const queryClient = useQueryClient();
  const { locale, dict, m } = useI18n();
  const t = dict.planner.statistics;
  const [view, setView] = useState<StatsView>('teacher');
  const [visited, setVisited] = useState<ReadonlySet<StatsView>>(new Set<StatsView>(['teacher']));
  // The student the progress timeline is filtered by; undefined = every student.
  const [timelineStudentId, setTimelineStudentId] = useState<string | undefined>(undefined);
  const [refreshing, setRefreshing] = useState(false);

  const progress = useQuery({
    queryKey: qk('groups', 'getStatisticsProgress', timelineStudentId),
    queryFn: () => api.groups.getStatisticsProgress(timelineStudentId),
    enabled: visited.has('teacher'),
    // Changing the timeline filter keeps the page on screen while the new timeline loads.
    placeholderData: keepPreviousData,
  });
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
    setView(next);
    setVisited((seen) => (seen.has(next) ? seen : new Set(seen).add(next)));
  };

  const refresh = () => {
    setRefreshing(true);
    // The slice of the drilldown is part of the progress view: it reloads with it.
    if (view === 'teacher') void queryClient.invalidateQueries({ queryKey: qk('groups', 'getStatisticsDrilldown') });
    void current.refetch().finally(() => setRefreshing(false));
  };

  const body = () => {
    if (view === 'teacher' && progress.data) {
      return (
        <ProgressView
          data={progress.data}
          filterPending={progress.isPlaceholderData && progress.fetchStatus === 'fetching'}
          onTimelineStudentChange={setTimelineStudentId}
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

  const header = (
    <View style={styles.header}>
      <PageHeader title={t.title} gap={0} />

      {/* The kit's in-page tabs: no label is cut; on a narrow phone the bar scrolls, selected tab in view. */}
      <Segmented
        options={STATS_VIEWS.map((value) => ({ value, label: t.views[value] }))}
        value={view}
        onChange={selectView}
        accessibilityLabel={t.viewsAria}
        plain
        scrollable
        role="tab"
        style={styles.tabs}
        testID="stats-views"
      />

      {/* Cached numbers stay on screen when a refresh fails (offline): say so instead of replacing them. */}
      {current.isError && current.data ? (
        <Notice tone="error" text={errorText(current.error, m.common.errors.generic)} testID="stats-refresh-error" />
      ) : null}
      {/* Offline, a new timeline filter waits for the connection while the previous numbers stay. */}
      {current.isPlaceholderData && current.fetchStatus === 'paused' ? (
        <Notice tone="error" text={m.common.errors.network} testID="stats-filter-offline" />
      ) : null}
    </View>
  );

  return (
    <Screen
      testID="stats-main-screen"
      header={<ShellAppBar title={screenTitle('stats.main', m.shell.tabs)} />}
      bottomInset={false}
      scroll={false}
      padded={false}
    >
      <FlashList
        data={rows}
        keyExtractor={(row) => (row.kind === 'teacher' ? row.entry.teacherId : 'body')}
        getItemType={(row) => row.kind}
        renderItem={({ item }) =>
          item.kind === 'teacher' && teacherCards ? (
            <View style={styles.item}>
              <TeacherCard entry={item.entry} weekStarts={teacherCards.weekStarts} />
            </View>
          ) : (
            body()
          )
        }
        // The single "body" row shows whatever the current view and its query hold.
        extraData={[view, current.data, current.status, current.fetchStatus, current.isPlaceholderData, locale]}
        ListHeaderComponent={header}
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
  listContent: { paddingHorizontal: t.space.gutter, paddingTop: t.space.pageTop, paddingBottom: t.space.pageBottom },
  header: { gap: t.space.lg, paddingBottom: t.space.lg },
  // When the bar scrolls, its viewport keeps the track's rounded corners instead of a square cut.
  tabs: { borderRadius: t.radii.md },
  // The gap between cards lives inside the cells: FlashList measures each one.
  item: { paddingBottom: t.space.lg },
}));
