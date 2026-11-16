import { useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { ScrollView, View, type ScrollViewInstance } from 'react-native';

import { POLLING, isNotFoundError, qk, useApi } from '@/api';
import { useI18n } from '@/i18n';
import { useAppNavigation, type ScreenParams } from '@/navigation';
import { useRefetchOnFocus } from '@/screens/calls/shared/use-refetch-on-focus';
import { DetailAppBar, NotFoundScreen } from '@/screens/shell';
import { makeStyles } from '@/theme';
import { Button, IconButton, LoadingState, Notice, Screen, Segmented } from '@/ui';

import { ATTENDANCE_PERIOD, AttendanceTab } from './detail/attendance-tab';
import { GroupSettings } from './detail/group-settings';
import { LessonsTab } from './detail/lessons-tab';
import { MembersTab } from './detail/members-tab';
import { StatisticsTab } from './detail/statistics-tab';
import { useReportExport } from './detail/use-report-export';
import { hasActiveLesson } from './logic';
import { errorText } from './shared/error-text';
import { LoadFailure, isLoadFailed } from './shared/load-failure';
import { LIST_SCOPE, postGroupNotice, useGroupNotice } from './shared/notice-store';

/** Route params of `groups.detail` (docs/spec/00-unified-contract.md §3; `ScreenParams` in src/navigation/routes.ts). */
export type GroupDetailScreenProps = ScreenParams['groups.detail'];

type Tab = 'members' | 'statistics' | 'attendance' | 'lessons';
const TABS: readonly Tab[] = ['members', 'statistics', 'attendance', 'lessons'];

type Banner = { tone: 'success'; key: 'saved' } | { tone: 'error'; text: string };

/**
 * `groups.detail` (docs/spec/06-teacher-groups-calls-stats.md §1.2, §1.3): one group of the teacher.
 * The site's four long sections become four tabs — members (with the AI profile), statistics,
 * attendance, lessons; rename and delete sit behind the app bar's "⋯". Statistics and attendance are
 * loaded when their tab is first opened.
 */
export function GroupDetailScreen({ groupId }: GroupDetailScreenProps) {
  const styles = useStyles();
  const api = useApi();
  const navigation = useAppNavigation();
  const { dict, m } = useI18n();
  const t = dict.planner.groups.detail;
  const report = useReportExport();
  const tabsScroll = useRef<ScrollViewInstance>(null);
  const [tab, setTab] = useState<Tab>('members');
  const [visited, setVisited] = useState<ReadonlySet<Tab>>(new Set<Tab>(['members']));
  const [createdNotice, dismissCreated] = useGroupNotice(groupId);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // The group has just been deleted here: nothing may refetch (and answer 404) while the screen leaves.
  const [leaving, setLeaving] = useState(false);

  const group = useQuery({
    queryKey: qk('groups', 'getGroup', groupId),
    queryFn: () => api.groups.getGroup(groupId),
    enabled: !leaving,
  });
  const statistics = useQuery({
    queryKey: qk('groups', 'getGroupStatistics', groupId),
    queryFn: () => api.groups.getGroupStatistics(groupId),
    enabled: visited.has('statistics') && !leaving,
  });
  const attendance = useQuery({
    queryKey: qk('groups', 'getGroupAttendance', groupId, ATTENDANCE_PERIOD),
    queryFn: () => api.groups.getGroupAttendance(groupId, ATTENDANCE_PERIOD),
    enabled: visited.has('attendance') && !leaving,
    // Students join and submit while a lesson runs: realtime refreshes the table, this is the fallback.
    refetchInterval: (query) =>
      tab === 'attendance' && !leaving && hasActiveLesson(query.state.data) ? POLLING.lessonLiveMs : false,
  });

  // Membership has no realtime event (06 §5) and this screen stays mounted under the student card and the
  // lesson board: what went stale meanwhile is reloaded when it comes back (00 §2.3 "refetch on focus").
  useRefetchOnFocus(
    leaving
      ? []
      : [group, ...(visited.has('statistics') ? [statistics] : []), ...(visited.has('attendance') ? [attendance] : [])],
  );

  // A foreign or deleted group is indistinguishable from a missing one.
  if (isNotFoundError(group.error) && !leaving) return <NotFoundScreen />;

  const data = group.data;

  const selectTab = (next: Tab) => {
    setTab(next);
    setVisited((current) => (current.has(next) ? current : new Set(current).add(next)));
    // Keep the chosen segment in view: the four of them are wider than a phone.
    if (TABS.indexOf(next) >= 2) tabsScroll.current?.scrollToEnd({ animated: true });
    else tabsScroll.current?.scrollTo({ x: 0, animated: true });
  };

  const refresh = () => {
    setRefreshing(true);
    void Promise.all([
      group.refetch(),
      visited.has('statistics') ? statistics.refetch() : null,
      visited.has('attendance') ? attendance.refetch() : null,
    ]).finally(() => setRefreshing(false));
  };

  const composeLink = { screen: 'planner.lessonNew', groupId } as const;
  const homeworkLink = { screen: 'planner.draftNew', groupId } as const;

  return (
    <Screen
      testID="group-detail-screen"
      header={
        <DetailAppBar
          title={data ? data.group.name : t.kicker}
          subtitle={data ? t.kicker : undefined}
          right={
            data ? (
              <IconButton
                icon="more"
                accessibilityLabel={m.groups.detail.menuAria}
                onPress={() => setMenuOpen(true)}
                testID="group-menu"
              />
            ) : undefined
          }
        />
      }
      // The screen lives in the stack of the «ещё» tab: the tab bar owns the bottom inset.
      bottomInset={false}
      onRefresh={refresh}
      refreshing={refreshing}
    >
      {data ? (
        <View style={styles.page}>
          {createdNotice === 'created' ? (
            <Notice
              tone="success"
              text={t.notices.created}
              onDismiss={dismissCreated}
              dismissLabel={m.common.actions.close}
              testID="group-notice-created"
            />
          ) : null}
          {banner ? (
            <Notice
              tone={banner.tone}
              text={banner.tone === 'success' ? t.notices.saved : banner.text}
              onDismiss={() => setBanner(null)}
              dismissLabel={m.common.actions.close}
              testID="group-notice"
            />
          ) : null}
          {/* Cached data stays on screen when a refresh fails (offline): say so instead of replacing it. */}
          {group.isError ? (
            <Notice tone="error" text={errorText(group.error, m.common.errors.generic)} testID="group-refresh-error" />
          ) : null}

          <View style={styles.actions}>
            {navigation.canOpen(composeLink) ? (
              <Button
                label={t.composeLesson}
                onPress={() => navigation.open(composeLink)}
                style={styles.action}
                testID="group-compose-lesson"
              />
            ) : null}
            {navigation.canOpen(homeworkLink) ? (
              <Button
                label={t.issueHomework}
                variant="outline"
                onPress={() => navigation.open(homeworkLink)}
                style={styles.action}
                testID="group-issue-homework"
              />
            ) : null}
          </View>

          <ScrollView
            ref={tabsScroll}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            style={styles.tabsScroll}
            contentContainerStyle={styles.tabsContent}
          >
            <Segmented
              options={TABS.map((value) => ({ value, label: m.groups.detail.tabs[value] }))}
              value={tab}
              onChange={selectTab}
              accessibilityLabel={m.groups.detail.tabsAria}
              plain
              role="tab"
              testID="group-tabs"
            />
          </ScrollView>

          {tab === 'members' ? (
            <MembersTab group={data.group} onProfileError={(text) => setBanner({ tone: 'error', text })} />
          ) : null}
          {tab === 'statistics' ? <StatisticsTab stats={statistics} report={report} /> : null}
          {tab === 'attendance' ? <AttendanceTab groupId={groupId} attendance={attendance} report={report} /> : null}
          {tab === 'lessons' ? <LessonsTab lessons={data.lessons} /> : null}

          <GroupSettings
            group={data.group}
            menuOpen={menuOpen}
            onCloseMenu={() => setMenuOpen(false)}
            onRenamed={() => setBanner({ tone: 'success', key: 'saved' })}
            onDeleted={() => {
              setLeaving(true);
              dismissCreated();
              // The site redirects to the list with «Группа удалена. Ученики остались на платформе.»
              postGroupNotice(LIST_SCOPE, 'deleted');
              navigation.back();
            }}
            onDeleteFailed={(text) => setBanner({ tone: 'error', text })}
          />
        </View>
      ) : isLoadFailed(group) ? (
        <LoadFailure query={group} testID="group-error" />
      ) : (
        <LoadingState variant="cards" tabs count={3} accessibilityLabel={m.common.a11y.loading} testID="group-loading" />
      )}
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  page: { gap: t.space.lg },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.md },
  // Each button is as wide as its label; when the two do not fit one line (English) they stack.
  action: { flexGrow: 1 },
  // The segments may be wider than the screen: they scroll, bleeding into the gutters.
  tabsScroll: { flexGrow: 0, marginHorizontal: -t.space.gutter },
  tabsContent: { paddingHorizontal: t.space.gutter },
}));
