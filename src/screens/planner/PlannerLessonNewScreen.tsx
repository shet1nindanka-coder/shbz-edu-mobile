import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { BackHandler, View } from 'react-native';

import { isNotFoundError, qk, useApi } from '@/api';
import { useI18n } from '@/i18n';
import type { ScreenParams } from '@/navigation';
import { DetailAppBar, NotFoundScreen } from '@/screens/shell';
import { makeStyles } from '@/theme';
import { ErrorState, LoadingState, Notice, Screen, Segmented } from '@/ui';

import { AiLessonForm } from './lessons/ai-lesson-form';
import { ManualCompose } from './lessons/manual-compose';
import { TargetChooser, type LessonTarget } from './lessons/target-chooser';
import { errorText } from './shared/error-text';
import { isWaitingForNetwork } from './shared/query-state';

/** Route params of `planner.lessonNew` (docs/spec/00-unified-contract.md §3; `ScreenParams` in src/navigation/routes.ts). */
export type PlannerLessonNewScreenProps = ScreenParams['planner.lessonNew'];

type ComposeMode = 'ai' | 'manual';

/**
 * `planner.lessonNew` (docs/spec/05-teacher-lessons-plans.md §1.2). Three modes by the route params:
 * neither id — choose a group or a student; `groupId` — the AI form for the group; `studentId` — an
 * individual lesson with the "AI selection / pick manually" switch.
 */
export function PlannerLessonNewScreen({ groupId, studentId }: PlannerLessonNewScreenProps) {
  const { dict } = useI18n();
  const t = dict.planner.lessonNew;
  const routeTarget: LessonTarget | null = groupId ? { groupId } : studentId ? { studentId } : null;
  // A target picked on the chooser lives in the screen: "back" returns to the chooser, not to the list.
  const [picked, setPicked] = useState<LessonTarget | null>(null);
  const target = routeTarget ?? picked;
  const pickedHere = routeTarget === null && picked !== null;

  useEffect(() => {
    if (!pickedHere) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setPicked(null);
      return true;
    });
    return () => subscription.remove();
  }, [pickedHere]);

  if (!target) {
    return (
      <Screen testID="planner-lesson-new-screen" header={<DetailAppBar title={t.title} subtitle={t.kicker} />} scroll={false} padded={false}>
        <TargetChooser onPick={setPicked} />
      </Screen>
    );
  }

  return (
    <LessonForm
      // A different target is a different form: its fields must not survive the change.
      key={'groupId' in target ? `group-${target.groupId}` : `student-${target.studentId}`}
      target={target}
      onBack={pickedHere ? () => setPicked(null) : undefined}
    />
  );
}

function LessonForm({ target, onBack }: { target: LessonTarget; onBack?: () => void }) {
  const styles = useStyles();
  const api = useApi();
  const { dict, m } = useI18n();
  const t = dict.planner.lessonNew;
  const compose = dict.planner.lessonCompose;

  const form = useQuery({
    queryKey: qk('planner', 'getLessonNewForm', target),
    queryFn: () => api.planner.getLessonNewForm(target),
    // Speeds, "already used in a lesson" marks and the AI switch must be current when a lesson is composed.
    refetchOnMount: 'always',
  });
  const data = form.data;
  // `null` until the teacher touches the switch: the initial mode follows AI availability.
  const [chosenMode, setChosenMode] = useState<ComposeMode | null>(null);

  const appBar = (
    <DetailAppBar
      title={t.title}
      subtitle={data?.kicker ?? t.kicker}
      onBack={onBack}
      testID="lesson-new-app-bar"
    />
  );

  if (!data) {
    // `404 groupNotFound` / `404 studentNotFound`: the group or the student is gone, or belongs to someone else.
    if (form.isError && isNotFoundError(form.error)) return <NotFoundScreen description={errorText(form.error, dict.shells.notFoundDescription)} />;
    return (
      <Screen testID="planner-lesson-new-screen" header={appBar}>
        {form.isError || isWaitingForNetwork(form) ? (
          <ErrorState
            title={dict.shells.errorTitle}
            description={form.isError ? errorText(form.error, dict.shells.errorDescription) : m.common.errors.network}
            retryLabel={dict.common.retry}
            onRetry={() => void form.refetch()}
            retrying={form.isFetching}
            testID="lesson-new-error-state"
          />
        ) : (
          <LoadingState variant="cards" count={3} cardHeight={96} accessibilityLabel={m.common.a11y.loading} testID="lesson-new-loading" />
        )}
      </Screen>
    );
  }

  const studentMode = data.mode === 'student' && data.composeTopics !== null;
  const mode: ComposeMode = !studentMode ? 'ai' : chosenMode === 'manual' || !data.aiAvailable ? 'manual' : (chosenMode ?? 'ai');

  // Nothing to show above the fields of a group form while AI selection is available.
  const top = !form.isError && data.aiAvailable && !studentMode ? null : (
    <View style={styles.top}>
      {form.isError ? <Notice tone="error" text={errorText(form.error, m.common.errors.generic)} testID="lesson-new-refresh-error" /> : null}
      {!data.aiAvailable ? <Notice tone="warning" text={t.aiUnavailable} testID="lesson-new-ai-unavailable" /> : null}
      {studentMode ? (
        <Segmented
          fill
          accessibilityLabel={compose.modeAria}
          options={[
            { value: 'ai', label: compose.modeAi, disabled: !data.aiAvailable, accessibilityLabel: data.aiAvailable ? compose.modeAi : compose.aiUnavailable },
            { value: 'manual', label: compose.modeManual },
          ]}
          value={mode}
          onChange={setChosenMode}
          testID="lesson-new-mode"
        />
      ) : null}
    </View>
  );

  const student = data.members[0];
  if (mode === 'manual' && studentMode && student && data.composeTopics) {
    return <ManualCompose studentId={student.id} topics={data.composeTopics} header={appBar} top={top} />;
  }
  return <AiLessonForm form={data} header={appBar} top={top} />;
}

const useStyles = makeStyles((t) => ({
  top: { gap: t.space.md },
}));
