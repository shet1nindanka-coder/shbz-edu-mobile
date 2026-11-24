import { useMemo, useState } from 'react';
import { View } from 'react-native';

import type { HomeworkNumberStatus, TeacherHomeworkAssignment, TeacherHomeworkCheck } from '@/api/types';
import { PhotoThumb } from '@/components/files';
import { RetryWaitLine } from '@/components/retry-wait';
import { formatMsk } from '@/domain/dates';
import { format, useI18n } from '@/i18n';
import { makeStyles, useTheme } from '@/theme';
import { Button, Icon, Notice, PressableScale, Text, TextButton } from '@/ui';

import { ReviewCheckHistory } from './review-check-history';
import { ReviewInjectionBanner } from './review-injection-banner';
import { acceptVerdictChanges, canAcceptVerdicts, injectionResults, latestDoneCheck, numbersToCheck, verdictsByNumber } from './review-logic';
import { ReviewNumberRow } from './review-number-row';

export type ReviewHomeworkProps = {
  /** The homework with the in-flight colours applied. */
  assignment: TeacherHomeworkAssignment;
  lessonMode: boolean;
  savingIds: readonly string[];
  numberErrors: Record<string, string>;
  /** Status writes are cooling down; `waitSeconds` says for how long. */
  blocked: boolean;
  waitSeconds: number;
  /** Why the last "accept" / "undo" of this homework failed. */
  error?: string;
  /** The "accept AI verdicts" batch of this homework is in flight. */
  accepting: boolean;
  /** The number of this homework whose sheet is open over the review, if any: its row leaves the talking to the sheet. */
  sheetNumberId: string | null;
  /** «Отменить ДЗ» under the body (a phone card); a tablet panel shows it next to the title instead. */
  cancelBelow: boolean;
  onDismissError: () => void;
  onStatus: (homeworkNumberId: string, status: HomeworkNumberStatus | null) => void;
  onAccept: () => void;
  onCancel: () => void;
  /** A number row was pressed: its details open in the sheet. */
  onOpenNumber: (homeworkNumberId: string) => void;
  /** «Все номера»: every number of the homework, grouped by status, in the sheet. */
  onOpenAll: () => void;
  onOpenPending: (index: number) => void;
  onOpenCheckPhoto: (check: TeacherHomeworkCheck, index: number) => void;
};

/** Rows shown before «Показать ещё»: a check that flags a whole homework must not grow the screen. */
const ROWS_COLLAPSED = 8;

/**
 * The review of one homework (docs/spec/04-teacher-students.md S4; layout: the `PT-student` / `T-student`
 * mockups; texts: docs/design/glass-over-paper.md §1a): a row per number that waits for the teacher — the
 * number, the AI's verdict in a word and the three status marks — under one line with «Принять» ("accept
 * AI verdicts") and the way to «Все номера»; below, the photos that wait for a check and the check
 * history. The phone card and the tablet panel both render it. How many numbers wait is the red counter of
 * the homework's head, so the list has no «Нужно проверить · N» heading; the notes of the site («Ученик
 * пока не прикрепил фото», the caption of the photos, the "what accept does" line) are accessibility
 * labels and hints only.
 */
