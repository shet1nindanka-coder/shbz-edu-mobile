import { View } from 'react-native';

import { errorText } from '@/api';
import { useI18n } from '@/i18n';
import { useAppNavigation } from '@/navigation';
import { makeStyles } from '@/theme';
import { Button, IconButton, Notice, Segmented, type IconButtonVariant } from '@/ui';

import { AttendanceTab } from './attendance-tab';
import { GroupSettings } from './group-settings';
import { LessonsTab } from './lessons-tab';
import { MembersTab } from './members-tab';
import { StatisticsTab } from './statistics-tab';
import type { GroupDetailState, GroupTab } from './use-group-detail';

// The pieces of one group, shared by its three layouts: the pushed screen of a phone, the two panels of
// a tablet and the panel next to the groups list. Each takes the state of `useGroupDetail`.

/** One-shot banners of the group: «Группа создана», the outcome of a rename or a delete, a failed refresh. */
export function GroupNotices({ state }: { state: GroupDetailState }) {
  const { dict, m } = useI18n();
  const t = dict.planner.groups.detail;
  const { createdNotice, banner, group } = state;
  return (
    <>
      {createdNotice === 'created' ? (
        <Notice
          tone="success"
          text={t.notices.created}
          onDismiss={state.dismissCreated}
          dismissLabel={m.common.actions.close}
          testID="group-notice-created"
        />
      ) : null}
      {banner ? (
        <Notice
          tone={banner.tone}
          text={banner.tone === 'success' ? t.notices.saved : banner.text}
          onDismiss={() => state.setBanner(null)}
          dismissLabel={m.common.actions.close}
          testID="group-notice"
        />
      ) : null}
      {/* Cached data stays on screen when a refresh fails (offline): say so instead of replacing it. */}
      {group.isError && state.data ? (
        <Notice tone="error" text={errorText(group.error, m.common.errors.generic)} testID="group-refresh-error" />
      ) : null}
    </>
  );
}

/** True when a banner of `GroupNotices` is on screen (a layout leaves no empty row for it otherwise). */
export function hasGroupNotices(state: GroupDetailState): boolean {
  return state.createdNotice === 'created' || state.banner !== null || (state.group.isError && state.data !== undefined);
}

/**
 * What a teacher does with a group: «Составить урок» — the screen's one gradient button — and «Выдать ДЗ
 * группе». A role that cannot open one of them does not get its button.
 */
export function GroupActions({ groupId, stretch = false }: { groupId: string; stretch?: boolean }) {
  const styles = useStyles();
  const navigation = useAppNavigation();
  const { dict } = useI18n();
  const t = dict.planner.groups.detail;
  const composeLink = { screen: 'planner.lessonNew', groupId } as const;
  const homeworkLink = { screen: 'planner.draftNew', groupId } as const;
  const canCompose = navigation.canOpen(composeLink);
  const canIssue = navigation.canOpen(homeworkLink);
  if (!canCompose && !canIssue) return null;
  return (
    <View style={styles.actions}>
      {canCompose ? (
        <Button
          label={t.composeLesson}
          onPress={() => navigation.open(composeLink)}
          style={stretch ? styles.action : null}
          testID="group-compose-lesson"
        />
      ) : null}
      {canIssue ? (
        <Button
          label={t.issueHomework}
          variant="outline"
          onPress={() => navigation.open(homeworkLink)}
          style={stretch ? styles.action : null}
          testID="group-issue-homework"
        />
      ) : null}
    </View>
  );
}

/** The «⋯» of the group: rename and delete are behind it. */
export function GroupMenuButton({ state, variant }: { state: GroupDetailState; variant?: IconButtonVariant }) {
  const { m } = useI18n();
  return (
    <IconButton
      icon="more"
      variant={variant}
      accessibilityLabel={m.groups.detail.menuAria}
      onPress={() => state.setMenuOpen(true)}
      testID="group-menu"
    />
  );
}

/**
 * The parts of a group as one switch: never all open at once. While the labels fit it fills its row; on
 * a narrow phone it scrolls with the selected part kept in view, and no label is cut.
 */
export function GroupTabsBar({ state, tabs }: { state: GroupDetailState; tabs: readonly GroupTab[] }) {
  const { dict, m } = useI18n();
  const t = dict.planner.groups.detail;
  const labels: Record<GroupTab, string> = {
    members: t.participants,
    statistics: m.groups.detail.statisticsTab,
    attendance: t.attendance,
    lessons: dict.students.detail.tabLessons,
  };
  return (
    <Segmented
      options={tabs.map((value) => ({ value, label: labels[value] }))}
      value={state.tab}
      onChange={state.selectTab}
      accessibilityLabel={m.groups.detail.tabsAria}
      plain
      scrollable
      role="tab"
      testID="group-tabs"
    />
  );
}

/** One part of the group. Renders nothing until the group itself has loaded. */
export function GroupTabBody({ state, tab }: { state: GroupDetailState; tab: GroupTab }) {
  const { data } = state;
  if (!data) return null;
  switch (tab) {
    case 'members':
      return <MembersTab group={data.group} onProfileError={(text) => state.setBanner({ tone: 'error', text })} />;
    case 'statistics':
      return <StatisticsTab stats={state.statistics} report={state.report} />;
    case 'attendance':
      return <AttendanceTab groupId={state.groupId} attendance={state.attendance} report={state.report} wait={state.attendanceWait} />;
    case 'lessons':
      return <LessonsTab lessons={data.lessons} />;
  }
}

/** The sheets behind «⋯»: rename, and delete with its confirmation. */
export function GroupSettingsHost({ state }: { state: GroupDetailState }) {
  const { data } = state;
  if (!data) return null;
  return (
    <GroupSettings
      group={data.group}
      menuOpen={state.menuOpen}
      onCloseMenu={() => state.setMenuOpen(false)}
      onRenamed={() => state.setBanner({ tone: 'success', key: 'saved' })}
      onDeleted={state.onDeleted}
      onDeleteFailed={(text) => state.setBanner({ tone: 'error', text })}
      onMissing={state.onMissing}
    />
  );
}

const useStyles = makeStyles((t) => ({
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.sm },
  // Each button is as wide as its label and they share what is left; when the two do not fit one line
  // (English) they stack.
  action: { flexGrow: 1 },
}));
