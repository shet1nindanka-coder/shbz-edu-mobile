import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { errorText, isNotFoundError, qk, useApi } from '@/api';
import { LoadFailure, isWaitingForNetwork } from '@/components/load-failure';
import { useI18n } from '@/i18n';
import type { ScreenParams } from '@/navigation';
import { DetailAppBar, NotFoundScreen } from '@/screens/shell';
import { EmptyState, LoadingState, Notice, Screen } from '@/ui';

import { DraftForm } from './drafts/draft-form';
import { draftSourceKey, draftSourceOf, type DraftSource } from './drafts/drafts-logic';

/** Route params of `planner.draftNew` (docs/spec/00-unified-contract.md §3; `ScreenParams` in src/navigation/routes.ts). */
export type PlannerDraftNewScreenProps = ScreenParams['planner.draftNew'];

/**
 * `planner.draftNew` (docs/spec/05-teacher-lessons-plans.md §1.6): a new AI homework draft for the
 * participants of a lesson (`lessonId`, optionally narrowed to one `studentId`), for a group or for one
 * student. Without any of the three the site answers 404 — so does the app.
 */
export function PlannerDraftNewScreen({ lessonId, groupId, studentId }: PlannerDraftNewScreenProps) {
  const source = draftSourceOf({ lessonId, groupId, studentId });
  if (!source) return <NotFoundScreen />;
  // A different source is a different form: its fields must not survive the change.
  return <DraftNew key={draftSourceKey(source)} source={source} />;
}

function DraftNew({ source }: { source: DraftSource }) {
  const api = useApi();
  const { dict, m } = useI18n();
  const t = dict.planner.homeworkPlans.new;

  const form = useQuery({
    queryKey: qk('planner', 'getHomeworkPlanNewForm', source),
    queryFn: () => api.planner.getHomeworkPlanNewForm(source),
    // The members and the default topic must be current when a draft is created.
    refetchOnMount: 'always',
  });
  const data = form.data;

  // Whom or what the homework is for — a group, a student, «По итогам занятия «…»» — is the line under the
  // title; the form adds its main button to the header on a tablet.
  const header = (aside?: ReactNode) => (
    <DetailAppBar title={t.title} subtitle={data?.kicker} backTitle={m.shell.tabs.lessons} aside={aside} testID="draft-new-app-bar" />
  );

  if (!data) {
    // `404 lessonNotFound` / `groupNotFound` / `studentNotFound`: the source is gone or belongs to someone else.
    if (form.isError && isNotFoundError(form.error)) return <NotFoundScreen description={errorText(form.error, dict.shells.notFoundDescription)} />;
    return (
      <Screen testID="planner-draft-new-screen" header={header()}>
        {form.isError || isWaitingForNetwork(form) ? (
          <LoadFailure query={form} testID="draft-new-error-state" />
        ) : (
          <LoadingState variant="cards" count={2} accessibilityLabel={m.common.a11y.loading} testID="draft-new-loading" />
        )}
      </Screen>
    );
  }

  if (data.members.length === 0) {
    // A group without students: nobody to assign to, so no form.
    return (
      <Screen testID="planner-draft-new-screen" header={header()}>
        <EmptyState title={t.nobody} testID="draft-new-nobody" />
      </Screen>
    );
  }

  return (
    <DraftForm
      form={data}
      header={header}
      top={form.isError ? <Notice tone="error" text={errorText(form.error, m.common.errors.generic)} testID="draft-new-refresh-error" /> : undefined}
    />
  );
}
