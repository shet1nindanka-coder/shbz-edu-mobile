import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import type { LessonItemDto, LessonItemResult, SolutionVerdict } from '@/api/types';
import { MathContent } from '@/components/math';
import { checkErrorText } from '@/domain/solution-check-error-text';
import { format, useI18n } from '@/i18n';
import { Hint } from '@/providers';
import { makeStyles } from '@/theme';
import { Button, Card, Icon, Notice, ProgressBar, Spinner, Text } from '@/ui';

import { isCheckRunning, lessonItemChip } from './logic';
import { PickProblemNotice, type PickProblem } from './use-photo-source';

/** Only «перерешай» asks for attention; every other outcome is a plain caption (the tile carries the colour). */
const RESULT_ATTENTION: Record<LessonItemResult, boolean> = { SOLVED: false, PARTIAL: false, NOT_SOLVED: true, SKIPPED: false };
const VERDICT_ATTENTION: Record<SolutionVerdict, boolean> = { CORRECT: false, INCORRECT: true, UNCERTAIN: false };

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
  /** The camera / gallery could not give a photo for this item. */
  pickProblem: PickProblem | null;
  onDismissPickProblem: () => void;
  /** The photos for this item are being prepared. */
  preparing: boolean;
  onSubmit: (item: LessonItemDto) => void;
  /** Node on the right of the number: the time left until the end of the lesson. */
  aside?: ReactNode;
  /** Layout of the card in its container (a tablet panel stretches it). */
  style?: StyleProp<ViewStyle>;
};

/**
 * The card of the current problem of a live lesson (docs/spec/03-student-homework-lesson.md §1 L2 "Lesson
 * item card"; layout: docs/design/glass-over-paper.md §8, §1a): the number with the time left, at most one
 * caption — the outcome in a word or the running check — the statement, the check's remark, and the one
 * main action of the screen: «Сдать фото». The topic and the number in the button are said to a screen
 * reader only. The control is visible only while the item can be submitted.
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
  pickProblem,
  onDismissPickProblem,
  preparing,
  onSubmit,
  aside,
  style,
}: LessonItemCardProps) {
  const styles = useStyles();
  const { dict, m } = useI18n();
  const t = dict.student.lessonView;

  const submission = item.submission;
  const checking = isCheckRunning(submission?.status);
  const chip = lessonItemChip(item);
  const showSubmit = item.canSubmit || uploading;

  const outcome = chip?.kind === 'result' ? t.results[chip.result] : chip?.kind === 'verdict' ? t.verdicts[chip.verdict] : null;
  const attention = chip?.kind === 'result' ? RESULT_ATTENTION[chip.result] : chip?.kind === 'verdict' ? VERDICT_ATTENTION[chip.verdict] : false;
  const remark = submission && submission.status === 'DONE' ? submission.comment : null;

  return (
    <Card style={[styles.card, style]} testID={`lesson-item-${item.number}`}>
      <View style={styles.head}>
        <Text
          variant="sectionTitle"
          tabular
          accessibilityRole="header"
          accessibilityLabel={`${format(m.studentWork.lesson.itemA11y, { index, number: item.number })}, ${item.topicTitle}`}
          style={styles.title}
        >
          {item.number}
        </Text>
        {aside}
      </View>

      {checking ? (
        <View style={[styles.meta, styles.checking]} accessible accessibilityLiveRegion="polite" accessibilityLabel={t.checking}>
          <Spinner size={14} />
          <Text variant="small" color="textMuted">
            {t.checking}
          </Text>
        </View>
      ) : outcome ? (
        <Text variant="small" color={attention ? 'redText' : 'textMuted'} style={styles.meta} testID={`lesson-outcome-${item.number}`}>
          {outcome}
        </Text>
      ) : null}

      {item.conditionLatex ? <MathContent value={item.conditionLatex} testID={`lesson-condition-${item.number}`} /> : null}

      {remark ? (
        <View style={styles.remark}>
          {attention ? <Icon name="close" size={16} color="redText" /> : null}
          <Text variant="small" color={attention ? 'redText' : 'label'} style={styles.remarkText} testID={`lesson-comment-${item.number}`}>
            {remark}
          </Text>
        </View>
      ) : null}

      {submission && submission.status === 'FAILED' ? (
        <Text variant="smallMedium" color="dangerText" accessibilityRole="alert" testID={`lesson-check-error-${item.number}`}>
          {checkErrorText(submission.errorCode, dict.student.checkErrors)}
        </Text>
      ) : null}

      {/* The server's text only: the cool-down that locks every card is told once, in the lesson header. */}
      {submitError ? (
        <Notice
          tone="error"
          text={submitError}
          onDismiss={onDismissSubmitError}
          dismissLabel={m.common.actions.close}
          testID={`lesson-submit-error-${item.number}`}
        />
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
                  : submission
                    ? m.studentWork.lesson.resubmit
                    : m.studentWork.lesson.submit
            }
            // The card is of one number, so the button does not repeat it; a screen reader hears it.
            accessibilityLabel={uploading || preparing ? undefined : format(submission ? t.resubmit : t.submitAria, { number: item.number })}
            size="lg"
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
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: t.space.md },
  title: { flexShrink: 1, minWidth: 0 },
  // The one caption sits right under the number.
  meta: { marginTop: -t.space.sm },
  checking: { flexDirection: 'row', alignItems: 'center', gap: t.space.xxs },
  remark: { flexDirection: 'row', alignItems: 'flex-start', gap: t.space.sm },
  remarkText: { flex: 1, minWidth: 0 },
  submit: { gap: t.space.sm },
}));
