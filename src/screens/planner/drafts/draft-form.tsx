import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState, type ReactNode } from 'react';
import { View, type ScrollViewInstance } from 'react-native';

import { errorText, qk, useApi } from '@/api';
import type { CreateHomeworkPlanInput, HomeworkPlanNewModel } from '@/api/types';
import { META_LIMITS } from '@/api/types/limits';
import { RetryWaitLine, useRetryWait } from '@/components/retry-wait';
import { mskToday } from '@/domain/moscow-time';
import { format, plural, useI18n } from '@/i18n';
import { useAppNavigation, useStillHere } from '@/navigation';
import { useHintsEnabled } from '@/providers';
import { makeStyles, useTheme } from '@/theme';
import { Button, Card, CheckRow, DateTimeField, Notice, Panel, Panels, Screen, SectionCaption, Select, Text, TextArea, useStatusAnnouncement } from '@/ui';

import { DurationStepper } from '../lessons/duration-stepper';
import { checkedMemberIds, toggleId } from '../lessons/new-lesson-logic';
import { useDateTimeLabels } from '@/components/date-time';
import { useNowTick } from '@/services/clock';
import { buildDraftInput, draftBudget, initialTopicId, validateDraftForm, type DraftFormProblem } from './drafts-logic';

export type DraftFormProps = {
  form: HomeworkPlanNewModel;
  /** Builds the header of the screen; on a tablet the form hands it its main button. */
  header: (aside?: ReactNode) => ReactNode;
  /** Notice shown above the fields (a failed refresh of the form data). */
  top?: ReactNode;
};

/**
 * The homework-draft create form (`TeacherHomeworkPlanCreateForm`, docs/spec/05-teacher-lessons-plans.md
 * §1.6): exactly one topic, the date of the next lesson (it becomes the deadline), minutes per day, a note
 * for AI in one card, the students in another. There is no title field. Submitting — the one main button:
 * under the form on a phone, in the header on a tablet, where the two cards stand side by side — creates
 * the draft and opens its board for EVERY `plan` outcome: the draft exists even when AI selection was
 * refused.
 */
