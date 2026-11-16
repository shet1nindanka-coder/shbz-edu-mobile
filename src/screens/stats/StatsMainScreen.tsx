import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { ScrollView, View, type ScrollViewInstance } from 'react-native';

import { qk, useApi } from '@/api';
import { useI18n } from '@/i18n';
import { useRefetchOnFocus } from '@/screens/calls/shared/use-refetch-on-focus';
import { errorText } from '@/screens/groups/shared/error-text';
import { LoadFailure, isLoadFailed } from '@/screens/groups/shared/load-failure';
import { ShellAppBar, screenTitle } from '@/screens/shell';
import { makeStyles } from '@/theme';
import { LoadingState, Notice, PageHeader, Screen, Segmented } from '@/ui';

import { STATS_VIEWS, type StatsView } from './logic';
import { PlatformView } from './views/platform-view';
import { ProgressView } from './views/progress-view';
import { TeachersView } from './views/teachers-view';

/**
 * `stats.main` (docs/spec/06-teacher-groups-calls-stats.md §1.6): the developer's statistics tab. Three
 * views behind one segmented control — «Прогресс учеников», «По учителям», «Метрики платформы» — each a
 * vertical scroll of cards. A view's data is requested when the view is first opened and then kept, so
 * switching back is instant.
 *
 * Only a DEVELOPER has this screen (the registry and the server agree: `403 developerRightsRequired`
 * for anyone else). Statistics has no realtime event of its own: it refreshes on focus, on
 * pull-to-refresh and with the staff-wide invalidation of the `groups` member.
 */
export function StatsMainScreen() {
  const styles = useStyles();
  const api = useApi();
  const queryClient = useQueryClient();
  const { dict, m } = useI18n();
  const t = dict.planner.statistics;
  const viewsScroll = useRef<ScrollViewInstance>(null);
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
    // Keep the chosen segment in view: the three of them are wider than a phone.
    if (STATS_VIEWS.indexOf(next) >= 1) viewsScroll.current?.scrollToEnd({ animated: true });
    else viewsScroll.current?.scrollTo({ x: 0, animated: true });
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
    if (view === 'teachers' && teachers.data) return <TeachersView data={teachers.data} />;
    if (view === 'developer' && platform.data) return <PlatformView data={platform.data} />;
    return isLoadFailed(current) ? (
      <LoadFailure query={current} testID="stats-error" />
    ) : (
      <LoadingState variant="cards" count={4} cardHeight={120} accessibilityLabel={m.common.a11y.loading} testID="stats-loading" />
    );
  };

  return (
    <Screen
      testID="stats-main-screen"
      header={<ShellAppBar title={screenTitle('stats.main', m.shell.tabs)} />}
      bottomInset={false}
      onRefresh={refresh}
      refreshing={refreshing}
    >
      <View style={styles.page}>
        <PageHeader title={t.title} gap={0} />

        <ScrollView
          ref={viewsScroll}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          style={styles.viewsScroll}
          contentContainerStyle={styles.viewsContent}
        >
          <Segmented
            options={STATS_VIEWS.map((value) => ({ value, label: t.views[value] }))}
            value={view}
            onChange={selectView}
            accessibilityLabel={t.viewsAria}
            plain
            role="tab"
            testID="stats-views"
          />
        </ScrollView>

        {/* Cached numbers stay on screen when a refresh fails (offline): say so instead of replacing them. */}
        {current.isError && current.data ? (
          <Notice tone="error" text={errorText(current.error, m.common.errors.generic)} testID="stats-refresh-error" />
        ) : null}
        {/* Offline, a new timeline filter waits for the connection while the previous numbers stay. */}
        {current.isPlaceholderData && current.fetchStatus === 'paused' ? (
          <Notice tone="error" text={m.common.errors.network} testID="stats-filter-offline" />
        ) : null}

        {body()}
      </View>
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  page: { gap: t.space.lg },
  // The segments may be wider than the screen: they scroll, bleeding into the gutters.
  viewsScroll: { flexGrow: 0, marginHorizontal: -t.space.gutter },
  viewsContent: { paddingHorizontal: t.space.gutter },
}));
