import { View } from 'react-native';

import type { LessonItemResult, TeacherStudentLesson } from '@/api/types';
import { HandoutNotice } from '@/components/lessons';
import type { Handout } from '@/components/lessons';
import { RetryWaitLine } from '@/components/retry-wait';
import { planErrorText } from '@/domain/plan-error';
import { format, useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { Button, IconButton, Notice, Spinner, Text } from '@/ui';

import { LessonItemRow } from './lesson-item-row';
import { splitLessonParts, type LessonItem, type LessonPlanState } from './lessons-logic';
import type { LessonBusy } from './use-student-lessons';

export type LessonDetailProps = {
  /** The lesson with the in-flight results applied. */
  lesson: TeacherStudentLesson;
  /** «12.11.2026, 17:00 · 11А · 60 мин · Запланирован»: part of the accessible name of «Открыть». */
  meta: string;
  planState: LessonPlanState;
  busy: LessonBusy | undefined;
  savingItemIds: readonly string[];
  /** Why the last action of this lesson failed. */
  error?: string;
  /** Longest wait of the three rate-limit buckets, shown under the error. */
  waitSeconds: number;
  itemsBlocked: boolean;
  resultsBlocked: boolean;
  planBlocked: boolean;
  /** The handout hook of the screen; its failure is shown in the lesson it was asked for. */
  handout: Handout;
  onDismissError: () => void;
  onOpen: () => void;
  onRetry: () => void;
  onResult: (item: LessonItem, result: LessonItemResult | null) => void;
  onRemove: (item: LessonItem) => void;
  onAdd: () => void;
  onAssignFromResults: () => void;
  onDownloadPdf: () => void;
};

/**
 * What a lesson of the student holds (docs/spec/04-teacher-students.md S6 "lesson card", expanded): the
 * state of the AI selection, the main and the extra part with the "how did it go" marks, and one row of
 * actions — «Открыть» (the lesson board), «Выдать ДЗ» (a homework from the results) and two icon buttons:
 * add a problem by hand, the PDF handout. The parts are captioned only when there are two of them. A phone
 * shows it inside the unfolded lesson card, a tablet in the panel next to the list.
 */
export function LessonDetail({
  lesson,
  meta,
  planState,
  busy,
  savingItemIds,
  error,
  waitSeconds,
  itemsBlocked,
  resultsBlocked,
  planBlocked,
  handout,
  onDismissError,
  onOpen,
  onRetry,
  onResult,
  onRemove,
  onAdd,
  onAssignFromResults,
  onDownloadPdf,
}: LessonDetailProps) {
  const styles = useStyles();
  const { dict, m } = useI18n();
  const t = dict.students.lessons;
  const { main, extra } = splitLessonParts(lesson.items);
  const pending = planState === 'pending';
  const editingPaused = busy !== undefined || itemsBlocked;

  const retry = (
    <Button
      label={t.retry}
      size="sm"
      variant="outline"
      loading={busy === 'regenerate'}
      disabled={busy !== undefined || planBlocked}
      onPress={onRetry}
      testID={`student-lesson-retry-${lesson.id}`}
    />
  );

  const renderItems = (items: readonly LessonItem[]) =>
    items.map((item, index) => (
      <LessonItemRow
        key={item.id}
        item={item}
        busy={editingPaused}
        saving={savingItemIds.includes(item.id)}
        resultsBlocked={resultsBlocked}
        divider={index < items.length - 1}
        onResult={(result) => onResult(item, result)}
        onRemove={() => onRemove(item)}
      />
    ));

  return (
    <View style={styles.body}>
      {error ? (
        <Notice tone="error" text={error} onDismiss={onDismissError} dismissLabel={m.common.actions.close} testID={`student-lesson-error-${lesson.id}`} />
      ) : null}
      {/* Outside the error: the notice can be closed while the buckets stay locked for every lesson. */}
      <RetryWaitLine seconds={waitSeconds} testID={`student-lesson-wait-${lesson.id}`} />

      {pending ? (
        <View accessibilityRole="progressbar" accessibilityLabel={t.aiPicking} accessibilityLiveRegion="polite" style={styles.pending} testID={`student-lesson-pending-${lesson.id}`}>
          <Spinner color="accentSolid" />
          <Text variant="small" color="textMuted" style={styles.pendingText}>
            {t.aiPicking}
          </Text>
        </View>
      ) : planState === 'stale' ? (
        <Notice tone="error" text={t.stalePlan} action={retry} testID={`student-lesson-stale-${lesson.id}`} />
      ) : lesson.planError !== null ? (
        <Notice tone="error" text={planErrorText(lesson.planError, dict.planner.planErrors)} action={retry} testID={`student-lesson-plan-error-${lesson.id}`} />
      ) : null}

      {main.length > 0 ? (
        <View>
          {/* One list needs no caption; with an extra part both are named. */}
          {extra.length > 0 ? (
            <Text variant="kicker" color="textMuted" accessibilityRole="header">
              {t.mainPart}
            </Text>
          ) : null}
          {renderItems(main)}
        </View>
      ) : null}

      {extra.length > 0 ? (
        <View>
          <Text variant="kicker" color="textMuted" accessibilityRole="header">
            {dict.student.lessonView.extraPart}
          </Text>
          {renderItems(extra)}
        </View>
      ) : null}

      {lesson.items.length === 0 && !pending ? (
        <Text variant="small" color="textMuted" accessibilityLabel={t.emptySet} testID={`student-lesson-empty-${lesson.id}`}>
          {m.teacher.lessons.emptySet}
        </Text>
      ) : null}

      {handout.failure?.request.lessonId === lesson.id ? (
        <HandoutNotice handout={handout} testID={`student-lesson-handout-error-${lesson.id}`} />
      ) : (
        // The PDF bucket is shared by every lesson: a dismissed notice, or one on another lesson, still
        // leaves this lesson's «Скачать PDF» locked — say for how long.
        <RetryWaitLine wait={handout.wait} testID={`student-lesson-pdf-wait-${lesson.id}`} />
      )}

      <View style={styles.actions}>
        <Button
          label={dict.planner.common.open}
          accessibilityLabel={format(m.teacher.card.openLessonOf, { title: lesson.title, meta })}
          variant="outline"
          onPress={onOpen}
          testID={`student-lesson-open-${lesson.id}`}
          style={styles.action}
        />
        <Button
          label={dict.students.detail.tabAssign}
          accessibilityLabel={t.assignFromResults}
          variant="outline"
          onPress={onAssignFromResults}
          testID={`student-lesson-homework-${lesson.id}`}
          style={styles.action}
        />
        <IconButton icon="plus" accessibilityLabel={t.addNumber} disabled={editingPaused} onPress={onAdd} testID={`student-lesson-add-${lesson.id}`} />
        <IconButton
          icon="download"
          accessibilityLabel={t.downloadPdf}
          disabled={handout.wait.waiting}
          onPress={onDownloadPdf}
          testID={`student-lesson-pdf-${lesson.id}`}
        />
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  body: { gap: t.space.md },
  pending: { flexDirection: 'row', alignItems: 'center', gap: t.space.sm, minHeight: t.sizes.control.xs },
  pendingText: { flex: 1 },
  // One row: the two worded actions share what the two 44 icon buttons leave. On a 390 pt phone that is
  // ~105 pt each, so they give up half of a button's side padding to keep «Выдать ДЗ» whole.
  actions: { flexDirection: 'row', alignItems: 'center', gap: t.space.sm },
  action: { flexGrow: 1, flexShrink: 1, minWidth: 0, paddingHorizontal: t.space.sm },
}));
