import { useState } from 'react';
import { View } from 'react-native';

import type { HomeworkNumberStatus, TeacherHomeworkCheckResult, TeacherHomeworkNumber } from '@/api/types';
import { statusLabel } from '@/components/numbers';
import { format, useI18n } from '@/i18n';
import { makeStyles, useTheme } from '@/theme';
import { PressableScale, Text, useStatusAnnouncement } from '@/ui';

import { StatusMarks } from './status-marks';

export type ReviewNumberRowProps = {
  /** The number with its current colour (an in-flight mark already applied). */
  number: TeacherHomeworkNumber;
  /** Verdict of the latest finished check for this number, if it has one. */
  result: TeacherHomeworkCheckResult | undefined;
  /** This number's status request is in flight. */
  saving: boolean;
  /** Status writes are cooling down after a refusal that named a wait. */
  blocked: boolean;
  /** Why the last status save failed. */
  error?: string;
  /** Hairline under the row. */
  divider: boolean;
  /** The number's sheet is open over the row: it has the same marks and speaks a refused one itself. */
  sheetOpen: boolean;
  onStatus: (status: HomeworkNumberStatus | null) => void;
  /** Tap on the number: its details open in a sheet. */
  onOpen: () => void;
};

/**
 * One number that waits for the teacher (`.row` of the review mockups): the number, ONE word — the AI's
 * verdict («ошибка» in red), else nothing — and the three status marks on the right; the filled mark is the
 * current status. What the AI wrote, the student's note and the statement are in the number's sheet, which
 * the texts open, and in the row's accessibility label (docs/design/glass-over-paper.md §1a). The marks are
 * the texts' sibling, so each has its own touch target.
 */
export function ReviewNumberRow({ number, result, saving, blocked, error, divider, sheetOpen, onStatus, onOpen }: ReviewNumberRowProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { dict, m } = useI18n();
  // A refused mark appears under the row without moving the focus: screen readers have to be told. While
  // the number's sheet is open over the row, the sheet tells them (`ReviewNumberCard`): the row must not say
  // the same refusal a second time — neither then, nor when the sheet leaves and the text is still here.
  const [saidBySheet, setSaidBySheet] = useState<string | undefined>(undefined);
  const heard = sheetOpen ? error : error === undefined ? undefined : saidBySheet;
  if (heard !== saidBySheet) setSaidBySheet(heard);
  useStatusAnnouncement(error, !sheetOpen && error !== heard);
  const t = dict.students.review;
  const comment = result?.comment?.trim() ?? '';
  // Spoken: what the AI said about the number. A verdict it could not reach leads the line — its comment
  // alone («Верно.») would read as a verdict.
  const verdict = result ? t.verdict[result.verdict].chip : '';
  const said = result ? (comment && result.verdict !== 'UNCERTAIN' ? comment : [verdict, comment].filter(Boolean).join(' · ')) : '';
  const spoken = said || number.note.trim() || statusLabel(number.status, m.common.statuses);
  // Shown: the verdict in one word.
  const caption = result ? t.verdict[result.verdict].short : '';

  return (
    <View style={[styles.row, divider ? styles.divider : null]} testID={`review-number-${number.homeworkNumberId}`}>
      <View style={styles.line}>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={`${format(t.number, { n: number.number })}. ${spoken}`}
          accessibilityHint={format(m.teacher.review.showConditionOf, { n: number.number })}
          onPress={onOpen}
          scaleTo={1}
          pressedStyle={styles.pressed}
          testID={`review-number-open-${number.homeworkNumberId}`}
          style={theme.tablet ? styles.textsWide : styles.texts}
        >
          <Text variant="bodyBold" tabular numberOfLines={1} style={theme.tablet ? styles.numberWide : null}>
            {number.number}
          </Text>
          {caption ? (
            <Text variant="small" color={result?.verdict === 'INCORRECT' ? 'redText' : 'textMuted'} numberOfLines={1} style={styles.caption}>
              {caption}
            </Text>
          ) : null}
        </PressableScale>
        <StatusMarks
          accessibilityLabel={format(m.teacher.review.statusAria, { n: number.number })}
          value={number.status}
          onChange={onStatus}
          disabled={saving || blocked}
          testID={`review-number-status-${number.homeworkNumberId}`}
        />
      </View>
      {error ? (
        <Text variant="captionStrong" color="dangerText" accessibilityRole="alert" testID={`review-number-row-error-${number.homeworkNumberId}`}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  row: { minHeight: t.sizes.row, justifyContent: 'center', gap: t.space.xxs, paddingVertical: t.space.sm },
  divider: { borderBottomWidth: t.borders.hairline, borderBottomColor: t.colors.rowBorder },
  line: { flexDirection: 'row', alignItems: 'center', gap: t.space.md },
  texts: { flex: 1, minWidth: 0, minHeight: t.sizes.minTouch, justifyContent: 'center', gap: t.space.xxxs },
  // A tablet has the room for one line: the number in its own column, then the caption.
  textsWide: { flex: 1, minWidth: 0, minHeight: t.sizes.minTouch, flexDirection: 'row', alignItems: 'center', gap: t.space.lg },
  numberWide: { flexShrink: 0, minWidth: t.sizes.row },
  caption: { flexShrink: 1 },
  pressed: { opacity: 0.6 },
}));
