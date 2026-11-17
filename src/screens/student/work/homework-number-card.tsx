import { View } from 'react-native';

import type { StudentHomeworkNumberDto } from '@/api/types';
import { MathContent } from '@/components/math';
import { useCountdown, useWaitText } from '@/components/retry-wait';
import { homeworkStatusShortLabel } from '@/domain/statuses';
import { format, useI18n } from '@/i18n';
import { Hint } from '@/providers';
import { makeStyles } from '@/theme';
import { Card, Notice, StatusBadge, Text, TextArea, TextButton } from '@/ui';

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
 * One problem of a homework (docs/spec/03-student-homework-lesson.md §1 H2.c): title with the read-only
 * status badge, the statement and the student's own note with autosave. The reference answer is never
 * sent to a student. The note uses the same editor as the number screen (the site renders both with one
 * component): a refused save stays unsaved and is sent again on blur, on «Повторить» and when the card
 * goes away; saves are sent one at a time.
 */
export function HomeworkNumberCard({ number, notesEnabled, noteMaxLength, highlighted }: HomeworkNumberCardProps) {
  const styles = useStyles();
  const { dict, m } = useI18n();
  const t = dict.student.numberCard;
  const waitText = useWaitText();
  const note = useNoteEditor(number.homeworkNumberId, number.note, t.noteSaveFailed);
  const wait = useCountdown(note.error?.retryAt ?? null);
  const errorMessage = note.error ? (wait > 0 ? `${note.error.message} ${waitText.retryIn(wait)}` : note.error.message) : null;

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
    <Card variant="outline" padded={16} selected={highlighted} style={styles.card} testID={`number-card-${number.number}`}>
      {errorMessage ? (
        <Notice
          tone="error"
          text={errorMessage}
          action={
            // Never sent again by itself: the student decides, and only once a rate-limit wait is over.
            wait > 0 ? undefined : (
              <TextButton
                label={m.common.actions.retry}
                tone="danger"
                onPress={note.retry}
                testID={`number-note-retry-${number.number}`}
              />
            )
          }
          testID={`number-note-error-${number.number}`}
        />
      ) : null}

      <View style={styles.head}>
        <Text variant="numberTitle" accessibilityRole="header" style={styles.title}>
          {format(t.title, { number: number.number })}
        </Text>
        <StatusBadge status={number.status} label={homeworkStatusShortLabel(number.status, dict)} />
      </View>
      <Hint>
        <Text variant="hint">{t.statusHint}</Text>
      </Hint>

      {number.conditionLatex ? (
        <View style={styles.section}>
          <Text variant="cardKicker">{t.condition}</Text>
          <MathContent value={number.conditionLatex} testID={`number-condition-${number.number}`} />
        </View>
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
          placeholder={t.notePlaceholder}
          accessibilityLabel={format(t.noteAria, { number: number.number })}
          testID={`number-note-${number.number}`}
        />
      ) : null}
    </Card>
  );
}

const useStyles = makeStyles((t) => ({
  card: { gap: t.space.sm },
  head: { flexDirection: 'row', alignItems: 'center', gap: t.space.md },
  title: { flex: 1, minWidth: 0 },
  section: { gap: t.space.xs },
}));
