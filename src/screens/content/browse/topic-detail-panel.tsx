import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';

import { errorText, isNotFoundError, qk, useApi } from '@/api';
import type { TopicNumber } from '@/api/types';
import type { ViewerFile } from '@/components/files';
import { LoadFailure, loadFailureOf } from '@/components/load-failure';
import { useI18n } from '@/i18n';
import { useAppNavigation, useRefetchOnFocus } from '@/navigation';
import { makeStyles } from '@/theme';
import { Divider, IconButton, LoadingState, Notice, Panel, Text } from '@/ui';

import { TopicActionsSheet } from './topic-actions-sheet';
import { TopicFiles } from './topic-files';
import { TopicNumbers } from './topic-numbers';

export type TopicDetailPanelProps = {
  topicId: string;
  /** Title from the list, shown while the topic itself is loading. */
  title: string;
  isDeveloper: boolean;
  /** DEVELOPER: «Удалить тему» was chosen — the list owns the confirmation. */
  onDelete: (topic: { id: string; title: string }) => void;
};

/**
 * Tablet only: the topic selected in the list, in the panel next to it (docs/design/glass-over-paper.md
 * §1 rule 7) — the same content as `content.topic`, read with the same request. A phone opens the pushed
 * screen instead.
 */
export function TopicDetailPanel({ topicId, title, isDeveloper, onDelete }: TopicDetailPanelProps) {
  const styles = useStyles();
  const api = useApi();
  const { m } = useI18n();
  const navigation = useAppNavigation();
  const [actionsOpen, setActionsOpen] = useState(false);

  const detail = useQuery({ queryKey: qk('content', 'getTopic', topicId), queryFn: () => api.content.getTopic(topicId) });
  // Realtime first; a stale topic is asked again when the list is returned to (00 §2.3).
  useRefetchOnFocus([detail]);
  const failure = loadFailureOf(detail);
  // Deleted elsewhere: nothing of it stays on screen (90-addendum-1 A.3 rule 6); the list drops the row
  // with its own refetch.
  const topic = isNotFoundError(detail.error) ? undefined : detail.data?.topic;
  const shownTitle = topic?.title ?? title;

  const openFile = (file: ViewerFile, slot: string) => navigation.openFiles([file], { title: slot });
  const openNumber = (entry: TopicNumber) => navigation.push({ screen: 'content.number', topicId, number: entry.number });

  return (
    <>
      <Panel
        tabletOnly
        weight={3}
        testID="topic-panel"
        header={
          <View style={styles.header}>
            <View style={styles.titles}>
              <Text variant="sectionTitle" accessibilityRole="header" numberOfLines={2} testID="topic-title">
                {shownTitle}
              </Text>
              {topic?.description ? (
                <Text variant="small" color="textMuted">
                  {topic.description}
                </Text>
              ) : null}
            </View>
            {isDeveloper && topic ? (
              <IconButton icon="more" accessibilityLabel={m.content.topic.actions} onPress={() => setActionsOpen(true)} testID="topic-actions" />
            ) : null}
          </View>
        }
      >
        {topic ? (
          <>
            {detail.isError ? <Notice tone="error" text={errorText(detail.error, m.common.errors.generic)} testID="topic-refresh-error" /> : null}
            <TopicFiles theoryFile={topic.theoryFile} homeworkFile={topic.homeworkFile} onOpen={openFile} />
            <Divider color="rowBorder" />
            <TopicNumbers numbers={topic.homeworkNumbers} isDeveloper={isDeveloper} onOpenNumber={openNumber} />
          </>
        ) : failure ? (
          <LoadFailure query={detail} testID="topic-error" />
        ) : (
          <LoadingState variant="list" accessibilityLabel={m.common.a11y.loading} testID="topic-loading" />
        )}
      </Panel>

      {isDeveloper ? (
        <TopicActionsSheet
          visible={actionsOpen}
          title={shownTitle}
          onClose={() => setActionsOpen(false)}
          onEdit={() => navigation.open({ screen: 'content.topicEdit', topicId })}
          onDelete={() => onDelete({ id: topicId, title: shownTitle })}
        />
      ) : null}
    </>
  );
}

const useStyles = makeStyles((t) => ({
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: t.space.md },
  titles: { flex: 1, minWidth: 0, gap: t.space.xxs },
}));
