import { NumberStatusMark } from '@/components/numbers';
import { View } from 'react-native';

import type { StudentHomeworkNumberDto } from '@/api/types';
import { MathContent } from '@/components/math';
import { RetryWaitLine } from '@/components/retry-wait';
import { homeworkStatusLabel } from '@/domain/statuses';
import { format, useI18n } from '@/i18n';
import { Hint } from '@/providers';
import { makeStyles } from '@/theme';
import { Card, Notice, Text, TextArea, TextButton } from '@/ui';

import { useNoteEditor } from '../study/use-note-editor';

export type HomeworkNumberCardProps = {
  number: StudentHomeworkNumberDto;
  /** false only when the server has no notes column. */
  notesEnabled: boolean;
  /** `limits.noteMaxLength` (240). */
  noteMaxLength: number;
  /** The card «Перерешать № N» has just scrolled to: accent ring for a moment. */
  highlighted: boolean;
};

/**
 * One problem of a homework (docs/spec/03-student-homework-lesson.md §1 H2.c): the number with its
 * read-only status mark (a label only for «нужна помощь»), the statement and the student's own note with
 * autosave — a field with one name, no placeholder. The reference answer is never
 * sent to a student. The note uses the same editor as the number screen (the site renders both with one
 * component): a refused save stays unsaved and is sent again on blur, on «Повторить» and when the card
 * goes away; saves are sent one at a time.
 */
export function HomeworkNumberCard({ number, notesEnabled, noteMaxLength, highlighted }: HomeworkNumberCardProps) {
  const styles = useStyles();
  const { dict, m } = useI18n();
  const t = dict.student.numberCard;
  const note = useNoteEditor(number.homeworkNumberId, number.note, t.noteSaveFailed);
  // The server's wait is the editor's own gate (a duration: a clock set back does not lengthen it), so
  // «Повторить» appears exactly when it can send.
  const wait = note.error ? note.waitSeconds : 0;

  const statusLine =
    note.status === 'saving'
      ? t.saving
      : note.status === 'queued'
        ? m.student.note.queued
        : note.status === 'retrying'
          ? m.student.note.retrying
          : note.status === 'saved'
            ? t.saved
            : null;

  return (
    <Card selected={highlighted} style={styles.card} testID={`number-card-${number.number}`}>
      {note.error ? (
        // The notice holds the server's text only, so its live region speaks it once; the countdown is a
        // plain line under it (a live region around a countdown makes TalkBack read every tick).
        <Notice
          tone="error"
          text={note.error.message}
          action={
            // Never sent again by itself: the student decides, and only once a rate-limit wait is over.
            wait > 0 ? undefined : (
              <TextButton
                label={m.common.actions.retry}
                accessibilityLabel={format(m.studentWork.homework.noteRetryA11y, { number: number.number })}
                tone="danger"
                onPress={note.retry}
                testID={`number-note-retry-${number.number}`}
              />
            )
          }
          testID={`number-note-error-${number.number}`}
        />
      ) : null}
      {note.error ? <RetryWaitLine seconds={wait} testID={`number-note-wait-${number.number}`} /> : null}

      <View style={styles.head}>
        <Text
          variant="sectionTitle"
          tabular
          accessibilityRole="header"
          accessibilityLabel={`${format(t.title, { number: number.number })}, ${homeworkStatusLabel(number.status, dict)}`}
          style={styles.title}
        >
          {number.number}
        </Text>
        {/* The status is read-only for a student: it is set by the check or by the teacher. */}
        <NumberStatusMark status={number.status} />
      </View>
      <Hint>
        <Text variant="hint">{t.statusHint}</Text>
      </Hint>

      {number.conditionLatex ? (
        // `MathContent` draws the soft panel of a statement itself.
        <MathContent value={number.conditionLatex} testID={`number-condition-${number.number}`} />
      ) : null}

      {notesEnabled && !note.disabledByServer ? (
        <TextArea
          variant="note"
          label={t.note}
          labelAside={
            statusLine ? (
              <Text variant="captionMedium" accessibilityLiveRegion="polite" testID={`number-note-status-${number.number}`}>
                {statusLine}
              </Text>
            ) : undefined
          }
          value={note.text}
          onChangeText={note.onChangeText}
          onBlur={note.flush}
          maxLength={noteMaxLength}
          accessibilityLabel={format(t.noteAria, { number: number.number })}
          testID={`number-note-${number.number}`}
        />
      ) : null}
    </Card>
  );
}

const useStyles = makeStyles((t) => ({
  card: { gap: t.space.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: t.space.md },
  title: { flex: 1, minWidth: 0 },
}));
