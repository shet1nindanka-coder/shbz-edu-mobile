import { View } from 'react-native';

import type { LessonItemResult, TeacherStudentLesson } from '@/api/types';
import { formatMsk } from '@/domain/dates';
import { planErrorText } from '@/domain/plan-error';
import { format, useI18n } from '@/i18n';
import { Hint } from '@/providers';
import { HandoutNotice } from '@/screens/planner/shared/handout-notice';
import type { Handout } from '@/screens/planner/shared/use-handout';
import { makeStyles } from '@/theme';
import { Button, Card, Icon, Notice, PressableScale, Spinner, Text } from '@/ui';

import { RateLimitLine } from '../students/rate-limit-line';
import { LessonItemRow } from './lesson-item-row';
import { splitLessonParts, type LessonItem, type LessonPlanState } from './lessons-logic';
import type { LessonBusy } from './use-student-lessons';

export type LessonCardProps = {
  /** The lesson with the in-flight results applied. */
  lesson: TeacherStudentLesson;
  planState: LessonPlanState;
  expanded: boolean;
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
  onToggle: () => void;
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
 * One lesson of the student (docs/spec/04-teacher-students.md S6 "lesson card"). Collapsed: title, when,
 * group, duration, status and "open lesson". Expanded: the state of the AI selection, the main and the
 * extra part with the "how did it go" marks, and the actions — homework from the results, the PDF
 * handout, adding a problem by hand.
 */
export function LessonCard({
  lesson,
  planState,
  expanded,
  busy,
  savingItemIds,
  error,
  waitSeconds,
  itemsBlocked,
  resultsBlocked,
  planBlocked,
  handout,
  onToggle,
  onDismissError,
  onOpen,
  onRetry,
  onResult,
  onRemove,
  onAdd,
  onAssignFromResults,
  onDownloadPdf,
}: LessonCardProps) {
  const styles = useStyles();
  const { dict, m, locale } = useI18n();
  const t = dict.students.lessons;
  const { main, extra } = splitLessonParts(lesson.items);
  const pending = planState === 'pending';
  const editingPaused = busy !== undefined || itemsBlocked;

  const meta = [
    formatMsk(lesson.startsAt ?? lesson.createdAt, 'dateTime', locale),
    lesson.groupName,
    format(t.minutes, { n: lesson.durationMinutes }),
    t.status[lesson.status],
  ]
    .filter(Boolean)
    .join(' · ');

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

  const renderItem = (item: LessonItem) => (
    <LessonItemRow
      key={item.id}
      item={item}
      busy={editingPaused}
      saving={savingItemIds.includes(item.id)}
      resultsBlocked={resultsBlocked}
      onResult={(result) => onResult(item, result)}
      onRemove={() => onRemove(item)}
    />
  );

  return (
    <Card style={styles.card} testID={`student-lesson-${lesson.id}`}>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={format(expanded ? m.teacher.card.collapse : m.teacher.card.expand, { title: lesson.title })}
        accessibilityState={{ expanded }}
        scaleTo={1}
        onPress={onToggle}
        testID={`student-lesson-toggle-${lesson.id}`}
        style={styles.header}
      >
        <View style={styles.titleRow}>
          <Text variant="cardTitle" accessibilityRole="header" numberOfLines={3} style={styles.title}>
            {lesson.title}
          </Text>
          <Icon name={expanded ? 'chevronUp' : 'chevronDown'} size={18} color="kicker" />
        </View>
        <Text variant="caption" color="textMuted" tabular>
          {meta}
        </Text>
      </PressableScale>

      <Button
        label={t.openLesson}
        variant="outline"
        size="sm"
        rightIcon="chevronRight"
        onPress={onOpen}
        testID={`student-lesson-open-${lesson.id}`}
        style={styles.start}
      />

      {expanded ? (
        <View style={styles.body}>
          {error ? (
            <View style={styles.errorBlock}>
              <Notice tone="error" text={error} onDismiss={onDismissError} dismissLabel={m.common.actions.close} testID={`student-lesson-error-${lesson.id}`} />
              <RateLimitLine seconds={waitSeconds} />
            </View>
          ) : null}

          {pending ? (
            <View accessibilityRole="progressbar" accessibilityLabel={t.aiPicking} accessibilityLiveRegion="polite" style={styles.pending} testID={`student-lesson-pending-${lesson.id}`}>
              <Spinner size={14} color="accentSolid" />
              <Text variant="smallMedium" color="textMuted" style={styles.pendingText}>
                {t.aiPicking}
              </Text>
            </View>
          ) : planState === 'stale' ? (
            <Notice tone="error" text={t.stalePlan} action={retry} testID={`student-lesson-stale-${lesson.id}`} />
          ) : lesson.planError !== null ? (
            <Notice tone="error" text={planErrorText(lesson.planError, dict.planner.planErrors)} action={retry} testID={`student-lesson-plan-error-${lesson.id}`} />
          ) : null}

          {main.length > 0 ? (
            <View style={styles.part}>
              <View style={styles.partHead}>
                <Text variant="kickerSm">{t.mainPart}</Text>
                <Hint>
                  <Text variant="caption" color="textMuted">
                    {t.howSolved}
                  </Text>
                </Hint>
              </View>
              {main.map(renderItem)}
            </View>
          ) : null}

          {extra.length > 0 ? (
            <View style={styles.part}>
              <Text variant="kickerSm">{t.extraPart}</Text>
              {extra.map(renderItem)}
            </View>
          ) : null}

          {lesson.items.length === 0 && !pending ? (
            <Text variant="small" color="textMuted" testID={`student-lesson-empty-${lesson.id}`}>
              {t.emptySet}
            </Text>
          ) : null}

          {handout.failure?.request.lessonId === lesson.id ? <HandoutNotice handout={handout} testID={`student-lesson-handout-error-${lesson.id}`} /> : null}

          <View style={styles.actions}>
            <Button
              label={t.addNumber}
              variant="outline"
              leftIcon="plus"
              loading={busy === 'items'}
              disabled={editingPaused}
              onPress={onAdd}
              testID={`student-lesson-add-${lesson.id}`}
            />
            <Button label={t.assignFromResults} variant="outline" leftIcon="send" onPress={onAssignFromResults} testID={`student-lesson-homework-${lesson.id}`} />
            <Button
              label={t.downloadPdf}
              variant="outline"
              leftIcon="download"
              disabled={handout.wait.waiting}
              onPress={onDownloadPdf}
              testID={`student-lesson-pdf-${lesson.id}`}
            />
          </View>
        </View>
      ) : null}
    </Card>
  );
}

const useStyles = makeStyles((t) => ({
  card: { gap: t.space.md },
  header: { gap: t.space.xs, minHeight: t.sizes.minTouch, justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: t.space.md },
  title: { flex: 1, minWidth: 0 },
  start: { alignSelf: 'flex-start' },
  body: { gap: t.space.field },
  errorBlock: { gap: t.space.xs },
  pending: { flexDirection: 'row', alignItems: 'center', gap: t.space.sm, minHeight: 24 },
  pendingText: { flex: 1 },
  part: { gap: t.space.sm },
  partHead: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: t.space.sm },
  actions: { gap: t.space.sm },
}));
