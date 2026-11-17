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
import { makeStyles } from '@/theme';
import { Button, CheckRow, DateTimeField, Notice, Screen, Select, Text, TextArea, useAnnounce } from '@/ui';

import { DurationStepper } from '../lessons/duration-stepper';
import { checkedMemberIds, toggleId } from '../lessons/new-lesson-logic';
import { useDateTimeLabels } from '@/components/date-time';
import { useNowTick } from '@/services/clock';
import { buildDraftInput, draftBudget, initialTopicId, validateDraftForm, type DraftFormProblem } from './drafts-logic';

export type DraftFormProps = {
  form: HomeworkPlanNewModel;
  /** App bar of the screen. */
  header: ReactNode;
  /** Notice shown above the fields (a failed refresh of the form data). */
  top?: ReactNode;
};

/**
 * The homework-draft create form (`TeacherHomeworkPlanCreateForm`, docs/spec/05-teacher-lessons-plans.md
 * §1.6): exactly one topic, the date of the next lesson (it becomes the deadline), minutes per day, a note
 * for AI and the students. There is no title field. Submitting creates the draft and opens its board for
 * EVERY `plan` outcome — the draft exists even when AI selection was refused.
 */
export function DraftForm({ form, header, top }: DraftFormProps) {
  const styles = useStyles();
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
  // The inline error appears without moving focus: VoiceOver says it (Android reads the alert).
  useAnnounce(nobodyChecked ? dict.apiPlanner.lessons.selectAtLeastOneStudent : null);
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

  return (
    <Screen
      testID="draft-new-form"
      header={header}
      scrollRef={scrollRef}
      contentContainerStyle={styles.content}
      footer={
        <View style={styles.footer}>
          <Button
            label={create.isPending ? t.creating : t.submit}
            size="lg"
            fullWidth
            loading={create.isPending}
            disabled={nobodyChecked || wait.waiting}
            onPress={submit}
            testID="draft-new-submit"
          />
          <RetryWaitLine seconds={wait.seconds} testID="draft-new-wait" />
        </View>
      }
    >
      <View style={styles.form}>
        {top}
        {error ? <Notice tone="error" text={error} onDismiss={() => setError(null)} dismissLabel={m.common.actions.close} testID="draft-new-error" /> : null}

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
            <Text variant="caption" color="textMuted" tabular testID="draft-new-budget">
              {format(plural(locale, budget.days, m.planner.draftNew.budgetForms), { minutes: budget.minutes, total: budget.total })}
            </Text>
          ) : hints ? (
            <Text variant="caption" color="textMuted">
              {t.dailyMinutesHint}
            </Text>
          ) : null}
        </View>

        <TextArea
          label={t.noteLabel}
          labelAside={
            <Text variant="caption" color="textMuted" tabular>
              {`${teacherNote.length} / ${META_LIMITS.maxTeacherNoteLength}`}
            </Text>
          }
          value={teacherNote}
          onChangeText={setTeacherNote}
          placeholder={t.notePlaceholder}
          maxLength={META_LIMITS.maxTeacherNoteLength}
          testID="draft-new-note"
        />

        <View style={styles.field}>
          <Text variant="label">{t.studentsLabel}</Text>
          <View style={styles.students}>
            {form.members.map((member) => (
              <CheckRow
                key={member.id}
                label={member.name}
                checked={checkedIds.includes(member.id)}
                onChange={() => setUncheckedIds((current) => toggleId(current, member.id))}
                testID={`draft-new-student-${member.id}`}
              />
            ))}
          </View>
          {nobodyChecked ? (
            <Text variant="captionMedium" color="redText" accessibilityRole="alert">
              {dict.apiPlanner.lessons.selectAtLeastOneStudent}
            </Text>
          ) : null}
        </View>
      </View>
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  // A form starts right under the app bar; the page's 32 pt top padding is for screens with a page header.
  content: { paddingTop: t.space.lg, paddingBottom: t.space.lg },
  form: { gap: t.space.lg },
  field: { gap: t.space.sm },
  students: { gap: t.space.sm },
  footer: { gap: t.space.xs },
}));