export function ReviewHomework({
  assignment,
  lessonMode,
  savingIds,
  numberErrors,
  blocked,
  waitSeconds,
  error,
  accepting,
  sheetNumberId,
  cancelBelow,
  onDismissError,
  onStatus,
  onAccept,
  onCancel,
  onOpenNumber,
  onOpenAll,
  onOpenPending,
  onOpenCheckPhoto,
}: ReviewHomeworkProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { dict, m, locale } = useI18n();
  const t = dict.students.review;

  const latestDone = latestDoneCheck(assignment.checks);
  const verdicts = verdictsByNumber(latestDone);
  const injections = lessonMode ? [] : injectionResults(latestDone);
  const lastChecked = formatMsk(latestDone?.checkedAt, 'dateTime', locale);
  const pendingChanges = canAcceptVerdicts(latestDone) ? acceptVerdictChanges(assignment).length : 0;
  const busy = assignment.numbers.some((number) => savingIds.includes(number.homeworkNumberId));

  // A number stays in the list after the teacher has marked it — it must not jump away from under the
  // finger; the list is rebuilt when the homework is opened again.
  const waiting = useMemo(() => numbersToCheck(assignment), [assignment]);
  const [kept, setKept] = useState<readonly string[]>(waiting);
  const added = waiting.filter((id) => !kept.includes(id));
  if (added.length > 0) setKept([...kept, ...added]);
  const [showAll, setShowAll] = useState(false);
  const listed = assignment.numbers.filter((number) => kept.includes(number.homeworkNumberId));
  const rows = showAll ? listed : listed.slice(0, ROWS_COLLAPSED);

  return (
    <View style={styles.body}>
      {injections.length > 0 ? <ReviewInjectionBanner results={injections} testID={`review-injection-${assignment.id}`} /> : null}
      {error ? (
        <Notice tone="error" text={error} onDismiss={onDismissError} dismissLabel={m.common.actions.close} testID={`review-assignment-error-${assignment.id}`} />
      ) : null}
      {/* Outside the error: the notice can be closed, and a refused number mark locks this homework too. */}
      <RetryWaitLine seconds={waitSeconds} testID={`review-wait-${assignment.id}`} />

      <View>
        <View style={styles.listHead}>
          {/* Rows the teacher has just marked stay listed (`kept`): the line is for a list with no rows. */}
          {listed.length === 0 ? (
            <Text variant="small" color="textMuted" style={styles.listTitle} testID={`review-to-check-${assignment.id}`}>
              {m.teacher.review.nothingToCheck}
            </Text>
          ) : canAcceptVerdicts(latestDone) ? (
            <Button
              label={m.teacher.review.accept}
              accessibilityLabel={t.acceptVerdicts}
              // What "accept" does to the colours: the site's hint line, heard on demand.
              accessibilityHint={t.acceptVerdictsHint}
              variant="outline"
              size="sm"
              leftIcon="sparkles"
              loading={accepting}
              // Nothing to change: every definite verdict already matches the number's colour.
              disabled={pendingChanges === 0 || busy || blocked}
              onPress={onAccept}
              testID={`review-accept-${assignment.id}`}
            />
          ) : (
            <View />
          )}
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={m.common.numbers.all}
            onPress={onOpenAll}
            scaleTo={1}
            hitSlop={{ top: theme.space.md, bottom: theme.space.md, left: theme.space.sm, right: theme.space.sm }}
            pressedStyle={styles.pressed}
            testID={`review-all-numbers-${assignment.id}`}
            style={styles.all}
          >
            <Text variant="buttonSm" color="accentSolid">
              {m.common.numbers.all}
            </Text>
            <Icon name="chevronRight" size={theme.sizes.icon.sm} color="accentSolid" />
          </PressableScale>
        </View>
        {rows.map((number, index) => (
          <ReviewNumberRow
            key={number.homeworkNumberId}
            number={number}
            result={verdicts.get(number.number)}
            saving={savingIds.includes(number.homeworkNumberId)}
            blocked={blocked}
            error={numberErrors[number.homeworkNumberId]}
            divider={index < rows.length - 1}
            sheetOpen={sheetNumberId === number.homeworkNumberId}
            onStatus={(status) => onStatus(number.homeworkNumberId, status)}
            onOpen={() => onOpenNumber(number.homeworkNumberId)}
          />
        ))}
        {listed.length > rows.length ? (
          <TextButton label={m.common.actions.showMore} onPress={() => setShowAll(true)} testID={`review-more-${assignment.id}`} style={styles.link} />
        ) : null}
      </View>

      {assignment.photos.length > 0 ? (
        // The photos speak for themselves; what they are («ещё не отправленные на проверку») is spoken.
        <View
          accessibilityLabel={`${format(t.photosTitle, { n: assignment.photos.length })}${lastChecked ? format(t.lastAutoCheck, { date: lastChecked }) : ''}`}
          style={styles.photos}
        >
          {assignment.photos.map((photo, index) => (
            <PhotoThumb
              key={photo.id}
              fileId={photo.fileId}
              name={photo.originalName}
              size={theme.sizes.control.lg}
              onPress={() => onOpenPending(index)}
              testID={`review-photo-${photo.id}`}
            />
          ))}
        </View>
      ) : null}

      <ReviewCheckHistory checks={assignment.checks} currentId={latestDone?.id ?? null} onOpenPhoto={onOpenCheckPhoto} testID={`review-history-${assignment.id}`} />

      {cancelBelow ? (
        <TextButton label={t.cancelLabel} tone="danger" onPress={onCancel} testID={`review-cancel-${assignment.id}`} style={styles.link} />
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  body: { gap: t.space.md },
  listHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: t.space.md, minHeight: t.sizes.control.sm },
  listTitle: { flexShrink: 1 },
  all: { flexDirection: 'row', alignItems: 'center', gap: t.space.xxs, minHeight: t.sizes.control.sm },
  pressed: { opacity: 0.6 },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.sm },
  link: { alignSelf: 'flex-start' },
}));
