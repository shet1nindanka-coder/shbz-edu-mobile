import { FlashList } from '@shopify/flash-list';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { RefreshControl, View } from 'react-native';

import { qk, useApi } from '@/api';
import type { HomeworkPlanListItem } from '@/api/types';
import { useI18n } from '@/i18n';
import { useAppNavigation } from '@/navigation';
import { PlannerSegments, ShellAppBar, screenTitle } from '@/screens/shell';
import { makeStyles, useTheme } from '@/theme';
import { EmptyState, ErrorState, LoadingState, Notice, Screen } from '@/ui';

import { DraftCard } from './drafts/draft-card';
import { sortDrafts } from './drafts/drafts-logic';
import { errorText } from './shared/error-text';
import { isWaitingForNetwork } from './shared/query-state';

/**
 * `planner.drafts` (docs/spec/05-teacher-lessons-plans.md §1.5): the second segment of the teacher's
 * «занятия» tab — every AI homework draft, newest first. There is deliberately no "create" entry here:
 * a draft is started from a lesson board, a group or a student (90-addendum-2 N1).
 */
export function PlannerDraftsScreen() {
  const styles = useStyles();
  const theme = useTheme();
  const api = useApi();
  const navigation = useAppNavigation();
  const { dict, m } = useI18n();
  const t = dict.planner.homeworkPlans.list;

  const [refreshing, setRefreshing] = useState(false);

  // The "assigned" counters move while a board is open elsewhere, so the list is re-read on every visit.
  const drafts = useQuery({ queryKey: qk('planner', 'listHomeworkPlans'), queryFn: () => api.planner.listHomeworkPlans(), refetchOnMount: 'always' });
  const data = drafts.data;
  const plans = useMemo(() => (data ? sortDrafts(data) : []), [data]);

  const refresh = () => {
    setRefreshing(true);
    void drafts.refetch().finally(() => setRefreshing(false));
  };

  const open = (plan: HomeworkPlanListItem) => navigation.open({ screen: 'planner.draftBoard', planId: plan.id });

  const header = (
    <View style={styles.header}>
      <PlannerSegments active="drafts" />
      {/* Cached drafts stay on screen when a refresh fails (offline): say so instead of replacing them. */}
      {drafts.isError && data ? <Notice tone="error" text={errorText(drafts.error, m.common.errors.generic)} testID="drafts-refresh-error" /> : null}
    </View>
  );

  return (
    <Screen
      testID="planner-drafts-screen"
      header={<ShellAppBar title={screenTitle('planner.drafts', m.shell.tabs)} />}
      bottomInset={false}
      scroll={!data}
      padded={!data}
      onRefresh={data ? undefined : refresh}
      refreshing={refreshing}
    >
      {data ? (
        <FlashList
          data={plans}
          keyExtractor={(plan) => plan.id}
          renderItem={({ item }) => (
            <View style={styles.item}>
              <DraftCard plan={item} onOpen={open} />
            </View>
          )}
          ListHeaderComponent={header}
          ListEmptyComponent={
            <View style={styles.empty}>
              <EmptyState title={t.emptyTitle} hint={t.emptyHint} testID="drafts-empty" />
            </View>
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
          testID="drafts-list"
        />
      ) : drafts.isError || isWaitingForNetwork(drafts) ? (
        <View style={styles.state}>
          <PlannerSegments active="drafts" />
          <ErrorState
            title={dict.shells.errorTitle}
            description={drafts.isError ? errorText(drafts.error, dict.shells.errorDescription) : m.common.errors.network}
            retryLabel={dict.common.retry}
            onRetry={() => void drafts.refetch()}
            retrying={drafts.isFetching}
            testID="drafts-error"
          />
        </View>
      ) : (
        <View style={styles.state}>
          <PlannerSegments active="drafts" />
          <LoadingState variant="cards" count={4} cardHeight={112} accessibilityLabel={m.common.a11y.loading} testID="drafts-loading" />
        </View>
      )}
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  listContent: { paddingTop: t.space.lg, paddingBottom: t.space.pageBottom },
  header: { gap: t.space.lg, paddingBottom: t.space.lg, paddingHorizontal: t.space.gutter },
  item: { paddingBottom: t.space.md, paddingHorizontal: t.space.gutter },
  empty: { paddingHorizontal: t.space.gutter },
  state: { gap: t.space.lg },
}));
