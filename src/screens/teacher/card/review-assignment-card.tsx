import { View } from 'react-native';

import type { HomeworkNumberStatus, TeacherHomeworkAssignment, TeacherHomeworkCheck } from '@/api/types';
import { PhotoThumb } from '@/components/files';
import { formatMsk } from '@/domain/dates';
import { homeworkAssignmentLabel } from '@/domain/homework-label';
import { format, useI18n } from '@/i18n';
import { Hint } from '@/providers';
import { makeStyles } from '@/theme';
import { Button, Card, Chip, Icon, Notice, PressableScale, ProgressBar, Text } from '@/ui';

import { RateLimitLine } from '../students/rate-limit-line';
import { ReviewCheckHistory } from './review-check-history';
import { ReviewInjectionBanner } from './review-injection-banner';
import {
  acceptVerdictChanges,
  canAcceptVerdicts,
  injectionResults,
  isAssignmentCompleted,
  isAssignmentOverdue,
  latestDoneCheck,
  unmarkedCount,
  verdictsByNumber,
} from './review-logic';
import { ReviewNumberCard } from './review-number-card';

export type ReviewAssignmentCardProps = {
  /** The homework with the in-flight colours applied. */
  assignment: TeacherHomeworkAssignment;
  expanded: boolean;
  /** The card a history link led to: ringed for a moment after the list scrolled to it. */
  highlighted: boolean;
  lessonMode: boolean;
  now: number;
  savingIds: readonly string[];
  numberErrors: Record<string, string>;
  /** Status writes are cooling down; `waitSeconds` says for how long. */
  blocked: boolean;
  waitSeconds: number;
  /** Why the last "accept" / "undo" of this homework failed. */
  error?: string;
  /** The "accept AI verdicts" batch of this homework is in flight. */
  accepting: boolean;
  onToggle: () => void;
  onDismissError: () => void;
  onStatus: (homeworkNumberId: string, status: HomeworkNumberStatus | null) => void;
  onAccept: () => void;
  onCancel: () => void;
  onHistory: (homeworkNumberId: string) => void;
  onOpenPending: (index: number) => void;
  onOpenCheckPhoto: (check: TeacherHomeworkCheck, index: number) => void;
};

const PENDING_THUMB = 64;

/**
 * One homework in the review list (docs/spec/04-teacher-students.md S4 "assignment card"). Collapsed it
 * is a summary — label, topic, dates, "solved / red / unmarked" and the progress bar; expanded it shows
 * the photos that wait for a check, "accept AI verdicts", every number and the check history.
 */
