import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { qk, useApi } from '@/api';
import { useFileActions, type ViewerFile } from '@/components/files';
import { LoadFailure, isLoadFailed } from '@/components/load-failure';
import { useI18n } from '@/i18n';
import { useAppNavigation, useRefetchOnFocus } from '@/navigation';
import { ShellAppBar } from '@/screens/shell';
import { usePullRefresh } from '@/services/query';
import { EmptyState, Icon, ListCard, LoadingState, Notice, Screen, TextField } from '@/ui';

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
 */
export function StudentTheoryScreen() {
  const api = useApi();
  const { dict, m } = useI18n();
  const t = dict.student.theory;
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
              {topics.length >= FILTER_FROM ? (
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
              ) : null}
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
