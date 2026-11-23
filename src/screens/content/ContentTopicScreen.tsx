import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { errorText, isNotFoundError, qk, useApi } from '@/api';
import type { TopicNumber } from '@/api/types';
import type { ViewerFile } from '@/components/files';
import { LoadFailure, loadFailureOf } from '@/components/load-failure';
import { useI18n } from '@/i18n';
import { useAppNavigation, useRefetchOnFocus, useStillHere, type ScreenParams } from '@/navigation';
import { useCurrentUser } from '@/providers';
import { DetailAppBar, NotFoundScreen } from '@/screens/shell';
import { usePullRefresh } from '@/services/query';
import { useTheme } from '@/theme';
import { IconButton, LoadingState, Notice, Panel, Panels, Screen, Text } from '@/ui';

import { TopicActionsSheet } from './browse/topic-actions-sheet';
import { TopicFiles } from './browse/topic-files';
import { TopicNumbers } from './browse/topic-numbers';
import { DeleteTopicDialog } from './shared/delete-topic-dialog';
import { isTopicLeaving, postTopicDeleted } from './shared/topics-flash';

/** Route params of `content.topic` (docs/spec/00-unified-contract.md §3; `ScreenParams` in src/navigation/routes.ts). */
export type ContentTopicScreenProps = ScreenParams['content.topic'];

/**
 * `content.topic` (docs/spec/07-developer-content.md §1.2; layout: docs/design/glass-over-paper.md §7): the
 * topic as a student gets it — the theory and tasks files — and its numbers as a grid of tiles; a tile
 * opens the number with its statement and answer. Read-only for both roles; a DEVELOPER additionally gets
 * the «⋯» with the way to the editor and «Удалить тему».
 */
export function ContentTopicScreen({ topicId }: ContentTopicScreenProps) {
  const theme = useTheme();
  const api = useApi();
  const { dict, m } = useI18n();
  const user = useCurrentUser();
  const navigation = useAppNavigation();
  const stillHere = useStillHere();
  const isDeveloper = user.role === 'DEVELOPER';

  const [actionsOpen, setActionsOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  // Deleted from this screen: it is on its way out, so the 404 of the last refetch is not news.
  const [deleted, setDeleted] = useState(false);

  const detail = useQuery({ queryKey: qk('content', 'getTopic', topicId), queryFn: () => api.content.getTopic(topicId) });
  const data = detail.data;
  const failure = loadFailureOf(detail);
  // The screen stays mounted under the editor and the number screen: realtime first, and a stale topic is
  // asked again when the screen is returned to (00 §2.3).
  useRefetchOnFocus([detail]);
  const { refreshing, refresh } = usePullRefresh([detail]);

  // The topic is gone (deleted by another developer, or from the editor above this screen): a 404 is the
  // not-found state whether or not a copy is cached (90-addendum-1 A.3 rule 6) — files, numbers and answers
  // of a deleted topic must not stay on screen. Deleted from this very screen or from its editor a moment
  // ago, it is already on its way out.
  if (!deleted && !isTopicLeaving(topicId) && isNotFoundError(detail.error)) return <NotFoundScreen />;

  const openFile = (file: ViewerFile, title: string) => navigation.openFiles([file], { title });
  const openNumber = (entry: TopicNumber) => navigation.push({ screen: 'content.number', topicId, number: entry.number });

  const topic = data?.topic;

  return (
    <Screen
      testID="content-topic-screen"
      header={
        <DetailAppBar
          // The eyebrow («Тема») stands in until the topic is read.
          title={topic?.title ?? dict.topics.view.eyebrow}
          backTitle={m.shell.tabs.topics}
          right={
            isDeveloper && topic ? (
              <IconButton icon="more" accessibilityLabel={m.content.topic.actions} onPress={() => setActionsOpen(true)} testID="topic-actions" />
            ) : undefined
          }
        />
      }
      // A tablet page does not scroll: each panel scrolls its own content down to the dock.
      scroll={!theme.tablet}
      maxWidth="full"
      onRefresh={refresh}
      refreshing={refreshing}
    >
      {topic ? (
        <>
          {detail.isError && !deleted && !isTopicLeaving(topicId) ? (
            <Notice tone="error" text={errorText(detail.error, m.common.errors.generic)} testID="topic-refresh-error" />
          ) : null}
          <Panels>
            <Panel weight={2} testID="topic-materials">
              {topic.description ? (
                <Text variant="body" color="label" testID="topic-description">
                  {topic.description}
                </Text>
              ) : null}
              <TopicFiles theoryFile={topic.theoryFile} homeworkFile={topic.homeworkFile} onOpen={openFile} />
            </Panel>
            <Panel weight={3} testID="topic-numbers">
              <TopicNumbers numbers={topic.homeworkNumbers} isDeveloper={isDeveloper} onOpenNumber={openNumber} />
            </Panel>
          </Panels>
        </>
      ) : failure ? (
        <LoadFailure query={detail} testID="topic-error" />
      ) : (
        <LoadingState variant="cards" count={2} accessibilityLabel={m.common.a11y.loading} testID="topic-loading" />
      )}

      {isDeveloper ? (
        <>
          <TopicActionsSheet
            visible={actionsOpen}
            title={topic?.title ?? dict.topics.view.eyebrow}
            onClose={() => setActionsOpen(false)}
            onEdit={() => navigation.open({ screen: 'content.topicEdit', topicId })}
            onDelete={() => setDeleteOpen(true)}
          />
          <DeleteTopicDialog
            topic={deleteOpen && topic ? { id: topic.id, title: topic.title } : null}
            onClose={() => setDeleteOpen(false)}
            onDeleted={() => {
              setDeleteOpen(false);
              setDeleted(true);
              // Back to the list, as the site's redirect does; the list shows «Тема успешно удалена».
              postTopicDeleted(topicId);
              // Answered after the user went elsewhere: the screen shows the gone state on return instead.
              if (stillHere()) navigation.open({ screen: 'content.topics' });
            }}
          />
        </>
      ) : null}
    </Screen>
  );
}
