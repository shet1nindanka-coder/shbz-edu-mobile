import { View } from 'react-native';

import type { LessonBoardSubmission } from '@/api/types';
import { PhotoThumb } from '@/components/files';
import { formatDateTime } from '@/domain/dates';
import { format, useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { Chip, Spinner, Text } from '@/ui';

import { minutesAgo } from './board-logic';

export type SubmissionInfoProps = {
  submission: LessonBoardSubmission;
  /** Minutes the student spent on this problem; unknown for a lesson without a start time. */
  spentMinutes?: number;
  /** The board's ticking clock (epoch ms). */
  now: number;
  /** The lesson is running: "N min ago" is what matters. Otherwise the moment itself is shown. */
  live: boolean;
  /** Opens the photos of the submission full screen at `index`. */
  onOpenPhoto: (index: number) => void;
  /** «№ 215»: every row has photos, so their names carry the number. */
  numberLabel?: string;
  testID?: string;
};

const PHOTO_SIZE = 56;

/**
 * The latest submission of a lesson item (docs/spec/05-teacher-lessons-plans.md §1.3 "Submission info
 * line"): when it was sent and how long the problem took, the check state, the teacher-only flags and
 * the photos. Correct / incorrect verdicts set the result automatically, so only "not recognised" and
 * the instruction-text flag are spelled out.
 */
export function SubmissionInfo({ submission, spentMinutes, now, live, onOpenPhoto, numberLabel, testID }: SubmissionInfoProps) {
  const styles = useStyles();
  const { dict, locale } = useI18n();
  const t = dict.planner.lessonBoard;
  const checking = submission.status === 'PENDING' || submission.status === 'CHECKING';
  const ago = minutesAgo(submission.submittedAt, now);
  // SPEC-GAP: the site always prints "N min ago" and keeps the absolute time in a hover tooltip. A phone
  // has no hover, and «сдал 4826 мин назад» on a lesson of last week says nothing — outside a running
  // lesson the line carries the tooltip's value (the moment of the submission, Moscow time).
  const when = live ? (ago === 0 ? t.justNow : format(t.minutesAgo, { n: ago })) : formatDateTime(submission.submittedAt, locale);
  const submitted = format(t.submittedAgo, { ago: when });
  const injection =
    submission.status === 'DONE' && submission.injectionSuspected
      ? `${t.injectionSuspected}${submission.injectionNote ? `: ${submission.injectionNote}` : ''} — ${t.injectionCheckYourself}`
      : null;

  return (
    <View style={styles.block} testID={testID}>
      {checking ? (
        <View accessibilityRole="progressbar" accessibilityLabel={t.checking} style={styles.checking}>
          <Spinner size={14} color="accentSolid" />
          <Text variant="captionStrong" color="textMuted">
            {t.checking}
          </Text>
        </View>
      ) : (
        <Text variant="caption" color="textSoft" tabular>
          {typeof spentMinutes === 'number' ? `${submitted} · ${format(t.minutesOnNumber, { n: spentMinutes })}` : submitted}
        </Text>
      )}
      {submission.status === 'FAILED' ? (
        <Text variant="captionStrong" color="dangerText">
          {t.checkFailed}
        </Text>
      ) : null}
      {submission.status === 'DONE' && submission.verdict === 'UNCERTAIN' ? <Chip tone="muted" label={t.uncertain} /> : null}
      {injection ? (
        // Teacher-only: the model found an instruction to the checker on the photo. The verdict is untouched.
        <View accessible accessibilityLabel={injection} style={styles.injection}>
          <Text variant="captionStrong" color="dangerText">
            {injection}
          </Text>
        </View>
      ) : null}
      {submission.photoFileIds.length > 0 ? (
        <View style={styles.photos}>
          {submission.photoFileIds.map((fileId, index) => (
            // «Открыть фото 1 из 2, № 215»: the place in the set and the number (no file name is known here).
            <PhotoThumb
              key={fileId}
              fileId={fileId}
              name={numberLabel}
              position={{ index, total: submission.photoFileIds.length }}
              size={PHOTO_SIZE}
              onPress={() => onOpenPhoto(index)}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  block: { gap: t.space.xs, alignItems: 'flex-start' },
  checking: { flexDirection: 'row', alignItems: 'center', gap: t.space.xs },
  injection: {
    alignSelf: 'stretch',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: t.radii.sm,
    backgroundColor: t.colors.tabHover,
  },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.xs, paddingTop: 2 },
}));
