import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { qk, useApi } from '@/api';
import { FileCard, useFileActions, type ViewerFile } from '@/components/files';
import { LoadFailure, isLoadFailed } from '@/components/load-failure';
import { useI18n } from '@/i18n';
import { useAppNavigation, useRefetchOnFocus } from '@/navigation';
import { ShellAppBar } from '@/screens/shell';
import { usePullRefresh } from '@/services/query';
import { makeStyles, useTheme } from '@/theme';
import { EmptyState, Icon, ListCard, LoadingState, Notice, Panel, Panels, Screen, Text, TextField } from '@/ui';

import { RefreshError } from './study/refresh-error';
import { TheoryCard, type TheoryTopic } from './study/theory-card';

function viewerFileOf(topic: TheoryTopic): ViewerFile {
  const { id, originalName, mimeType, size } = topic.theoryFile;
  return { id, originalName, mimeType, size };
}

/** The filter field appears once the list no longer fits a glance. */
const FILTER_FROM = 6;

/**
 * `student.theory` — «Теория» (docs/spec/02-student-study.md S2; layout: docs/design/glass-over-paper.md
 * §8): the topics that have a theory file as rows of one card, and a field that narrows the list by title.
 * A PDF or an image opens in the full-screen viewer titled with the topic; a DOCX is downloaded and handed
 * to another app. Nothing is fetched from the file service until a row is pressed.
 *
 * A tablet shows the list in the left panel and the selected topic — its description and its file — in the
 * right one.
 */
export function StudentTheoryScreen() {
  const styles = useStyles();
  const theme = useTheme();
  const api = useApi();
  const { dict, m } = useI18n();
  const t = dict.student.theory;
  // Tablet: the topic shown in the right panel; null = the first of the list.
  const [pickedId, setPickedId] = useState<string | null>(null);
  const navigation = useAppNavigation();
  const fileActions = useFileActions();
  const [filter, setFilter] = useState('');

  const library = useQuery({
    queryKey: qk('studentStudy', 'getTheoryLibrary'),
    queryFn: () => api.studentStudy.getTheoryLibrary(),
  });
  const { refreshing, refresh } = usePullRefresh([library]);
  useRefetchOnFocus([library]);
  const topics = library.data?.topics;

  const shown = useMemo(() => {
    const needle = filter.trim().toLocaleLowerCase();
    return needle ? (topics ?? []).filter((topic) => topic.title.toLocaleLowerCase().includes(needle)) : (topics ?? []);
  }, [topics, filter]);

  const open = (topic: TheoryTopic) => navigation.openFiles([viewerFileOf(topic)], { title: topic.title });
  const download = (topic: TheoryTopic) => void fileActions.openExternally(viewerFileOf(topic));

  const filterField = (
    <TextField
      value={filter}
      onChangeText={setFilter}
      placeholder={m.student.theory.filter}
      accessibilityLabel={m.student.theory.filter}
      left={<Icon name="search" size={20} color="textMuted" />}
      autoCorrect={false}
      returnKeyType="search"
      testID="theory-filter"
    />
  );

  if (theme.tablet && topics && topics.length > 0) {
    const selected = shown.find((topic) => topic.id === pickedId) ?? shown[0] ?? null;
    return (
      <Screen testID="student-theory-screen" header={<ShellAppBar title={m.shell.tabs.theory} />} scroll={false} maxWidth="full">
        {library.isError ? <RefreshError error={library.error} testID="theory-refresh-error" /> : null}
        {fileActions.error ? (
          <Notice tone="error" text={fileActions.error} onDismiss={fileActions.dismissError} dismissLabel={m.common.actions.close} testID="theory-file-error" />
        ) : null}
        <Panels>
          <Panel
            weight={2}
            padded={false}
            header={topics.length >= FILTER_FROM ? <View style={styles.filter}>{filterField}</View> : undefined}
            contentStyle={styles.listPanel}
            testID="theory-list"
          >
            {shown.length === 0 ? (
              <EmptyState variant="plain" title={m.student.theory.filterEmpty} testID="theory-filter-empty" />
            ) : (
              shown.map((topic, index) => (
                <TheoryCard
                  key={topic.id}
                  topic={topic}
                  onOpen={(picked) => setPickedId(picked.id)}
                  onDownload={(picked) => setPickedId(picked.id)}
                  downloading={false}
                  selected={topic.id === selected?.id}
                  divider={index < shown.length - 1}
                />
              ))
            )}
          </Panel>
          <Panel weight={3} testID="theory-detail">
            {selected ? (
              <>
                <Text variant="sectionTitle" accessibilityRole="header">
                  {selected.title}
                </Text>
                {selected.description ? (
                  <Text variant="body" color="textMuted">
                    {selected.description}
                  </Text>
                ) : null}
                <FileCard title={dict.topics.view.theory} file={viewerFileOf(selected)} onOpen={() => open(selected)} testID="theory-file" />
              </>
            ) : null}
          </Panel>
        </Panels>
      </Screen>
    );
  }

  return (
    <Screen testID="student-theory-screen" header={<ShellAppBar title={m.shell.tabs.theory} />} refreshing={refreshing} onRefresh={refresh}>
      {topics ? (
        <>
          {library.isError ? <RefreshError error={library.error} testID="theory-refresh-error" /> : null}
          {fileActions.error ? (
            <Notice
              tone="error"
              text={fileActions.error}
              onDismiss={fileActions.dismissError}
              dismissLabel={m.common.actions.close}
              testID="theory-file-error"
            />
          ) : null}
          {topics.length === 0 ? (
            <EmptyState title={t.emptyTitle} hint={t.emptyHint} testID="theory-empty" />
          ) : (
            <>
              {topics.length >= FILTER_FROM ? filterField : null}
              {shown.length === 0 ? (
                <EmptyState variant="plain" title={m.student.theory.filterEmpty} testID="theory-filter-empty" />
              ) : (
                <ListCard testID="theory-list">
                  {shown.map((topic, index) => (
                    <TheoryCard
                      key={topic.id}
                      topic={topic}
                      onOpen={open}
                      onDownload={download}
                      downloading={fileActions.pending?.fileId === topic.theoryFile.id}
                      divider={index < shown.length - 1}
                    />
                  ))}
                </ListCard>
              )}
            </>
          )}
        </>
      ) : isLoadFailed(library) ? (
        <LoadFailure query={library} home testID="theory-error" />
      ) : (
        <LoadingState variant="list" count={5} accessibilityLabel={m.common.a11y.loading} testID="theory-loading" />
      )}
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  filter: { paddingHorizontal: t.space.card, paddingTop: t.space.card },
  listPanel: { gap: 0, paddingVertical: t.space.sm },
}));
