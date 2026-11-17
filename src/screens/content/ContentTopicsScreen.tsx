import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { RefreshControl, View } from 'react-native';

import { errorText, qk, useApi } from '@/api';
import type { TopicListItem } from '@/api/types';
import { LoadFailure, loadFailureOf } from '@/components/load-failure';
import { useI18n } from '@/i18n';
import { tabsForRole, useAppNavigation, useRefetchOnFocus } from '@/navigation';
import { useCurrentUser } from '@/providers';
import { DetailAppBar, ShellAppBar, screenTitle } from '@/screens/shell';
import { makeStyles, useTheme } from '@/theme';
import { Button, EmptyState, LoadingState, Notice, Screen, Text } from '@/ui';

import { CreateTopicSheet } from './browse/create-topic-sheet';
import { ReorderSheet } from './browse/reorder-sheet';
import { TopicCard } from './browse/topic-card';
import { useListScrollMemory } from './browse/use-list-scroll-memory';
import { DeleteTopicDialog } from './shared/delete-topic-dialog';
import { pinnedColumn } from './shared/pinned-column';
import { useTopicsFlash } from './shared/topics-flash';

type ListNotice = { tone: 'success' | 'error'; text: string };

/**
 * `content.topics` (docs/spec/07-developer-content.md §1.1): the shared topic bank. A TEACHER browses it
 * read-only (under «ещё»); for a DEVELOPER it is the home tab and also the place to create topics (AI
 * import or the manual form), delete them and change their order.
 */
