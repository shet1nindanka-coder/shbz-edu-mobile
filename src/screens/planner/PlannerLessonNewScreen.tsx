import { useQuery } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { BackHandler, View } from 'react-native';

import { errorText, isNotFoundError, qk, useApi } from '@/api';
import { LoadFailure, isWaitingForNetwork } from '@/components/load-failure';
import { useI18n } from '@/i18n';
import { useAppNavigation, type ScreenParams } from '@/navigation';
import { DetailAppBar, NotFoundScreen } from '@/screens/shell';
import { makeStyles, useTheme } from '@/theme';
import { ErrorState, LoadingState, Notice, Screen, Segmented } from '@/ui';

import { AiLessonForm } from './lessons/ai-lesson-form';
import { ManualCompose } from './lessons/manual-compose';
import { TargetChooser, type LessonTarget } from './lessons/target-chooser';

/** Route params of `planner.lessonNew` (docs/spec/00-unified-contract.md §3; `ScreenParams` in src/navigation/routes.ts). */
export type PlannerLessonNewScreenProps = ScreenParams['planner.lessonNew'] & {
  /**
   * Told whether a target picked on the chooser is open — a step inside this screen that "back" closes.
   * The route turns the iOS back gesture off meanwhile, so it cannot leave the screen while the header's
   * back link and Android's back return to the chooser.
   */
  onInnerStepChange?: (active: boolean) => void;
};

type ComposeMode = 'ai' | 'manual';

/**
 * `planner.lessonNew` (docs/spec/05-teacher-lessons-plans.md §1.2). Three modes by the route params:
 * neither id — choose a group or a student; `groupId` — the AI form for the group; `studentId` — an
 * individual lesson with the "AI selection / pick manually" switch.
 */
export function PlannerLessonNewScreen({ groupId, studentId, onInnerStepChange }: PlannerLessonNewScreenProps) {
  const { dict, m } = useI18n();
  const t = dict.planner.lessonNew;
  const routeTarget: LessonTarget | null = groupId ? { groupId } : studentId ? { studentId } : null;
  // A target picked on the chooser lives in the screen: "back" returns to the chooser, not to the list.
  const [picked, setPicked] = useState<LessonTarget | null>(null);
  const target = routeTarget ?? picked;
  const pickedHere = routeTarget === null && picked !== null;

  useEffect(() => {
    onInnerStepChange?.(pickedHere);
  }, [pickedHere, onInnerStepChange]);

  useEffect(() => {
    if (!pickedHere) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setPicked(null);
      return true;
    });
    return () => subscription.remove();
  }, [pickedHere]);

  if (!target) {
    return <TargetChooser header={<DetailAppBar title={t.title} backTitle={m.shell.tabs.lessons} />} onPick={setPicked} />;
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
  const theme = useTheme();
  const api = useApi();
  const navigation = useAppNavigation();
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

  const studentMode = data !== undefined && data.mode === 'student' && data.composeTopics !== null;
  const mode: ComposeMode = !studentMode ? 'ai' : chosenMode === 'manual' || !data.aiAvailable ? 'manual' : (chosenMode ?? 'ai');

  // An individual lesson is composed in one of two ways: the switch belongs to the header, as the tabs of
  // any detail screen do — next to the title on a tablet, in a row of its own under it on a phone.
  const modeSwitch = studentMode ? (
    <Segmented
      fill={!theme.tablet}
      accessibilityLabel={compose.modeAria}
      options={[
        { value: 'ai', label: compose.modeAi, disabled: !data.aiAvailable, accessibilityLabel: data.aiAvailable ? compose.modeAi : compose.aiUnavailable },
        { value: 'manual', label: compose.modeManual },
      ]}
      value={mode}
      onChange={setChosenMode}
      testID="lesson-new-mode"
    />
  ) : null;

  // The header of every state of the form: whom the lesson is for under the title; the forms add their
  // main button to it on a tablet.
  const header = (aside?: ReactNode) => (
    <DetailAppBar
      title={t.title}
      subtitle={data?.kicker}
      // Back from a form opened on the chooser returns to the chooser, which has no shorter name.
      backTitle={onBack ? undefined : m.shell.tabs.lessons}
      onBack={onBack}
      aside={
        modeSwitch || aside ? (
          <View style={styles.aside}>
            {modeSwitch}
            {aside}
          </View>
        ) : undefined
      }
      testID="lesson-new-app-bar"
    />
  );

  if (!data) {
    // `404 groupNotFound` / `404 studentNotFound`: the group or the student is gone, or belongs to someone else.
    if (form.isError && isNotFoundError(form.error)) {
      const description = errorText(form.error, dict.shells.notFoundDescription);
      // Opened from the route: the shell's 404 page. Picked on the chooser: the route has turned the iOS back
      // gesture off, so the 404 keeps the header whose back link returns to the chooser (as Android's back does).
      if (!onBack) return <NotFoundScreen description={description} />;
      return (
        <Screen testID="planner-lesson-new-screen" header={header()} scroll={false} contentContainerStyle={styles.center}>
          <ErrorState
            numeral="404"
            title={dict.shells.notFoundTitle}
            description={description}
            retryLabel={dict.common.home}
            onRetry={navigation.goHome}
            testID="lesson-new-not-found"
          />
        </Screen>
      );
    }
    return (
      <Screen testID="planner-lesson-new-screen" header={header()}>
        {form.isError || isWaitingForNetwork(form) ? (
          <LoadFailure query={form} testID="lesson-new-error-state" />
        ) : (
          <LoadingState variant="cards" count={2} accessibilityLabel={m.common.a11y.loading} testID="lesson-new-loading" />
        )}
      </Screen>
    );
  }

  // Nothing to show above the fields while the form data is fresh and AI selection is available.
  const top =
    form.isError || !data.aiAvailable ? (
      <>
        {form.isError ? <Notice tone="error" text={errorText(form.error, m.common.errors.generic)} testID="lesson-new-refresh-error" /> : null}
        {/* The short site wording: the form itself shows what is left (the switch moves to «Выбрать вручную»). */}
        {!data.aiAvailable ? <Notice tone="warning" text={compose.aiUnavailable} testID="lesson-new-ai-unavailable" /> : null}
      </>
    ) : null;

  const student = data.members[0];
  if (mode === 'manual' && studentMode && student && data.composeTopics) {
    return <ManualCompose studentId={student.id} topics={data.composeTopics} header={header} top={top} />;
  }
  return <AiLessonForm form={data} header={header} top={top} />;
}

const useStyles = makeStyles((t) => ({
  center: { justifyContent: 'center' },
  // Tablet: the switch and the main button stand in the header row; phone: only the switch, full width.
  aside: t.tablet ? { flexDirection: 'row', alignItems: 'center', gap: t.space.sm } : { gap: t.space.xs },
}));
