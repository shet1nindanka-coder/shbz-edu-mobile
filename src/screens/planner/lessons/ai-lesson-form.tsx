import { useRef, useState, type ReactNode } from 'react';
import { View, type ScrollViewInstance } from 'react-native';

import type { LessonNewFormModel } from '@/api/types';
import { META_LIMITS } from '@/api/types/limits';
import { mskToday } from '@/domain/moscow-time';
import { format, useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { Button, Checkbox, DateTimeField, Notice, Screen, Select, Text, TextArea, TextField, type SelectOption } from '@/ui';

import { useDateTimeLabels } from '../shared/date-time-labels';
import { errorText } from '../shared/error-text';
import { RetryWaitLine, useRetryWait } from '../shared/use-retry-wait';
import { DurationStepper } from './duration-stepper';
import { buildAiLessonInput, checkedMemberIds, currentSpeeds, toggleId } from './new-lesson-logic';
import { TopicsField } from './topics-field';
import { useCreateLesson } from './use-create-lesson';

export type AiLessonFormProps = {
  form: LessonNewFormModel;
  /** App bar of the screen. */
  header: ReactNode;
  /** Banner and mode switch shown above the fields. */
  top?: ReactNode;
};

const SPEED = META_LIMITS.speed;
/** "Not set" in the speed picker (the wire value is `null`). */
const NO_SPEED = 0;

/**
 * The AI create form (`TeacherLessonCreateForm`, docs/spec/05-teacher-lessons-plans.md §1.2.d): title,
 * duration, start, topics, a note for AI and the students with their speed. Submitting creates the lesson
 * and opens its board, where the plan of every student is built.
 */
export function AiLessonForm({ form, header, top }: AiLessonFormProps) {
  const styles = useStyles();
  const { dict, m, locale } = useI18n();
  const t = dict.planner.lessonCreateForm;
  const dateTimeLabels = useDateTimeLabels();
  const scrollRef = useRef<ScrollViewInstance>(null);

  const [title, setTitle] = useState('');
  const [durationMinutes, setDurationMinutes] = useState<number>(META_LIMITS.lessonDurationMinutes.default);
  const [startsAt, setStartsAt] = useState('');
  const [topicIds, setTopicIds] = useState<string[]>([]);
  const [teacherNote, setTeacherNote] = useState('');
  // Only the teacher's own changes are state. The defaults ("all members checked", "speed = profile speed")
  // are derived from the member list, which is re-read after the form has opened from the cached answer.
  const [uncheckedIds, setUncheckedIds] = useState<string[]>([]);
  const [pickedSpeeds, setPickedSpeeds] = useState<Record<string, number | null>>({});
  const studentIds = checkedMemberIds(form.members, uncheckedIds);
  const speeds = currentSpeeds(form.members, pickedSpeeds);
  const [error, setError] = useState<string | null>(null);

  const create = useCreateLesson();
  const wait = useRetryWait();
  const nobodyChecked = studentIds.length === 0;

  const speedOptions: SelectOption<number>[] = [
    { value: NO_SPEED, label: t.speedNotSet },
    ...Array.from({ length: SPEED.max - SPEED.min + 1 }, (_, index) => ({ value: SPEED.min + index, label: String(SPEED.min + index) })),
  ];

  const submit = () => {
    setError(null);
    create.mutate(buildAiLessonInput({ title, durationMinutes, startsAt, topicIds, teacherNote, studentIds, speeds }, form.groupId), {
      onError: (failure) => {
        wait.note(failure);
        // `selectAtLeastOneStudent`, `tooManyStudents`, `invalidStartsAt`, `groupNotFound`, `createFailed`,
        // `rateLimited`, no network — each arrives with its own localised text.
        setError(errorText(failure, t.createFailed));
        scrollRef.current?.scrollTo({ y: 0, animated: true });
      },
    });
  };

  return (
    <Screen
      testID="lesson-new-ai-form"
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
            testID="lesson-new-submit"
          />
          <RetryWaitLine seconds={wait.seconds} testID="lesson-new-wait" />
        </View>
      }
    >
      <View style={styles.form}>
        {top}
        {error ? <Notice tone="error" text={error} onDismiss={() => setError(null)} dismissLabel={m.common.actions.close} testID="lesson-new-error" /> : null}

        <TextField
          label={t.titleLabel}
          value={title}
          onChangeText={setTitle}
          placeholder={t.titlePlaceholder}
          maxLength={META_LIMITS.maxTitleLength}
          returnKeyType="done"
          testID="lesson-new-title"
        />

        <View style={styles.field}>
          <Text variant="label">{t.durationLabel}</Text>
          <DurationStepper value={durationMinutes} onChange={setDurationMinutes} accessibilityLabel={t.durationLabel} testID="lesson-new-duration" />
        </View>

        <DateTimeField
          label={t.dateTimeLabel}
          value={startsAt}
          onChange={setStartsAt}
          today={mskToday()}
          placeholder={t.dateTimePlaceholder}
          labels={dateTimeLabels}
          locale={locale}
          helper={m.common.dateTime.moscowTime}
          testID="lesson-new-starts-at"
        />

        <TopicsField topics={form.topics} value={topicIds} onChange={setTopicIds} />

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
          testID="lesson-new-note"
        />

        <View style={styles.field}>
          <Text variant="label">{t.studentsLabel}</Text>
          <View style={styles.students}>
            {form.members.map((member) => (
              <View key={member.id} style={styles.student}>
                <Checkbox
                  label={member.name}
                  checked={studentIds.includes(member.id)}
                  onChange={() => setUncheckedIds((current) => toggleId(current, member.id))}
                  testID={`lesson-new-student-${member.id}`}
                  style={styles.studentName}
                />
                <Select
                  size="xs"
                  options={speedOptions}
                  value={speeds[member.id] ?? NO_SPEED}
                  onChange={(value) => setPickedSpeeds((current) => ({ ...current, [member.id]: value === NO_SPEED ? null : value }))}
                  placeholder={t.speedNotSet}
                  closeLabel={m.common.actions.close}
                  sheetTitle={format(t.speedAria, { name: member.name })}
                  accessibilityLabel={format(t.speedAria, { name: member.name })}
                  testID={`lesson-new-speed-${member.id}`}
                  style={styles.speed}
                />
              </View>
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
  students: { gap: t.space.xs },
  student: { flexDirection: 'row', alignItems: 'center', gap: t.space.md, minHeight: t.sizes.minTouch },
  studentName: { flex: 1, minWidth: 0 },
  speed: { width: 132 },
  footer: { gap: t.space.xs },
}));