export function ContentTopicsScreen() {
  const styles = useStyles();
  const theme = useTheme();
  const api = useApi();
  const { dict, m } = useI18n();
  const t = dict.topics.list;
  const user = useCurrentUser();
  const navigation = useAppNavigation();
  const isDeveloper = user.role === 'DEVELOPER';
  // The developer's first tab; for a teacher the list is pushed from the «ещё» tab.
  const isTabRoot = tabsForRole(user.role).some((tab) => tab.section === 'content.topics');
  const title = screenTitle('content.topics', m.shell.tabs);

  // One banner at a time: a new message replaces the one on screen.
  const [notice, setNotice] = useState<ListNotice | null>(null);
  // A topic deleted from its own screen leaves a message for the list (the site's `?deleted=1`). The list
  // takes it into its own state: it is shown once, to the account that deleted the topic.
  useTopicsFlash((flash) => setNotice({ tone: 'success', text: flash === 'deleted' ? t.notices.deleted : t.notices.created }));
  const [createOpen, setCreateOpen] = useState(false);
  const [reorderOpen, setReorderOpen] = useState(false);
  const [deleting, setDeleting] = useState<{ id: string; title: string } | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const topics = useQuery({ queryKey: qk('content', 'listTopics'), queryFn: () => api.content.listTopics() });
  const list = topics.data;
  const failure = loadFailureOf(topics);
  // Realtime `topic-content-changed` comes first; a list that stayed mounted under another screen (the
  // developer's tab root, the teacher's «ещё» stack) also asks again when it is returned to (00 §2.3).
  useRefetchOnFocus([topics]);

  // Web only (see the hook): the list keeps its place while the screen is covered by another one.
  const listRef = useRef<FlashListRef<TopicListItem>>(null);
  const scrollMemory = useListScrollMemory((offset) => listRef.current?.scrollToOffset({ offset, animated: false }));

  const refresh = () => {
    setRefreshing(true);
    void topics.refetch().finally(() => setRefreshing(false));
  };

  const open = (topic: TopicListItem) => navigation.push({ screen: 'content.topic', topicId: topic.id });

  const banners =
    notice || (topics.isError && list) ? (
      <View style={styles.banners}>
        {notice ? (
          <Notice
            tone={notice.tone}
            text={notice.text}
            onDismiss={() => setNotice(null)}
            dismissLabel={m.common.actions.close}
            testID="topics-notice"
          />
        ) : null}
        {/* Cached topics stay on screen when a refresh fails (offline): say so instead of replacing them. */}
        {topics.isError && list ? (
          <Notice tone="error" text={errorText(topics.error, m.common.errors.generic)} testID="topics-refresh-error" />
        ) : null}
      </View>
    ) : null;

  const header = (
    <View style={styles.header}>
      {isDeveloper ? (
        <View style={styles.actions}>
          <Button
            label={m.content.list.createAction}
            accessibilityLabel={t.createSection}
            leftIcon="plus"
            onPress={() => setCreateOpen(true)}
            style={styles.action}
            testID="topics-create"
          />
          {list && list.length > 1 ? (
            <Button
              label={m.content.reorder.action}
              variant="outline"
              leftIcon="list"
              onPress={() => setReorderOpen(true)}
              style={styles.action}
              testID="topics-reorder"
            />
          ) : null}
        </View>
      ) : null}
      <Text variant="sectionTitle" accessibilityRole="header">
        {t.allTopics}
      </Text>
    </View>
  );

  return (
    <Screen
      testID="content-topics-screen"
      header={
        <>
          {isTabRoot ? <ShellAppBar title={title} /> : <DetailAppBar title={title} subtitle={t.title} />}
          {/* Pinned under the bar: a banner stays in view wherever the cards are scrolled to. */}
          {banners}
        </>
      }
      // Both placements sit inside a tab navigator: the tab bar owns the bottom inset.
      bottomInset={false}
      // The loaded list scrolls by itself (virtualised); the loading and error states use the screen's scroll.
      scroll={!list}
      padded={!list}
      onRefresh={list ? undefined : refresh}
      refreshing={refreshing}
    >
      {list ? (
        // The whole bank arrives in one response and its size is the server's business: the cards are
        // virtualised, as on the student's theory list of the same topics.
        <View style={styles.list} onLayout={scrollMemory.onLayout}>
          <FlashList<TopicListItem>
            ref={listRef}
            {...scrollMemory.listProps}
            data={list}
            keyExtractor={(topic) => topic.id}
            renderItem={({ item }) => (
              <View style={styles.item}>
                <TopicCard
                  topic={item}
                  onOpen={open}
                  onDelete={isDeveloper ? (target) => setDeleting({ id: target.id, title: target.title }) : undefined}
                />
              </View>
            )}
            ListHeaderComponent={header}
            ListEmptyComponent={<EmptyState title={t.empty} testID="topics-empty" />}
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
            testID="topics-list"
          />
        </View>
      ) : failure ? (
        <LoadFailure query={topics} testID="topics-error" />
      ) : (
        <LoadingState variant="cards" accessibilityLabel={m.common.a11y.loading} testID="topics-loading" />
      )}

      {isDeveloper ? (
        <>
          <CreateTopicSheet
            visible={createOpen}
            onClose={() => setCreateOpen(false)}
            onCreated={() => {
              setCreateOpen(false);
              setNotice({ tone: 'success', text: t.notices.created });
            }}
            onImported={(topicId) => {
              setCreateOpen(false);
              // A topic created by import has no files: the developer attaches them on the edit screen.
              navigation.open({ screen: 'content.topicEdit', topicId });
            }}
          />
          <ReorderSheet
            visible={reorderOpen}
            topics={list ?? []}
            onClose={() => setReorderOpen(false)}
            onSaved={() => {
              setReorderOpen(false);
              setNotice({ tone: 'success', text: m.content.reorder.saved });
            }}
          />
          <DeleteTopicDialog
            topic={deleting}
            onClose={() => setDeleting(null)}
            onDeleted={() => {
              setDeleting(null);
              setNotice({ tone: 'success', text: t.notices.deleted });
            }}
          />
        </>
      ) : null}
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  list: { flex: 1 },
  listContent: { paddingHorizontal: t.space.gutter, paddingTop: t.space.pageTop, paddingBottom: t.space.pageBottom },
  item: { paddingBottom: t.space.lg },
  banners: { ...pinnedColumn, gap: t.space.sm, paddingHorizontal: t.space.gutter, paddingTop: t.space.md },
  header: { gap: t.space.field, paddingBottom: t.space.lg },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.md },
  action: { flexGrow: 1, flexBasis: 140 },
}));
