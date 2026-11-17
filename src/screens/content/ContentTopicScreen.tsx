import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';
import { RefreshControl, View } from 'react-native';

import { isNotFoundError, qk, useApi } from '@/api';
import type { StoredFileRef, TopicNumber } from '@/api/types';
import { FileCard, type ViewerFile } from '@/components/files';
import { format, useI18n } from '@/i18n';
import { useAppNavigation, type ScreenParams } from '@/navigation';
import { Hint, useCurrentUser } from '@/providers';
import { DetailAppBar, NotFoundScreen } from '@/screens/shell';
import { makeStyles, useTheme } from '@/theme';
import { EmptyState, IconButton, LoadingState, Notice, Screen, Segmented, Text } from '@/ui';

import { TopicNumberCard } from './browse/topic-number-card';
import { useListScrollMemory } from './browse/use-list-scroll-memory';
import { DeleteTopicDialog } from './shared/delete-topic-dialog';
import { errorText } from './shared/error-text';
import { LoadFailure, loadFailureOf } from './shared/load-failure';
import { postTopicsFlash } from './shared/topics-flash';

/** Route params of `content.topic` (docs/spec/00-unified-contract.md §3; `ScreenParams` in src/navigation/routes.ts). */
export type ContentTopicScreenProps = ScreenParams['content.topic'];

type TopicMode = 'view' | 'edit';

/**
 * `content.topic` (docs/spec/07-developer-content.md §1.2): the topic as a student gets it — theory and
 * homework files — and every number with its statement and answer. Read-only for both roles; a DEVELOPER
 * additionally gets the «Просмотр | Редактирование» switch and «Удалить тему».
 */
