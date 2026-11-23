import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';

import { errorText, qk, useApi } from '@/api';
import type { GroupListItem } from '@/api/types';
import { LoadFailure, isLoadFailed } from '@/components/load-failure';
import { useI18n } from '@/i18n';
import { useAppNavigation, useRefetchOnFocus, useStillHere } from '@/navigation';
import { ShellAppBar, screenTitle } from '@/screens/shell';
import { usePullRefresh } from '@/services/query';
import { makeStyles, useTheme } from '@/theme';
import { Button, EmptyState, ListCard, LoadingState, Notice, Panels, Screen } from '@/ui';

import { GroupDetailPane } from './detail/group-detail-pane';
import { CreateGroupSheet } from './list/create-group-sheet';
import { GroupRow } from './list/group-row';
import { GROUPS_LIST_NOTICE, groupNoticeChannel, postGroupNotice, useGroupNotice } from './shared/notice-store';
import { ScrollPanel } from './shared/scroll-panel';

/**
 * `groups.list` (docs/spec/06-teacher-groups-calls-stats.md §1.1; layout: docs/design/glass-over-paper.md
 * §7, mockup `T-groups`): the teacher's groups in creation order, each a row — the name and «8 класс · 4
 * ученика». «Создать группу» is folded behind a button (hidden when the server says the viewer cannot
 * create, i.e. a developer).
 *
 * Phone: a row opens the group's own screen; a new group opens straight away, as the site does after the
 * redirect. Tablet: the list is the left panel and the selected group — the first one until another is
 * picked — fills the right one.
 */
export function GroupsListScreen() {
  const styles = useStyles();
  const theme = useTheme();
  const api = useApi();
  const navigation = useAppNavigation();
  const stillHere = useStillHere();
  const { dict, m } = useI18n();
  const t = dict.planner.groups.list;
  const [notice, dismissNotice] = useGroupNotice(GROUPS_LIST_NOTICE);
  const [createOpen, setCreateOpen] = useState(false);
  // Tablet: the group the right panel shows.
  const [pickedId, setPickedId] = useState<string | null>(null);
  // Groups deleted (or found missing) in the right panel: the cached list still names them until it has
  // reloaded, and neither the list nor the panel may offer them meanwhile.
  const [gone, setGone] = useState<ReadonlySet<string>>(new Set<string>());

  const groups = useQuery({ queryKey: qk('groups', 'listGroups'), queryFn: () => api.groups.listGroups() });
  // The list stays mounted under an open group: a stale list is reloaded on the way back (00 §2.3).
  useRefetchOnFocus([groups]);
  const data = groups.data;
  const canCreate = data?.canCreate === true;
  const listed = data?.groups.filter((group) => !gone.has(group.id));
  // Two panels need a group to show: an empty list keeps the one-column empty state.
  const panels = theme.tablet && listed !== undefined && listed.length > 0;
  // A picked group that is not in the list is either brand new (the list is still reloading) or gone.
  const pickedKnown = pickedId !== null && (groups.isFetching || Boolean(listed?.some((group) => group.id === pickedId)));
  const selectedId = panels ? (pickedKnown ? pickedId : (listed[0]?.id ?? null)) : null;

  const { refreshing, refresh } = usePullRefresh([groups]);

  const open = (group: GroupListItem) => {
    // Notices are one-shot, like the site's redirect parameters: leaving the list drops «Группа удалена».
    dismissNotice();
    if (panels) setPickedId(group.id);
    else navigation.push({ screen: 'groups.detail', groupId: group.id });
  };

  const notices = (
    <>
      {notice ? (
        <Notice
          tone={notice === 'deleted' ? 'success' : 'error'}
          text={notice === 'deleted' ? t.notices.deleted : t.notices.missing}
          onDismiss={dismissNotice}
          dismissLabel={m.common.actions.close}
          testID="groups-notice"
        />
      ) : null}
      {/* Cached groups stay on screen when a refresh fails (offline): say so instead of replacing them. */}
      {groups.isError && data ? (
        <Notice tone="error" text={errorText(groups.error, m.common.errors.generic)} testID="groups-refresh-error" />
      ) : null}
    </>
  );

  const rows = listed?.map((group, index) => (
    <GroupRow key={group.id} group={group} selected={group.id === selectedId} divider={index < listed.length - 1} onOpen={open} />
  ));

  const createSheet = canCreate ? (
    <CreateGroupSheet
      visible={createOpen}
      onClose={() => setCreateOpen(false)}
      onCreated={(group) => {
        setCreateOpen(false);
        dismissNotice();
        // The site redirects to the new group with «Группа создана. Добавьте в неё учеников.»
        postGroupNotice(groupNoticeChannel(group.id), 'created');
        if (theme.tablet) setPickedId(group.id);
        // Only from the list itself: a teacher who has moved on meanwhile finds the group in the list.
        else if (stillHere()) navigation.push({ screen: 'groups.detail', groupId: group.id });
      }}
    />
  ) : null;

  const title = screenTitle('groups.list', m.shell.tabs);

  if (panels) {
    return (
      <Screen testID="groups-list-screen" header={<ShellAppBar title={title} />} scroll={false} maxWidth="full">
        <Panels>
          <ScrollPanel
            weight={2}
            padded={false}
            refreshing={refreshing}
            onRefresh={refresh}
            // Next to an open group the gradient belongs to the group's «Составить урок».
            footer={
              canCreate ? (
                <Button label={t.create} variant="outline" leftIcon="plus" fullWidth onPress={() => setCreateOpen(true)} testID="groups-create" />
              ) : undefined
            }
            testID="groups-list"
          >
            {notice || (groups.isError && data) ? <View style={styles.panelNotices}>{notices}</View> : null}
            {rows}
          </ScrollPanel>
          {selectedId ? (
            // A key per group: its tab, banners and sheets never carry over to the next one.
            <GroupDetailPane
              key={selectedId}
              weight={3}
              groupId={selectedId}
              onGone={() => {
                setGone((current) => new Set(current).add(selectedId));
                setPickedId(null);
              }}
            />
          ) : null}
        </Panels>
        {createSheet}
      </Screen>
    );
  }

  return (
    <Screen
      testID="groups-list-screen"
      header={
        <ShellAppBar
          title={title}
          aside={
            canCreate ? <Button label={t.create} leftIcon="plus" onPress={() => setCreateOpen(true)} testID="groups-create" /> : undefined
          }
        />
      }
      onRefresh={data || isLoadFailed(groups) ? refresh : undefined}
      refreshing={refreshing}
    >
      {notices}
      {listed ? (
        listed.length === 0 ? (
          <EmptyState title={t.emptyTitle} hint={t.emptyHint} testID="groups-empty" />
        ) : (
          <ListCard testID="groups-list">{rows}</ListCard>
        )
      ) : isLoadFailed(groups) ? (
        <LoadFailure query={groups} testID="groups-error" />
      ) : (
        <LoadingState variant="list" accessibilityLabel={m.common.a11y.loading} testID="groups-loading" />
      )}
      {createSheet}
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  panelNotices: { gap: t.space.sm, paddingHorizontal: t.space.card, paddingBottom: t.space.sm },
}));
