import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { errorText, qk, useApi } from '@/api';
import type { HomeworkPlanListItem } from '@/api/types';
import { LoadFailure, isWaitingForNetwork } from '@/components/load-failure';
import { useI18n } from '@/i18n';
import { useAppNavigation, useRefetchOnFocus } from '@/navigation';
import { PlannerSegments, ShellAppBar, screenTitle } from '@/screens/shell';
import { usePullRefresh } from '@/services/query';
import { makeStyles, useTheme } from '@/theme';
import { Button, EmptyState, ListCard, LoadingState, Notice, Panel, Panels, Screen } from '@/ui';

import { DraftRow } from './drafts/draft-row';
import { DraftSummary } from './drafts/draft-summary';
import { sortDrafts } from './drafts/drafts-logic';

/**
 * `planner.drafts` (docs/spec/05-teacher-lessons-plans.md §1.5): the second segment of the teacher's
 * «занятия» section — every AI homework draft as a row, newest first. There is deliberately no "create"
 * entry here: a draft is started from a lesson board, a group or a student (90-addendum-2 N1). A phone
 * opens the draft's board on a tap; a tablet shows the tapped draft in the panel next to the list.
 */
export function PlannerDraftsScreen() {
  const styles = useStyles();
  const theme = useTheme();
  const api = useApi();
  const navigation = useAppNavigation();
  const { dict, m } = useI18n();
  const t = dict.planner.homeworkPlans.list;

  const [selectedId, setSelectedId] = useState<string | null>(null);

  // The "assigned" counters move while a board is open elsewhere, so the list is re-read on every visit.
  const drafts = useQuery({ queryKey: qk('planner', 'listHomeworkPlans'), queryFn: () => api.planner.listHomeworkPlans(), refetchOnMount: 'always' });
  // A tab root stays mounted: `refetchOnMount` covers the first visit only, so a list that went stale
  // while another tab or a board was open is re-read on the way back (00 §2.3 "refetch on focus").
  useRefetchOnFocus([drafts]);
  const data = drafts.data;
  const plans = useMemo(() => (data ? sortDrafts(data) : []), [data]);

  const { refreshing, refresh } = usePullRefresh([drafts]);

  const open = (plan: HomeworkPlanListItem) => navigation.open({ screen: 'planner.draftBoard', planId: plan.id });
  // The tablet panel shows the tapped draft, or the newest one.
  const selected = theme.tablet ? (plans.find((plan) => plan.id === selectedId) ?? plans[0] ?? null) : null;
  const pressRow = theme.tablet ? (plan: HomeworkPlanListItem) => setSelectedId(plan.id) : open;

  const rows = plans.map((plan, index) => (
    <DraftRow key={plan.id} plan={plan} selected={selected?.id === plan.id} divider={index < plans.length - 1} onPress={pressRow} />
  ));

  return (
    <Screen
      testID="planner-drafts-screen"
      header={<ShellAppBar title={screenTitle('planner.drafts', m.shell.tabs)} aside={<PlannerSegments active="drafts" />} />}
      bottomInset={false}
      scroll={!theme.tablet}
      maxWidth="full"
      onRefresh={refresh}
      refreshing={refreshing}
    >
      {/* Cached drafts stay on screen when a refresh fails (offline): say so instead of replacing them. */}
      {drafts.isError && data ? <Notice tone="error" text={errorText(drafts.error, m.common.errors.generic)} testID="drafts-refresh-error" /> : null}

      {!data ? (
        drafts.isError || isWaitingForNetwork(drafts) ? (
          <LoadFailure query={drafts} testID="drafts-error" />
        ) : (
          <LoadingState variant="list" count={5} accessibilityLabel={m.common.a11y.loading} testID="drafts-loading" />
        )
      ) : plans.length === 0 ? (
        <EmptyState title={t.emptyTitle} hint={t.emptyHint} testID="drafts-empty" />
      ) : theme.tablet ? (
        <Panels testID="drafts-list">
          <Panel weight={3} padded={false} contentStyle={styles.listPanel}>
            {rows}
          </Panel>
          <Panel
            weight={2}
            footer={selected ? <Button label={dict.planner.common.open} rightIcon="forward" fullWidth onPress={() => open(selected)} testID="draft-summary-open" /> : undefined}
          >
            {selected ? <DraftSummary plan={selected} /> : null}
          </Panel>
        </Panels>
      ) : (
        <ListCard testID="drafts-list">{rows}</ListCard>
      )}
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  listPanel: { gap: 0, paddingVertical: t.space.sm },
}));
