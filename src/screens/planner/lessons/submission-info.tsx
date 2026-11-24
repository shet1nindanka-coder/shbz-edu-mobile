import { View } from 'react-native';

import type { LessonBoardSubmission } from '@/api/types';
import { PhotoThumb } from '@/components/files';
import { format, useI18n } from '@/i18n';
import { makeStyles, useTheme } from '@/theme';
import { Icon, Spinner, Text } from '@/ui';

import { rowDateTime } from '../shared/row-date';
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
  /** «№ 215»: every number has photos, so their names carry the number. */
  numberLabel?: string;
  testID?: string;
};

/**
 * The latest submission of a lesson item (docs/spec/05-teacher-lessons-plans.md §1.3 "Submission info
 * line"; layout: mockup `T-board`): the photos, and next to them when it was sent, how long the problem
 * took (a clock and the minutes), the check state and the teacher-only remarks. Correct / incorrect
 * verdicts set the result automatically, so only "not recognised" and the instruction-text flag are spelled
 * out — in red, because the number then waits for the teacher. The site's words around the figures («сдал
 * …», «… на номер») stay in the accessible names.
 */
export function SubmissionInfo({ submission, spentMinutes, now, live, onOpenPhoto, numberLabel, testID }: SubmissionInfoProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { dict, locale } = useI18n();
  const t = dict.planner.lessonBoard;
  const checking = submission.status === 'PENDING' || submission.status === 'CHECKING';
  const ago = minutesAgo(submission.submittedAt, now);
  // SPEC-GAP: the site always prints "N min ago" and keeps the absolute time in a hover tooltip. A phone
  // has no hover, and «сдал 4826 мин назад» on a lesson of last week says nothing — outside a running
  // lesson the line carries the tooltip's value (the moment of the submission, Moscow time).
  const when = live ? (ago === 0 ? t.justNow : format(t.minutesAgo, { n: ago })) : rowDateTime(submission.submittedAt, now, locale);
  const injection =
    submission.status === 'DONE' && submission.injectionSuspected
      ? `${t.injectionSuspected}${submission.injectionNote ? `: ${submission.injectionNote}` : ''} — ${t.injectionCheckYourself}`
      : null;

  return (
    <View style={styles.block} testID={testID}>
      {submission.photoFileIds.length > 0 ? (
        <View style={styles.photos}>
          {submission.photoFileIds.map((fileId, index) => (
            // «Открыть фото 1 из 2, № 215»: the place in the set and the number (no file name is known here).
            <PhotoThumb
              key={fileId}
              fileId={fileId}
              name={numberLabel}
              position={{ index, total: submission.photoFileIds.length }}
              size={theme.sizes.control.lg}
              onPress={() => onOpenPhoto(index)}
            />
          ))}
        </View>
      ) : null}
      <View style={styles.texts}>
        {checking ? (
          // The spinner next to the photo is the whole message; the word is for a screen reader.
          <View accessible accessibilityRole="progressbar" accessibilityLabel={t.checking} style={styles.line}>
            <Spinner size={theme.sizes.icon.sm} color="accentSolid" />
          </View>
        ) : (
          <View style={styles.line}>
            <Text variant="small" color="textMuted" tabular accessibilityLabel={format(t.submittedAgo, { ago: when })}>
              {when}
            </Text>
            {typeof spentMinutes === 'number' ? (
              <View accessible accessibilityLabel={format(t.minutesOnNumber, { n: spentMinutes })} style={styles.spent}>
                <Icon name="clock" size={theme.sizes.icon.sm} color="textMuted" />
                <Text variant="small" color="textMuted" tabular>
                  {format(dict.planner.common.minutesShort, { n: spentMinutes })}
                </Text>
              </View>
            ) : null}
          </View>
        )}
        {submission.status === 'FAILED' ? (
          <Text variant="small" color="redText">
            {t.checkFailed}
          </Text>
        ) : null}
        {submission.status === 'DONE' && submission.verdict === 'UNCERTAIN' ? (
          <Text variant="small" color="redText">
            {t.uncertain}
          </Text>
        ) : null}
        {injection ? (
          // Teacher-only: the model found an instruction to the checker on the photo. The verdict is untouched.
          <Text variant="small" color="redText">
            {injection}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  block: { flexDirection: 'row', alignItems: 'center', gap: t.space.md },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.xs, flexShrink: 0, maxWidth: '60%' },
  texts: { flex: 1, minWidth: 0, gap: t.space.xxxs },
  line: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: t.space.md, rowGap: t.space.xxxs },
  spent: { flexDirection: 'row', alignItems: 'center', gap: t.space.xxs },
}));
