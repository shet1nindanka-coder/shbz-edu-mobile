import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';

import { errorText, qk, useApi } from '@/api';
import type { TopicListItem } from '@/api/types';
import { LoadFailure, loadFailureOf } from '@/components/load-failure';
import { useI18n } from '@/i18n';
import { tabsForRole, useAppNavigation, useRefetchOnFocus, useStillHere } from '@/navigation';
import { useCurrentUser } from '@/providers';
import { DetailAppBar, ShellAppBar, screenTitle } from '@/screens/shell';
import { usePullRefresh } from '@/services/query';
import { makeStyles, useTheme } from '@/theme';
import { Button, EmptyState, ListCard, LoadingState, Notice, Panel, Panels, Screen } from '@/ui';

import { CreateTopicSheet } from './browse/create-topic-sheet';
import { ReorderSheet } from './browse/reorder-sheet';
import { TopicDetailPanel } from './browse/topic-detail-panel';
import { TopicRow } from './browse/topic-row';
import { DeleteTopicDialog } from './shared/delete-topic-dialog';
import { useTopicsFlash } from './shared/topics-flash';

type ListNotice = { tone: 'success' | 'error'; text: string };

/**
 * `content.topics` (docs/spec/07-developer-content.md §1.1; layout: docs/design/glass-over-paper.md §7):
 * the shared topic bank as rows of one card. A TEACHER browses it read-only; for a DEVELOPER it is the
 * home tab and also the place to create topics (AI import or the manual form) and change their order —
 * both behind the buttons of the header. A phone opens a topic as a pushed screen; a tablet shows the
 * selected topic in the panel next to the list.
 */
export function ContentTopicsScreen() {
  const styles = useStyles();
  const theme = useTheme();
  const api = useApi();
  const { dict, m } = useI18n();
  const t = dict.topics.list;
  const user = useCurrentUser();
  const navigation = useAppNavigation();
  const stillHere = useStillHere();
  const isDeveloper = user.role === 'DEVELOPER';
  // A section of the role's tab navigator; anywhere else the list would be a pushed screen.
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
  // Tablet: the topic picked in the list; until one is picked (or once it is gone) the first topic is shown.
  const [pickedId, setPickedId] = useState<string | null>(null);

  const topics = useQuery({ queryKey: qk('content', 'listTopics'), queryFn: () => api.content.listTopics() });
  const list = topics.data;
  const failure = loadFailureOf(topics);
  // Realtime `topic-content-changed` comes first; a list that stayed mounted under another screen also asks
  // again when it is returned to (00 §2.3).
  useRefetchOnFocus([topics]);
  const { refreshing, refresh } = usePullRefresh([topics]);

  const selected = theme.tablet && list ? (list.find((topic) => topic.id === pickedId) ?? list[0]) : undefined;
  const open = (topic: TopicListItem) => {
    if (theme.tablet) setPickedId(topic.id);
    else navigation.push({ screen: 'content.topic', topicId: topic.id });
  };

  const actions = isDeveloper ? (
    <View style={styles.actions}>
      <Button label={m.content.list.createAction} leftIcon="plus" onPress={() => setCreateOpen(true)} style={styles.action} testID="topics-create" />
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
  ) : undefined;

  const rows = (list ?? []).map((topic, index, all) => (
    <TopicRow key={topic.id} topic={topic} onOpen={open} selected={topic.id === selected?.id} divider={index < all.length - 1} />
  ));

  return (
    <Screen
      testID="content-topics-screen"
      header={isTabRoot ? <ShellAppBar title={title} aside={actions} /> : <DetailAppBar title={title} aside={actions} />}
      // A tablet page does not scroll: each panel scrolls its own content down to the dock.
      scroll={!theme.tablet}
      maxWidth="full"
      onRefresh={refresh}
      refreshing={refreshing}
    >
      {list ? (
        <>
          {notice ? (
            <Notice tone={notice.tone} text={notice.text} onDismiss={() => setNotice(null)} dismissLabel={m.common.actions.close} testID="topics-notice" />
          ) : null}
          {/* Cached topics stay on screen when a refresh fails (offline): say so instead of replacing them. */}
          {topics.isError ? <Notice tone="error" text={errorText(topics.error, m.common.errors.generic)} testID="topics-refresh-error" /> : null}

          {list.length === 0 ? (
            <EmptyState title={t.empty} testID="topics-empty" />
          ) : theme.tablet ? (
            <Panels>
              <Panel weight={2} padded={false} contentStyle={styles.listPanel} testID="topics-list">
                {rows}
              </Panel>
              {selected ? (
                <TopicDetailPanel
                  // Another topic starts with its own sheet state.
                  key={selected.id}
                  topicId={selected.id}
                  title={selected.title}
                  isDeveloper={isDeveloper}
                  onDelete={setDeleting}
                />
              ) : null}
            </Panels>
          ) : (
            <ListCard testID="topics-list">{rows}</ListCard>
          )}
        </>
      ) : failure ? (
        <LoadFailure query={topics} testID="topics-error" />
      ) : (
        <LoadingState variant="list" count={6} accessibilityLabel={m.common.a11y.loading} testID="topics-loading" />
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
              // A topic created by import has no files: the developer attaches them on the edit screen. An
              // import that finished after the user went elsewhere does not pull them back: the list says it.
              if (stillHere()) navigation.open({ screen: 'content.topicEdit', topicId });
              else setNotice({ tone: 'success', text: t.notices.created });
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
  // Under the title on a phone the two actions share the row's width; on a tablet they keep their own.
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.sm },
  action: t.tablet ? {} : { flexGrow: 1 },
  // A panel of rows: they bring their own padding and hairlines, the panel adds only the card's edge.
  listPanel: { gap: 0, paddingTop: t.space.sm, paddingBottom: t.space.sm },
}));
