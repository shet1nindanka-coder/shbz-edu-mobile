import { FlashList } from '@shopify/flash-list';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { RefreshControl, View } from 'react-native';

import { errorText, qk, useApi } from '@/api';
import type { GroupListItem } from '@/api/types';
import { LoadFailure, isLoadFailed } from '@/components/load-failure';
import { useI18n } from '@/i18n';
import { useAppNavigation, useRefetchOnFocus, useStillHere } from '@/navigation';
import { DetailAppBar } from '@/screens/shell';
import { usePullRefresh } from '@/services/query';
import { makeStyles, useTheme } from '@/theme';
import { Button, EmptyState, IconButton, LoadingState, Notice, Screen } from '@/ui';

import { CreateGroupSheet } from './list/create-group-sheet';
import { GroupCard } from './list/group-card';
import { GROUPS_LIST_NOTICE, groupNoticeChannel, postGroupNotice, useGroupNotice } from './shared/notice-store';

/**
 * `groups.list` (docs/spec/06-teacher-groups-calls-stats.md §1.1): the teacher's groups under «ещё».
 * Cards in creation order; "+" opens the create sheet (hidden when the server says the viewer cannot
 * create, i.e. a developer). A new group opens straight away, as the site does after the redirect.
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

  const groups = useQuery({ queryKey: qk('groups', 'listGroups'), queryFn: () => api.groups.listGroups() });
  // The list stays mounted under an open group: a stale list is reloaded on the way back (00 §2.3).
  useRefetchOnFocus([groups]);
  const data = groups.data;
  const canCreate = data?.canCreate === true;
  const canCompose = navigation.canOpen({ screen: 'planner.lessonNew' });

  const { refreshing, refresh } = usePullRefresh([groups]);

  const open = (group: GroupListItem) => {
    // Notices are one-shot, like the site's redirect parameters: leaving the list drops «Группа удалена».
    dismissNotice();
    navigation.push({ screen: 'groups.detail', groupId: group.id });
  };
  const compose = (group: GroupListItem) => navigation.open({ screen: 'planner.lessonNew', groupId: group.id });

  const createButton = canCreate ? (
    <Button label={t.create} leftIcon="plus" onPress={() => setCreateOpen(true)} testID="groups-empty-create" />
  ) : undefined;

  const header = (
    <View style={styles.header}>
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
    </View>
  );

  return (
    <Screen
      testID="groups-list-screen"
      header={
        <DetailAppBar
          title={t.title}
          right={
            canCreate ? (
              <IconButton icon="plus" accessibilityLabel={t.create} onPress={() => setCreateOpen(true)} testID="groups-create" />
            ) : undefined
          }
        />
      }
      // The screen lives in the stack of the «ещё» tab: the tab bar owns the bottom inset.
      bottomInset={false}
      scroll={!data}
      padded={!data}
      onRefresh={data ? undefined : isLoadFailed(groups) ? refresh : undefined}
      refreshing={refreshing}
    >
      {data ? (
        <FlashList
          data={data.groups}
          keyExtractor={(group) => group.id}
          renderItem={({ item }) => (
            <View style={styles.item}>
              <GroupCard group={item} onOpen={open} onComposeLesson={canCompose ? compose : undefined} />
            </View>
          )}
          ListHeaderComponent={header}
          ListEmptyComponent={
            <View style={styles.item}>
              <EmptyState title={t.emptyTitle} hint={t.emptyHint} action={createButton} testID="groups-empty" />
            </View>
          }
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
          testID="groups-list"
        />
      ) : isLoadFailed(groups) ? (
        <LoadFailure query={groups} testID="groups-error" />
      ) : (
        <LoadingState variant="cards" count={3} accessibilityLabel={m.common.a11y.loading} testID="groups-loading" />
      )}

      {canCreate ? (
        <CreateGroupSheet
          visible={createOpen}
          onClose={() => setCreateOpen(false)}
          onCreated={(group) => {
            setCreateOpen(false);
            dismissNotice();
            // The site redirects to the new group with «Группа создана. Добавьте в неё учеников.»
            postGroupNotice(groupNoticeChannel(group.id), 'created');
            // Only from the list itself: a teacher who has moved on meanwhile finds the group in the list.
            if (stillHere()) navigation.push({ screen: 'groups.detail', groupId: group.id });
          }}
        />
      ) : null}
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  listContent: {
    paddingHorizontal: t.space.gutter,
    paddingTop: t.space.lg,
    paddingBottom: t.space.pageBottom,
  },
  // Gaps live inside the items: FlashList measures each cell, separators would not follow the header.
  header: { gap: t.space.md },
  item: { paddingTop: t.space.md, paddingBottom: t.space.xxs },
}));