export function ContentTopicScreen({ topicId }: ContentTopicScreenProps) {
  const styles = useStyles();
  const theme = useTheme();
  const api = useApi();
  const { dict, m } = useI18n();
  const t = dict.topics.view;
  const user = useCurrentUser();
  const navigation = useAppNavigation();
  const isDeveloper = user.role === 'DEVELOPER';

  const [shownAnswers, setShownAnswers] = useState<ReadonlySet<string>>(() => new Set());
  const [deleteOpen, setDeleteOpen] = useState(false);
  // Deleted from this screen: it is on its way out, so the 404 of the last refetch is not news.
  const [deleted, setDeleted] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const detail = useQuery({ queryKey: qk('content', 'getTopic', topicId), queryFn: () => api.content.getTopic(topicId) });
  const data = detail.data;
  const failure = loadFailureOf(detail);

  // Web only (see the hook): the list keeps its place while the screen is covered by another one.
  const listRef = useRef<FlashListRef<TopicNumber>>(null);
  const scrollMemory = useListScrollMemory((offset) => listRef.current?.scrollToOffset({ offset, animated: false }));

  const toggleAnswer = useCallback((homeworkNumberId: string) => {
    setShownAnswers((current) => {
      const next = new Set(current);
      if (!next.delete(homeworkNumberId)) next.add(homeworkNumberId);
      return next;
    });
  }, []);

  const refresh = () => {
    setRefreshing(true);
    void detail.refetch().finally(() => setRefreshing(false));
  };

  // The topic was deleted (by this developer a moment ago, or by another one): nothing to show.
  if (!data && !deleted && isNotFoundError(detail.error)) return <NotFoundScreen />;

  const openFile = (title: string) => (file: ViewerFile) => navigation.openFiles([file], { title });
  const fileOf = (file: StoredFileRef | null): ViewerFile | null => file;

  const topic = data?.topic;
  const header = topic ? (
    <View style={styles.header}>
      {detail.isError && !deleted ? (
        <Notice tone="error" text={errorText(detail.error, m.common.errors.generic)} testID="topic-refresh-error" />
      ) : null}

      {isDeveloper ? (
        <Segmented<TopicMode>
          options={[
            { value: 'view', label: dict.topics.tabs.view },
            { value: 'edit', label: dict.topics.tabs.edit, accessibilityLabel: m.content.topic.openEdit },
          ]}
          value="view"
          onChange={(mode) => {
            if (mode === 'edit') navigation.open({ screen: 'content.topicEdit', topicId });
          }}
          accessibilityLabel={dict.topics.tabs.aria}
          role="tab"
          fill
          plain
          testID="topic-mode"
        />
      ) : null}

      <View style={styles.titleBlock}>
        <Text variant="pageTitle" accessibilityRole="header" testID="topic-title">
          {topic.title}
        </Text>
        {topic.description ? (
          <Text variant="small" color="textMuted">
            {topic.description}
          </Text>
        ) : null}
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHead}>
          <Text variant="sectionTitle" accessibilityRole="header">
            {t.materialsTitle}
          </Text>
          <Hint>
            <Text variant="hint">{t.materialsDescription}</Text>
          </Hint>
        </View>
        <FileCard title={t.theory} file={fileOf(topic.theoryFile)} onOpen={openFile(t.theory)} testID="topic-theory-file" />
        <FileCard title={t.homework} file={fileOf(topic.homeworkFile)} onOpen={openFile(t.homework)} testID="topic-homework-file" />
      </View>

      <View style={styles.sectionHead}>
        <View style={styles.numbersTitle}>
          <Text variant="sectionTitle" accessibilityRole="header" style={styles.grow}>
            {t.numbersTitle}
          </Text>
          {topic.homeworkNumbers.length > 0 ? (
            <Text variant="meta" tabular testID="topic-numbers-count">
              {format(m.content.topic.numbersCount, { count: topic.homeworkNumbers.length })}
            </Text>
          ) : null}
        </View>
        <Hint>
          <Text variant="hint">{t.numbersDescription}</Text>
        </Hint>
      </View>
    </View>
  ) : null;

  return (
    <Screen
      testID="content-topic-screen"
      header={
        <DetailAppBar
          // The bar carries the eyebrow («Тема»); the full title wraps below, where it is never cut.
          title={t.eyebrow}
          right={
            isDeveloper && topic ? (
              <IconButton
                icon="trash"
                accessibilityLabel={dict.topics.deleteTopic.label}
                onPress={() => setDeleteOpen(true)}
                testID="topic-delete"
              />
            ) : undefined
          }
        />
      }
      // The topic lives in the stack of a tab: the tab bar owns the bottom inset.
      bottomInset={false}
      scroll={!topic}
      padded={!topic}
    >
      {topic ? (
        <View style={styles.list} onLayout={scrollMemory.onLayout}>
          <FlashList<TopicNumber>
            ref={listRef}
            {...scrollMemory.listProps}
            data={topic.homeworkNumbers}
            keyExtractor={(number) => number.id}
            extraData={shownAnswers}
            renderItem={({ item }) => (
              <View style={styles.item}>
                <TopicNumberCard number={item} answerShown={shownAnswers.has(item.id)} onToggleAnswer={toggleAnswer} />
              </View>
            )}
            ListHeaderComponent={header}
            ListEmptyComponent={
              <EmptyState
                title={dict.topics.viewNumbers.emptyTitle}
                // The hint points at the «Редактирование» tab, which only a developer has.
                hint={isDeveloper ? dict.topics.viewNumbers.emptyHint : undefined}
                testID="topic-numbers-empty"
              />
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
            testID="topic-numbers-list"
          />
        </View>
      ) : failure ? (
        <LoadFailure error={failure.error} onRetry={() => void detail.refetch()} retrying={detail.isFetching && !detail.isPaused} testID="topic-error" />
      ) : (
        <LoadingState variant="cards" accessibilityLabel={m.common.a11y.loading} testID="topic-loading" />
      )}

      {isDeveloper ? (
        <DeleteTopicDialog
          topic={deleteOpen && topic ? { id: topic.id, title: topic.title } : null}
          onClose={() => setDeleteOpen(false)}
          onDeleted={() => {
            setDeleteOpen(false);
            setDeleted(true);
            // Back to the list, as the site's redirect does; the list shows «Тема успешно удалена».
            postTopicsFlash('deleted');
            navigation.open({ screen: 'content.topics' });
          }}
        />
      ) : null}
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  list: { flex: 1 },
  listContent: { paddingHorizontal: t.space.gutter, paddingTop: t.space.lg, paddingBottom: t.space.pageBottom },
  header: { gap: t.space.lg, paddingBottom: t.space.md },
  titleBlock: { gap: t.space.xs },
  section: { gap: t.space.md },
  sectionHead: { gap: t.space.xxs },
  numbersTitle: { flexDirection: 'row', alignItems: 'baseline', gap: t.space.md },
  grow: { flex: 1 },
  item: { paddingBottom: t.space.md },
}));
