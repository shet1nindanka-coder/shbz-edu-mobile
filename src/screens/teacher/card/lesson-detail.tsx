import { View } from 'react-native';

import type { LessonItemResult, TeacherStudentLesson } from '@/api/types';
import { HandoutNotice } from '@/components/lessons';
import type { Handout } from '@/components/lessons';
import { RetryWaitLine } from '@/components/retry-wait';
import { planErrorText } from '@/domain/plan-error';
import { format, useI18n } from '@/i18n';
import { Hint } from '@/providers';
import { makeStyles } from '@/theme';
import { Button, Notice, Spinner, Text } from '@/ui';

import { LessonItemRow } from './lesson-item-row';
import { splitLessonParts, type LessonItem, type LessonPlanState } from './lessons-logic';
import type { LessonBusy } from './use-student-lessons';

export type LessonDetailProps = {
  /** The lesson with the in-flight results applied. */
  lesson: TeacherStudentLesson;
  /** «12.11.2026, 17:00 · 11А · 60 мин · Запланирован»: part of the accessible name of «Открыть занятие». */
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
 * state of the AI selection, the main and the extra part with the "how did it go" marks, and the actions
 * — the lesson board, adding a problem by hand, a homework from the results, the PDF handout. A phone
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
          <View style={styles.partHead}>
            <Text variant="kicker" color="textMuted" accessibilityRole="header">
              {t.mainPart}
            </Text>
            <Hint>
              <Text variant="hint" color="textMuted">
                {t.howSolved}
              </Text>
            </Hint>
          </View>
          {renderItems(main)}
        </View>
      ) : null}

      {extra.length > 0 ? (
        <View>
          <Text variant="kicker" color="textMuted" accessibilityRole="header">
            {t.extraPart}
          </Text>
          {renderItems(extra)}
        </View>
      ) : null}

      {lesson.items.length === 0 && !pending ? (
        <Text variant="small" color="textMuted" testID={`student-lesson-empty-${lesson.id}`}>
          {t.emptySet}
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
          label={t.openLesson}
          accessibilityLabel={format(m.teacher.card.openLessonOf, { title: lesson.title, meta })}
          variant="outline"
          rightIcon="forward"
          onPress={onOpen}
          testID={`student-lesson-open-${lesson.id}`}
          style={styles.action}
        />
        <Button
          label={t.addNumber}
          variant="outline"
          leftIcon="plus"
          loading={busy === 'items'}
          disabled={editingPaused}
          onPress={onAdd}
          testID={`student-lesson-add-${lesson.id}`}
          style={styles.action}
        />
        <Button
          label={t.assignFromResults}
          variant="outline"
          leftIcon="send"
          onPress={onAssignFromResults}
          testID={`student-lesson-homework-${lesson.id}`}
          style={styles.action}
        />
        <Button
          label={t.downloadPdf}
          variant="outline"
          leftIcon="download"
          disabled={handout.wait.waiting}
          onPress={onDownloadPdf}
          testID={`student-lesson-pdf-${lesson.id}`}
          style={styles.action}
        />
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  body: { gap: t.space.md },
  pending: { flexDirection: 'row', alignItems: 'center', gap: t.space.sm, minHeight: t.sizes.control.xs },
  pendingText: { flex: 1 },
  partHead: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: t.space.sm },
  // Two to a row where they fit; a long label takes the whole row.
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.sm },
  action: { flexGrow: 1, flexBasis: '45%' },
}));
