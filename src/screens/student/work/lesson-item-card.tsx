import { View } from 'react-native';

import type { LessonItemDto, LessonItemResult, SolutionVerdict } from '@/api/types';
import { MathContent } from '@/components/math';
import { RetryWaitLine } from '@/components/retry-wait';
import { formatClockTime } from '@/domain/dates';
import { checkErrorText } from '@/domain/solution-check-error-text';
import { format, useI18n } from '@/i18n';
import { Hint } from '@/providers';
import { makeStyles } from '@/theme';
import { Button, Card, Chip, Notice, ProgressBar, Spinner, Text, type ChipTone } from '@/ui';

import { isCheckRunning, lessonItemChip } from './logic';
import { PickProblemNotice, type PickProblem } from './use-photo-source';

const RESULT_CHIP: Record<LessonItemResult, ChipTone> = { SOLVED: 'green', PARTIAL: 'yellow', NOT_SOLVED: 'red', SKIPPED: 'muted' };
const VERDICT_CHIP: Record<SolutionVerdict, ChipTone> = { CORRECT: 'green', INCORRECT: 'red', UNCERTAIN: 'muted' };

export type LessonItemCardProps = {
  item: LessonItemDto;
  /** 1-based position inside its part. */
  index: number;
  /** `limits.maxPhotosPerSubmission` (3). */
  maxPhotos: number;
  /** This item's photos are being uploaded. */
  uploading: boolean;
  uploadPercent: number;
  /** Any upload is in flight, the lesson check is switched off, or a limit is cooling down. */
  submitDisabled: boolean;
  submitError: string | null;
  onDismissSubmitError: () => void;
  /** Seconds of a cool-down, shown under this item's error. */
  waitSeconds: number;
  /** The camera / gallery could not give a photo for this item. */
  pickProblem: PickProblem | null;
  onDismissPickProblem: () => void;
  /** The photos for this item are being prepared. */
  preparing: boolean;
  onSubmit: (item: LessonItemDto) => void;
};

/**
 * One problem of a live lesson (docs/spec/03-student-homework-lesson.md §1 L2 "Lesson item card"): the
 * result or verdict chip, the checking indicator or the time of the last submission, the statement, the
 * check's comment or failure, and the control that sends photos — visible only while the item can be
 * submitted.
 */
export function LessonItemCard({
  item,
  index,
  maxPhotos,
  uploading,
  uploadPercent,
  submitDisabled,
  submitError,
  onDismissSubmitError,
  waitSeconds,
  pickProblem,
  onDismissPickProblem,
  preparing,
  onSubmit,
}: LessonItemCardProps) {
  const styles = useStyles();
  const { dict, m, locale } = useI18n();
  const t = dict.student.lessonView;

  const submission = item.submission;
  const checking = isCheckRunning(submission?.status);
  const chip = lessonItemChip(item);
  const showSubmit = item.canSubmit || uploading;

  return (
    <Card style={styles.card} testID={`lesson-item-${item.number}`}>
      <View style={styles.head}>
        <Text
          variant="numberTitle"
          accessibilityRole="header"
          accessibilityLabel={format(m.studentWork.lesson.itemA11y, { index, number: item.number })}
          style={styles.title}
        >
          <Text variant="numberTitle" color="textMuted">
            {index}.{' '}
          </Text>
          {format(dict.topics.widgets.numberLabel, { number: item.number })}
        </Text>
        {chip?.kind === 'result' ? <Chip tone={RESULT_CHIP[chip.result]} label={t.results[chip.result]} /> : null}
        {chip?.kind === 'verdict' ? <Chip tone={VERDICT_CHIP[chip.verdict]} label={t.verdicts[chip.verdict]} /> : null}
      </View>

      <View style={styles.meta}>
        <Chip tone="muted" label={item.topicTitle} style={styles.topic} />
        {checking ? (
          <View style={styles.checking} accessible accessibilityLiveRegion="polite" accessibilityLabel={t.checking}>
            <Spinner size={14} />
            <Text variant="captionStrong" color="textMuted">
              {t.checking}
            </Text>
          </View>
        ) : submission ? (
          <Text variant="caption">{format(t.submittedAt, { time: formatClockTime(submission.submittedAt, locale) })}</Text>
        ) : null}
      </View>

      {item.conditionLatex ? <MathContent value={item.conditionLatex} testID={`lesson-condition-${item.number}`} /> : null}

      {submission && submission.status === 'DONE' && submission.comment ? (
        <Text variant="small" testID={`lesson-comment-${item.number}`}>
          {submission.comment}
        </Text>
      ) : null}

      {submission && submission.status === 'FAILED' ? (
        <Text variant="smallMedium" color="dangerText" accessibilityRole="alert" testID={`lesson-check-error-${item.number}`}>
          {checkErrorText(submission.errorCode, dict.student.checkErrors)}
        </Text>
      ) : null}

      {submitError ? (
        <View style={styles.notice}>
          <Notice
            tone="error"
            text={submitError}
            onDismiss={onDismissSubmitError}
            dismissLabel={m.common.actions.close}
            testID={`lesson-submit-error-${item.number}`}
          />
          <RetryWaitLine seconds={waitSeconds} />
        </View>
      ) : null}
      {pickProblem ? <PickProblemNotice problem={pickProblem} onDismiss={onDismissPickProblem} /> : null}

      {showSubmit ? (
        <View style={styles.submit}>
          <Button
            label={
              uploading
                ? t.uploading
                : preparing
                  ? m.common.photos.preparing
                  : format(submission ? t.resubmit : t.submit, { number: item.number })
            }
            accessibilityLabel={uploading || preparing ? undefined : format(t.submitAria, { number: item.number })}
            variant={submission ? 'outline' : 'primary'}
            leftIcon="camera"
            loading={uploading || preparing}
            disabled={submitDisabled}
            onPress={() => onSubmit(item)}
            fullWidth
            testID={`lesson-submit-${item.number}`}
          />
          {uploading ? (
            <ProgressBar
              value={uploadPercent}
              transition="linear"
              accessibilityLabel={format(m.studentWork.photos.uploadProgressA11y, { percent: uploadPercent })}
            />
          ) : (
            <Hint>
              <Text variant="hint">{format(t.upTo, { max: maxPhotos })}</Text>
            </Hint>
          )}
        </View>
      ) : null}
    </Card>
  );
}

const useStyles = makeStyles((t) => ({
  card: { gap: t.space.md },
  head: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: t.space.sm },
  title: { flexGrow: 1, flexShrink: 1, minWidth: 0 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: t.space.sm },
  topic: { flexShrink: 1 },
  checking: { flexDirection: 'row', alignItems: 'center', gap: t.space.xs },
  notice: { gap: t.space.xs },
  submit: { gap: t.space.sm },
}));