export function DraftForm({ form, header, top }: DraftFormProps) {
  const styles = useStyles();
  const theme = useTheme();
  const api = useApi();
  const queryClient = useQueryClient();
  const navigation = useAppNavigation();
  const stillHere = useStillHere();
  const { dict, m, locale } = useI18n();
  const t = dict.planner.homeworkPlans.createForm;
  const hints = useHintsEnabled();
  const dateTimeLabels = useDateTimeLabels();
  const scrollRef = useRef<ScrollViewInstance>(null);

  // Only the teacher's own choices are state. The defaults (the lesson's dominant topic, "all members
  // checked") are derived from the form data, which is re-read after the form has opened from the cache.
  const [pickedTopicId, setPickedTopicId] = useState<string | null>(null);
  const topicId = pickedTopicId && form.topics.some((topic) => topic.id === pickedTopicId) ? pickedTopicId : initialTopicId(form);
  const [deadlineAt, setDeadlineAt] = useState('');
  const [dailyMinutes, setDailyMinutes] = useState<number>(META_LIMITS.homeworkDailyMinutes.default);
  const [teacherNote, setTeacherNote] = useState('');
  const [uncheckedIds, setUncheckedIds] = useState<string[]>([]);
  const [problem, setProblem] = useState<DraftFormProblem | null>(null);
  const [error, setError] = useState<string | null>(null);

  const wait = useRetryWait();
  const now = useNowTick(60_000);
  // Every current member except the unchecked ones: a student added since the last visit is checked,
  // one who left is not sent.
  const checkedIds = checkedMemberIds(form.members, uncheckedIds);
  const nobodyChecked = checkedIds.length === 0;
  // The inline error appears without moving focus: spoken on both platforms (an Android `alert` role alone
  // is silent).
  useStatusAnnouncement(nobodyChecked ? dict.apiPlanner.lessons.selectAtLeastOneStudent : null);
  const budget = draftBudget(dailyMinutes, deadlineAt, now);

  const create = useMutation({
    mutationFn: (input: CreateHomeworkPlanInput) => api.planner.createHomeworkPlan(input),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: qk('planner', 'listHomeworkPlans') });
      // The form is replaced, not covered: "back" from the board must not return to a form that would
      // create the same draft again. Only the form is replaced: a teacher who has left it meanwhile stays put.
      if (stillHere()) navigation.replace({ screen: 'planner.draftBoard', planId: created.planId });
    },
    onError: (failure) => {
      wait.note(failure);
      // `topicAndDeadlineRequired` (also a deadline that is not in the future), `selectAtLeastOneStudent`,
      // `tooManyStudents`, `groupNotFound`, `topicNotFound`, `createFailed`, `rateLimited`, no network —
      // each arrives with its own localised text.
      setError(errorText(failure, t.createFailed));
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    },
  });

  const submit = () => {
    setError(null);
    const found = validateDraftForm({ topicId, deadlineAt });
    setProblem(found);
    if (found) {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      return;
    }
    create.mutate(buildDraftInput({ topicId, deadlineAt, dailyMinutes, teacherNote, studentIds: checkedIds }, form));
  };

  const submitButton = (
    <Button
      label={create.isPending ? t.creating : t.submit}
      size={theme.tablet ? 'md' : 'lg'}
      fullWidth={!theme.tablet}
      loading={create.isPending}
      disabled={nobodyChecked || wait.waiting}
      onPress={submit}
      testID="draft-new-submit"
    />
  );

  const notices = (
    <>
      {top}
      {error ? <Notice tone="error" text={error} onDismiss={() => setError(null)} dismissLabel={m.common.actions.close} testID="draft-new-error" /> : null}
    </>
  );

  const fields = (
    <>
      <Select
        label={t.topicLabel}
        options={form.topics.map((topic) => ({ value: topic.id, label: topic.title }))}
        value={topicId}
        onChange={(next) => {
          setPickedTopicId(next);
          if (problem === 'pickTopic') setProblem(null);
        }}
        placeholder={dict.topics.widgets.selectPlaceholder}
        closeLabel={m.common.actions.close}
        error={problem === 'pickTopic' ? t.pickTopic : null}
        helper={hints ? t.topicHint : undefined}
        testID="draft-new-topic"
      />

      <DateTimeField
        label={t.nextLessonLabel}
        value={deadlineAt}
        onChange={(next) => {
          setDeadlineAt(next);
          if (problem === 'pickDeadline' && next) setProblem(null);
        }}
        today={mskToday()}
        placeholder={t.dateTimePlaceholder}
        labels={dateTimeLabels}
        locale={locale}
        error={problem === 'pickDeadline' ? t.pickDeadline : null}
        helper={hints ? `${t.nextLessonHint} · ${m.common.dateTime.moscowTime}` : m.common.dateTime.moscowTime}
        disabled={create.isPending}
        testID="draft-new-deadline"
      />

      <View style={styles.field}>
        <Text variant="label">{t.dailyMinutesLabel}</Text>
        {/* Same range and step as a lesson's duration: 15…240 minutes in steps of 5. */}
        <DurationStepper value={dailyMinutes} onChange={setDailyMinutes} accessibilityLabel={t.dailyMinutesLabel} testID="draft-new-daily-minutes" />
        {budget ? (
          <Text variant="small" color="textMuted" tabular testID="draft-new-budget">
            {format(plural(locale, budget.days, m.planner.draftNew.budgetForms), { minutes: budget.minutes, total: budget.total })}
          </Text>
        ) : hints ? (
          <Text variant="small" color="textMuted">
            {t.dailyMinutesHint}
          </Text>
        ) : null}
      </View>

      <TextArea
        label={t.noteLabel}
        labelAside={
          <Text variant="small" color="textMuted" tabular>
            {`${teacherNote.length} / ${META_LIMITS.maxTeacherNoteLength}`}
          </Text>
        }
        value={teacherNote}
        onChangeText={setTeacherNote}
        placeholder={t.notePlaceholder}
        maxLength={META_LIMITS.maxTeacherNoteLength}
        testID="draft-new-note"
      />
    </>
  );

  const students = (
    <>
      {form.members.map((member) => (
        <CheckRow
          key={member.id}
          label={member.name}
          checked={checkedIds.includes(member.id)}
          onChange={() => setUncheckedIds((current) => toggleId(current, member.id))}
          testID={`draft-new-student-${member.id}`}
        />
      ))}
      {nobodyChecked ? (
        <Text variant="small" color="redText" accessibilityRole="alert">
          {dict.apiPlanner.lessons.selectAtLeastOneStudent}
        </Text>
      ) : null}
    </>
  );

  if (theme.tablet) {
    return (
      <Screen testID="draft-new-form" header={header(submitButton)} scroll={false} maxWidth="full">
        {notices}
        {/* Next to nothing it could be dismissed with: the reason stays as long as the button is locked. */}
        <RetryWaitLine seconds={wait.seconds} testID="draft-new-wait" />
        <Panels>
          <Panel weight={3} contentStyle={styles.fields}>
            {fields}
          </Panel>
          <Panel
            weight={2}
            contentStyle={styles.students}
            header={
              <Text variant="sectionTitle" accessibilityRole="header">
                {t.studentsLabel}
              </Text>
            }
          >
            {students}
          </Panel>
        </Panels>
      </Screen>
    );
  }

  return (
    <Screen
      testID="draft-new-form"
      header={header()}
      scrollRef={scrollRef}
      footer={
        <View style={styles.footer}>
          {submitButton}
          <RetryWaitLine seconds={wait.seconds} testID="draft-new-wait" />
        </View>
      }
    >
      {notices}
      <Card style={styles.fields}>{fields}</Card>
      <View style={styles.section}>
        <SectionCaption>{t.studentsLabel}</SectionCaption>
        <Card style={styles.students}>{students}</Card>
      </View>
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  fields: { gap: t.space.lg },
  field: { gap: t.space.xs },
  section: { gap: t.space.xs },
  students: { gap: t.space.xs },
  footer: { gap: t.space.xs },
}));
