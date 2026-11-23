import { useRef, useState, type ReactNode } from 'react';
import { View, type ScrollViewInstance } from 'react-native';

import { errorText } from '@/api';
import type { LessonNewFormModel } from '@/api/types';
import { META_LIMITS } from '@/api/types/limits';
import { RetryWaitLine, useRetryWait } from '@/components/retry-wait';
import { mskToday } from '@/domain/moscow-time';
import { format, useI18n } from '@/i18n';
import { makeStyles, useTheme } from '@/theme';
import {
  Button,
  Card,
  Checkbox,
  DateTimeField,
  Notice,
  Panel,
  Panels,
  Screen,
  SectionCaption,
  Select,
  Text,
  TextArea,
  TextField,
  useStatusAnnouncement,
  type SelectOption,
} from '@/ui';

import { useDateTimeLabels } from '@/components/date-time';
import { DurationStepper } from './duration-stepper';
import { buildAiLessonInput, checkedMemberIds, currentSpeeds, toggleId } from './new-lesson-logic';
import { TopicsField } from './topics-field';
import { useCreateLesson } from './use-create-lesson';

export type AiLessonFormProps = {
  form: LessonNewFormModel;
  /** Builds the header of the screen; on a tablet the form hands it its main button. */
  header: (aside?: ReactNode) => ReactNode;
  /** Banners shown above the fields. */
  top?: ReactNode;
};

const SPEED = META_LIMITS.speed;
/** "Not set" in the speed picker (the wire value is `null`). */
const NO_SPEED = 0;

/**
 * The AI create form (`TeacherLessonCreateForm`, docs/spec/05-teacher-lessons-plans.md §1.2.d): title,
 * duration, start, topics and a note for AI in one card, the students with their speed in another.
 * Submitting — the one main button: under the form on a phone, in the header on a tablet, where the two
 * cards stand side by side — creates the lesson and opens its board, where the plan of every student is
 * built.
 */
export function AiLessonForm({ form, header, top }: AiLessonFormProps) {
  const styles = useStyles();
  const theme = useTheme();
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
  // The inline error appears without moving focus: spoken on both platforms (an Android `alert` role alone
  // is silent).
  useStatusAnnouncement(nobodyChecked ? dict.apiPlanner.lessons.selectAtLeastOneStudent : null);

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

  const submitButton = (
    <Button
      label={create.isPending ? t.creating : t.submit}
      size={theme.tablet ? 'md' : 'lg'}
      fullWidth={!theme.tablet}
      loading={create.isPending}
      disabled={nobodyChecked || wait.waiting}
      onPress={submit}
      testID="lesson-new-submit"
    />
  );

  const notices = (
    <>
      {top}
      {error ? <Notice tone="error" text={error} onDismiss={() => setError(null)} dismissLabel={m.common.actions.close} testID="lesson-new-error" /> : null}
    </>
  );

  const fields = (
    <>
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
          <Text variant="small" color="textMuted" tabular>
            {`${teacherNote.length} / ${META_LIMITS.maxTeacherNoteLength}`}
          </Text>
        }
        value={teacherNote}
        onChangeText={setTeacherNote}
        placeholder={t.notePlaceholder}
        maxLength={META_LIMITS.maxTeacherNoteLength}
        testID="lesson-new-note"
      />
    </>
  );

  const students = (
    <>
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
      {nobodyChecked ? (
        <Text variant="small" color="redText" accessibilityRole="alert">
          {dict.apiPlanner.lessons.selectAtLeastOneStudent}
        </Text>
      ) : null}
    </>
  );

  if (theme.tablet) {
    return (
      <Screen testID="lesson-new-ai-form" header={header(submitButton)} scroll={false} maxWidth="full">
        {notices}
        {/* Next to nothing it could be dismissed with: the reason stays as long as the button is locked. */}
        <RetryWaitLine seconds={wait.seconds} testID="lesson-new-wait" />
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
      testID="lesson-new-ai-form"
      header={header()}
      scrollRef={scrollRef}
      footer={
        <View style={styles.footer}>
          {submitButton}
          <RetryWaitLine seconds={wait.seconds} testID="lesson-new-wait" />
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
  student: { flexDirection: 'row', alignItems: 'center', gap: t.space.md, minHeight: t.sizes.control.md },
  studentName: { flex: 1, minWidth: 0 },
  // «Не указана» with the chevron of the compact select.
  speed: { width: t.sizes.control.md * 3 },
  footer: { gap: t.space.xs },
}));
