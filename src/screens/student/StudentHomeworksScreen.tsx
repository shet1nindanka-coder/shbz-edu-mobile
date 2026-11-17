import { FlashList } from '@shopify/flash-list';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { RefreshControl, View } from 'react-native';

import { errorText, qk, useApi } from '@/api';
import type { HomeworkSummaryDto } from '@/api/types';
import { LoadFailure, isLoadFailed } from '@/components/load-failure';
import { serverClockOffset } from '@/domain/server-clock';
import { format, useI18n } from '@/i18n';
import { useAppNavigation } from '@/navigation';
import { ShellAppBar, screenTitle } from '@/screens/shell';
import { useServerNow } from '@/services/clock';
import { usePullRefresh } from '@/services/query';
import { makeStyles, useTheme } from '@/theme';
import { EmptyState, Icon, LoadingState, Notice, PageHeader, PressableScale, Screen, Text } from '@/ui';

import { HomeworkCard } from './work/homework-card';
import { buildHomeworkRows, type HomeworkListRow } from './work/logic';
import { useOnReturn, useScreenLive } from './work/use-screen-live';

/**
 * `student.homeworks` (docs/spec/03-student-homework-lesson.md §1 H1): every homework issued to the
 * student in the server's "needs attention" order — active cards first, completed ones folded under
 * «Выполненные ДЗ (N)». Number search lives in the app bar (shell action).
 */
export function StudentHomeworksScreen() {
  const styles = useStyles();
  const theme = useTheme();
  const api = useApi();
  const { dict, m } = useI18n();
  const t = dict.student.homeworks;
  const navigation = useAppNavigation();
  const live = useScreenLive();

  const [archiveOpen, setArchiveOpen] = useState(false);

  const homeworks = useQuery({
    queryKey: qk('studentWork', 'listHomeworks'),
    queryFn: ({ signal }) => api.studentWork.listHomeworks({ signal }),
  });
  const data = homeworks.data;
  const { isStale, refetch } = homeworks;

  // Statuses change outside this screen (a check on the detail screen, a lesson, the teacher): the list
  // is re-read when the student comes back to it (00 §2.3 "refetch on focus").
  useOnReturn(live, () => {
    if (isStale) void refetch();
  });

  const nowMs = useServerNow(data ? serverClockOffset(data.serverNow, homeworks.dataUpdatedAt) : 0);
  const rows = useMemo(() => (data ? buildHomeworkRows(data.assignments, archiveOpen) : []), [data, archiveOpen]);

  const { refreshing, refresh } = usePullRefresh([homeworks]);
  const open = (homework: HomeworkSummaryDto) => navigation.push({ screen: 'student.homework', assignmentId: homework.id });

  const header = (
    <View style={styles.header}>
      <PageHeader kicker={t.kicker} title={t.title} gap={0} />
      {/* Cached homework stays on screen when a refresh fails (offline): say so instead of replacing it. */}
      {homeworks.isError && data ? (
        <Notice
          tone="error"
          text={errorText(homeworks.error, m.studentWork.list.refreshFailed)}
          testID="homeworks-refresh-error"
        />
      ) : null}
    </View>
  );

  const renderRow = ({ item }: { item: HomeworkListRow }) => {
    switch (item.kind) {
      case 'homework':
        return (
          <View style={styles.row}>
            <HomeworkCard homework={item.homework} nowMs={nowMs} onOpen={open} />
          </View>
        );
      case 'allDone':
        return (
          <View style={styles.row}>
            <Notice tone="success" text={dict.student.submissions.allDone} testID="homeworks-all-done" />
          </View>
        );
      case 'archiveToggle':
        return (
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={format(
              item.open ? m.studentWork.list.archiveHideA11y : m.studentWork.list.archiveShowA11y,
              { count: item.count },
            )}
            accessibilityState={{ expanded: item.open }}
            onPress={() => setArchiveOpen((value) => !value)}
            scaleTo={1}
            pressedStyle={{ backgroundColor: theme.colors.tabHover }}
            style={styles.archive}
            testID="homeworks-archive-toggle"
          >
            <Text variant="smallStrong" style={styles.archiveLabel}>
              {format(dict.student.submissions.archived, { count: item.count })}
            </Text>
            <Icon name={item.open ? 'chevronUp' : 'chevronDown'} size={18} color="kicker" />
          </PressableScale>
        );
    }
  };

  const showList = Boolean(data && data.available && data.assignments.length > 0);

  return (
    <Screen
      testID="student-homeworks-screen"
      header={<ShellAppBar title={screenTitle('student.homeworks', m.shell.tabs)} />}
      bottomInset={false}
      scroll={!showList}
      padded={!showList}
      onRefresh={showList ? undefined : refresh}
      refreshing={refreshing}
    >
      {showList ? (
        <FlashList
          data={rows}
          keyExtractor={(row) => row.key}
          getItemType={(row) => row.kind}
          renderItem={renderRow}
          // The overdue badges follow the clock, not the data.
          extraData={nowMs}
          ListHeaderComponent={header}
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
          testID="homeworks-list"
        />
      ) : data ? (
        <View>
          {header}
          {data.available ? (
            <EmptyState title={t.emptyTitle} hint={t.emptyHint} testID="homeworks-empty" />
          ) : (
            // The homework tables are missing on the server: the section is unavailable, not broken.
            <Notice tone="warning" text={t.migrationNotice} testID="homeworks-unavailable" />
          )}
        </View>
      ) : isLoadFailed(homeworks) ? (
        <LoadFailure query={homeworks} testID="homeworks-error" />
      ) : (
        <LoadingState variant="cards" accessibilityLabel={m.common.a11y.loading} testID="homeworks-loading" />
      )}
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  // The same top padding as the padded `Screen` of the empty / unavailable states: the header does not jump.
  listContent: { paddingHorizontal: t.space.gutter, paddingTop: t.space.pageTop, paddingBottom: t.space.pageBottom },
  header: { gap: t.space.field, paddingBottom: t.space.field },
  row: { paddingBottom: t.space.lg },
  archive: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space.sm,
    minHeight: t.sizes.minTouch,
    marginBottom: t.space.lg,
    paddingHorizontal: t.space.md,
    borderRadius: t.radii.md,
    borderWidth: t.borders.hairline,
    borderColor: t.colors.softBorder,
    backgroundColor: t.colors.softBg,
  },
  archiveLabel: { flex: 1, minWidth: 0 },
}));
