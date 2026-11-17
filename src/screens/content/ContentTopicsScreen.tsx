import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';

import { qk, useApi } from '@/api';
import type { TopicListItem } from '@/api/types';
import { useI18n } from '@/i18n';
import { tabsForRole, useAppNavigation } from '@/navigation';
import { useCurrentUser } from '@/providers';
import { DetailAppBar, ShellAppBar, screenTitle } from '@/screens/shell';
import { makeStyles } from '@/theme';
import { Button, EmptyState, LoadingState, Notice, Screen, Text } from '@/ui';

import { CreateTopicSheet } from './browse/create-topic-sheet';
import { ReorderSheet } from './browse/reorder-sheet';
import { TopicCard } from './browse/topic-card';
import { DeleteTopicDialog } from './shared/delete-topic-dialog';
import { errorText } from './shared/error-text';
import { LoadFailure, loadFailureOf } from './shared/load-failure';
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
  const api = useApi();
  const { dict, m } = useI18n();
  const t = dict.topics.list;
  const user = useCurrentUser();
  const navigation = useAppNavigation();
  const isDeveloper = user.role === 'DEVELOPER';
  // The developer's first tab; for a teacher the list is pushed from the «ещё» tab.
  const isTabRoot = tabsForRole(user.role).some((tab) => tab.section === 'content.topics');
  const title = screenTitle('content.topics', m.shell.tabs);

  const [ownNotice, setOwnNotice] = useState<ListNotice | null>(null);
  // A topic deleted from its own screen leaves a message for the list (the site's `?deleted=1`).
  const { flash, clear: clearFlash } = useTopicsFlash();
  const notice: ListNotice | null =
    ownNotice ?? (flash ? { tone: 'success', text: flash === 'deleted' ? t.notices.deleted : t.notices.created } : null);
  const setNotice = (next: ListNotice | null) => {
    // One banner at a time: a new message replaces a pending one.
    clearFlash();
    setOwnNotice(next);
  };
  const [createOpen, setCreateOpen] = useState(false);
  const [reorderOpen, setReorderOpen] = useState(false);
  const [deleting, setDeleting] = useState<{ id: string; title: string } | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const topics = useQuery({ queryKey: qk('content', 'listTopics'), queryFn: () => api.content.listTopics() });
  const list = topics.data;
  const failure = loadFailureOf(topics);

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
      onRefresh={refresh}
      refreshing={refreshing}
    >
      {list ? (
        // A plain column, not a virtualised list: the bank holds a few dozen topics at most and the site
        // shows them all at once (no pagination).
        <View style={styles.content} testID="topics-list">
          {header}
          {list.length === 0 ? (
            <EmptyState title={t.empty} testID="topics-empty" />
          ) : (
            list.map((topic) => (
              <TopicCard
                key={topic.id}
                topic={topic}
                onOpen={open}
                onDelete={isDeveloper ? (item) => setDeleting({ id: item.id, title: item.title }) : undefined}
              />
            ))
          )}
        </View>
      ) : failure ? (
        <LoadFailure error={failure.error} onRetry={() => void topics.refetch()} retrying={topics.isFetching && !topics.isPaused} testID="topics-error" />
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
  content: { gap: t.space.lg },
  banners: { ...pinnedColumn, gap: t.space.sm, paddingHorizontal: t.space.gutter, paddingTop: t.space.md },
  header: { gap: t.space.field },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.md },
  action: { flexGrow: 1, flexBasis: 140 },
}));