export function ReviewAssignmentCard({
  assignment,
  expanded,
  highlighted,
  lessonMode,
  now,
  savingIds,
  numberErrors,
  blocked,
  waitSeconds,
  error,
  accepting,
  onToggle,
  onDismissError,
  onStatus,
  onAccept,
  onCancel,
  onHistory,
  onOpenPending,
  onOpenCheckPhoto,
}: ReviewAssignmentCardProps) {
  const styles = useStyles();
  const { dict, m, locale } = useI18n();
  const t = dict.students.review;

  const label = homeworkAssignmentLabel(assignment, locale);
  const completed = isAssignmentCompleted(assignment);
  const overdue = isAssignmentOverdue(assignment, now);
  const latestDone = latestDoneCheck(assignment.checks);
  const verdicts = verdictsByNumber(latestDone);
  const injections = lessonMode ? [] : injectionResults(latestDone);
  const created = formatMsk(assignment.createdAt, 'dateTime', locale);
  const deadline = formatMsk(assignment.deadlineAt, 'dateTime', locale);
  const dates = [created ? format(t.issuedAt, { date: created }) : null, deadline ? format(t.deadlineUntil, { date: deadline }) : null]
    .filter(Boolean)
    .join(' · ');
  const lastChecked = formatMsk(latestDone?.checkedAt, 'dateTime', locale);
  const pendingChanges = canAcceptVerdicts(latestDone) ? acceptVerdictChanges(assignment).length : 0;
  const busy = assignment.numbers.some((number) => savingIds.includes(number.homeworkNumberId));

  return (
    <Card selected={highlighted} style={styles.card} testID={`review-assignment-${assignment.id}`}>
      {injections.length > 0 ? <ReviewInjectionBanner results={injections} testID={`review-injection-${assignment.id}`} /> : null}

      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={format(expanded ? m.teacher.card.collapse : m.teacher.card.expand, { title: label })}
        accessibilityState={{ expanded }}
        scaleTo={1}
        onPress={onToggle}
        testID={`review-assignment-toggle-${assignment.id}`}
        style={styles.header}
      >
        <View style={styles.titleRow}>
          <Text variant="cardTitle" accessibilityRole="header" numberOfLines={3} style={styles.title}>
            {label}
          </Text>
          <Icon name={expanded ? 'chevronUp' : 'chevronDown'} size={18} color="kicker" />
        </View>
        {completed || overdue ? (
          <View style={styles.chips}>
            {completed ? <Chip tone="green" label={t.completed} /> : null}
            {overdue ? <Chip tone="red" label={t.overdue} /> : null}
          </View>
        ) : null}
        <Text variant="small" color="textMuted">
          {assignment.topicTitle}
        </Text>
        {dates ? (
          <Text variant="caption" color="textMuted" tabular>
            {dates}
          </Text>
        ) : null}
      </PressableScale>

      <View style={styles.summary}>
        <View style={styles.chips}>
          <Chip tone="muted" label={format(t.solved, { solved: assignment.solvedCount, total: assignment.totalNumbers })} style={styles.summaryChip} />
          <Chip tone={assignment.redCount > 0 ? 'red' : 'muted'} label={`${t.red} ${assignment.redCount}`} style={styles.summaryChip} />
          <Chip tone="muted" label={format(t.unmarked, { n: unmarkedCount(assignment) })} style={styles.summaryChip} />
        </View>
        <ProgressBar value={assignment.solvedPercent} accessibilityLabel={format(t.solved, { solved: assignment.solvedCount, total: assignment.totalNumbers })} />
      </View>

      {expanded ? (
        <View style={styles.body}>
          {error ? (
            <View style={styles.errorBlock}>
              <Notice tone="error" text={error} onDismiss={onDismissError} dismissLabel={m.common.actions.close} testID={`review-assignment-error-${assignment.id}`} />
              <RateLimitLine seconds={waitSeconds} />
            </View>
          ) : null}

          {assignment.photos.length > 0 ? (
            <View style={styles.block}>
              <Text variant="caption" color="textMuted">
                {format(t.photosTitle, { n: assignment.photos.length })}
                {lastChecked ? format(t.lastAutoCheck, { date: lastChecked }) : ''}
              </Text>
              <View style={styles.photos}>
                {assignment.photos.map((photo, index) => (
                  <PhotoThumb
                    key={photo.id}
                    fileId={photo.fileId}
                    name={photo.originalName}
                    size={PENDING_THUMB}
                    onPress={() => onOpenPending(index)}
                    testID={`review-photo-${photo.id}`}
                  />
                ))}
              </View>
            </View>
          ) : (
            <Text variant="caption" color="textMuted">
              {t.noPhotos}
            </Text>
          )}

          {canAcceptVerdicts(latestDone) ? (
            <View style={styles.block}>
              <Button
                label={t.acceptVerdicts}
                variant="tonal"
                leftIcon="checkCircle"
                loading={accepting}
                // Nothing to change: every definite verdict already matches the number's colour.
                disabled={pendingChanges === 0 || busy || blocked}
                onPress={onAccept}
                testID={`review-accept-${assignment.id}`}
              />
              <Hint>
                <Text variant="caption" color="textMuted">
                  {t.acceptVerdictsHint}
                </Text>
              </Hint>
            </View>
          ) : null}

          <View style={styles.block}>
            <Text variant="kickerSm">{t.numbers}</Text>
            {assignment.numbers.map((number) => (
              <ReviewNumberCard
                key={number.homeworkNumberId}
                number={number}
                result={verdicts.get(number.number)}
                lessonMode={lessonMode}
                saving={savingIds.includes(number.homeworkNumberId)}
                blocked={blocked}
                waitSeconds={waitSeconds}
                error={numberErrors[number.homeworkNumberId]}
                onStatus={(status) => onStatus(number.homeworkNumberId, status)}
                onHistory={() => onHistory(number.homeworkNumberId)}
              />
            ))}
          </View>

          <ReviewCheckHistory
            checks={assignment.checks}
            currentId={latestDone?.id ?? null}
            onOpenPhoto={onOpenCheckPhoto}
            testID={`review-history-${assignment.id}`}
          />

          <Button
            label={t.cancelLabel}
            variant="danger"
            size="sm"
            leftIcon="trash"
            onPress={onCancel}
            testID={`review-cancel-${assignment.id}`}
            style={styles.cancel}
          />
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
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.xs },
  summary: { gap: t.space.sm },
  // Narrower than the default chip so the three counters share one line on a 390 pt phone.
  summaryChip: { paddingHorizontal: 9 },
  body: { gap: t.space.field },
  block: { gap: t.space.sm },
  errorBlock: { gap: t.space.xs },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.sm },
  cancel: { alignSelf: 'flex-start' },
}));
