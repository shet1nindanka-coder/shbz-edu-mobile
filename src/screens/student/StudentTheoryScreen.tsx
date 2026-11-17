import { FlashList } from '@shopify/flash-list';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { RefreshControl, useWindowDimensions, View } from 'react-native';

import { qk, useApi } from '@/api';
import { useFileActions, type ViewerFile } from '@/components/files';
import { LoadFailure, isLoadFailed } from '@/components/load-failure';
import { useI18n } from '@/i18n';
import { useAppNavigation, useRefetchOnFocus } from '@/navigation';
import { ShellAppBar } from '@/screens/shell';
import { makeStyles, useTheme } from '@/theme';
import { EmptyState, LoadingState, MAX_FONT_SCALE, Notice, PageHeader, Screen } from '@/ui';

import { RefreshError } from './study/refresh-error';
import { TheoryCard, isPreviewableTheory, type TheoryTopic } from './study/theory-card';
import { theoryTitleBasis } from './study/theory-layout';
import { useRefresh } from './study/use-refresh';

function viewerFileOf(topic: TheoryTopic): ViewerFile {
  const { id, originalName, mimeType, size } = topic.theoryFile;
  return { id, originalName, mimeType, size };
}

/**
 * `student.theory` — «Теория» (docs/spec/02-student-study.md S2): one card per topic that has a theory
 * file. A PDF or an image opens in the full-screen viewer titled with the topic; a DOCX is downloaded and
 * handed to another app. Nothing is fetched from the file service until a button is pressed.
 */
export function StudentTheoryScreen() {
  const styles = useStyles();
  const theme = useTheme();
  const api = useApi();
  const { dict, m } = useI18n();
  const t = dict.student.theory;
  const navigation = useAppNavigation();
  const fileActions = useFileActions();

  const library = useQuery({
    queryKey: qk('studentStudy', 'getTheoryLibrary'),
    queryFn: () => api.studentStudy.getTheoryLibrary(),
  });
  const { refetch } = library;
  const { refreshing, refresh } = useRefresh(refetch);
  // 00 §2.3: realtime first, a refetch when the tab regains focus as the fallback.
  useRefetchOnFocus([library]);
  const topics = library.data?.topics;

  // One layout for the whole list: the title column must hold the longest word of any title that shares
  // its row with «Открыть» (a DOCX card is always a column).
  const fontScale = Math.min(useWindowDimensions().fontScale, MAX_FONT_SCALE);
  const titleFontSize = theme.typography.cardTitle.fontSize;
  const titleBasis = useMemo(
    () =>
      theoryTitleBasis(
        (topics ?? []).filter((topic) => isPreviewableTheory(topic.theoryFile.mimeType)).map((topic) => topic.title),
        titleFontSize,
        fontScale,
      ),
    [topics, titleFontSize, fontScale],
  );

  // The viewer is titled with the topic, not with the file name (02 S2a).
  const open = (topic: TheoryTopic) => navigation.openFiles([viewerFileOf(topic)], { title: topic.title });
  const download = (topic: TheoryTopic) => void fileActions.openExternally(viewerFileOf(topic));

  // The kicker («Теория») is the app bar title.
  const pageHeader = <PageHeader title={t.title} gap={theme.space.cardWide} />;

  return (
    <Screen
      testID="student-theory-screen"
      header={<ShellAppBar title={m.shell.tabs.theory} />}
      bottomInset={false}
      // The list scrolls itself; the loading and error shells use the screen's own scroll.
      scroll={!topics}
      padded={!topics}
      refreshing={refreshing}
      onRefresh={topics ? undefined : refresh}
    >
      {topics ? (
        <FlashList
          data={topics}
          keyExtractor={(topic) => topic.id}
          extraData={titleBasis}
          renderItem={({ item }) => (
            <View style={styles.item}>
              <TheoryCard
                topic={item}
                onOpen={open}
                onDownload={download}
                downloading={fileActions.pending?.fileId === item.theoryFile.id}
                titleBasis={titleBasis}
              />
            </View>
          )}
          ListHeaderComponent={
            <View>
              {pageHeader}
              {library.isError ? <RefreshError error={library.error} testID="theory-refresh-error" style={styles.notice} /> : null}
              {fileActions.error ? (
                <Notice
                  tone="error"
                  text={fileActions.error}
                  onDismiss={fileActions.dismissError}
                  dismissLabel={m.common.actions.close}
                  testID="theory-file-error"
                  style={styles.notice}
                />
              ) : null}
            </View>
          }
          ListEmptyComponent={<EmptyState title={t.emptyTitle} hint={t.emptyHint} testID="theory-empty" />}
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
          testID="theory-list"
        />
      ) : (
        <>
          {pageHeader}
          {isLoadFailed(library) ? (
            <LoadFailure query={library} home testID="theory-error" />
          ) : (
            <LoadingState variant="cards" count={5} cardHeight={78} accessibilityLabel={m.common.a11y.loading} testID="theory-loading" />
          )}
        </>
      )}
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  listContent: { paddingHorizontal: t.space.gutter, paddingTop: t.space.pageTop, paddingBottom: t.space.pageBottom },
  notice: { marginBottom: t.space.lg },
  item: { paddingBottom: t.space.md },
}));
