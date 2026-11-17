import { useQuery } from '@tanstack/react-query';
import { View } from 'react-native';

import { errorText, isNotFoundError, qk, useApi } from '@/api';
import { LoadFailure, isWaitingForNetwork } from '@/components/load-failure';
import { useI18n } from '@/i18n';
import type { ScreenParams } from '@/navigation';
import { DetailAppBar, NotFoundScreen } from '@/screens/shell';
import { makeStyles } from '@/theme';
import { EmptyState, LoadingState, Notice, Screen, Text } from '@/ui';

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
  const styles = useStyles();
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

  // The bar has one line: a group or a student name fits there, «По итогам занятия «…»» does not — a
  // draft made from a lesson shows that line in full above the form.
  const fromLesson = Boolean(data?.sourceLessonId);
  const appBar = <DetailAppBar title={t.title} subtitle={data && !fromLesson ? data.kicker : t.kicker} testID="draft-new-app-bar" />;

  if (!data) {
    // `404 lessonNotFound` / `groupNotFound` / `studentNotFound`: the source is gone or belongs to someone else.
    if (form.isError && isNotFoundError(form.error)) return <NotFoundScreen description={errorText(form.error, dict.shells.notFoundDescription)} />;
    return (
      <Screen testID="planner-draft-new-screen" header={appBar}>
        {form.isError || isWaitingForNetwork(form) ? (
          <LoadFailure query={form} testID="draft-new-error-state" />
        ) : (
          <LoadingState variant="cards" count={3} cardHeight={96} accessibilityLabel={m.common.a11y.loading} testID="draft-new-loading" />
        )}
      </Screen>
    );
  }

  if (data.members.length === 0) {
    // A group without students: nobody to assign to, so no form.
    return (
      <Screen testID="planner-draft-new-screen" header={appBar}>
        <EmptyState title={t.nobody} testID="draft-new-nobody" />
      </Screen>
    );
  }

  return (
    <DraftForm
      form={data}
      header={appBar}
      top={
        fromLesson || form.isError ? (
          <View style={styles.top}>
            {fromLesson ? (
              <Text variant="smallStrong" color="textMuted" testID="draft-new-source">
                {data.kicker}
              </Text>
            ) : null}
            {form.isError ? <Notice tone="error" text={errorText(form.error, m.common.errors.generic)} testID="draft-new-refresh-error" /> : null}
          </View>
        ) : undefined
      }
    />
  );
}

const useStyles = makeStyles((t) => ({
  top: { gap: t.space.md },
}));
