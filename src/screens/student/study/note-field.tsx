import { View } from 'react-native';

import { RetryWaitLine } from '@/components/retry-wait';
import { format, useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { Notice, Text, TextArea, TextButton } from '@/ui';

import { NOTE_MAX_LENGTH } from './note-model';
import { useNoteEditor } from './use-note-editor';

export type NoteFieldProps = {
  homeworkNumberId: string;
  /** Recorded spelling of the problem number, for the accessible name. */
  number: string;
  /** The note the server has ("" when none). */
  serverNote: string;
  /** The field got the focus: the screen scrolls it above the keyboard. */
  onFocus?: () => void;
};

/**
 * The student's personal note (02 S3, §4.7): a two-line sticker, 240 characters at most, saved by itself —
 * on a typing pause, on blur and when the screen goes away. Clearing the text deletes the note. The field
 * has one name («Заметка») and the save state beside it; no placeholder and no explanation under it.
 * Mount it with `key={homeworkNumberId}`: the draft belongs to one problem.
 */
export function NoteField({ homeworkNumberId, number, serverNote, onFocus }: NoteFieldProps) {
  const styles = useStyles();
  const { dict, m } = useI18n();
  const t = dict.student.numberCard;
  const editor = useNoteEditor(homeworkNumberId, serverNote, t.noteSaveFailed);
  // The server's wait is the editor's own gate (a duration: a clock set back does not lengthen it), so
  // «Повторить» appears exactly when it can send.
  const wait = editor.error ? editor.waitSeconds : 0;

  if (editor.disabledByServer) return null;

  return (
    <View style={styles.root} testID="number-note">
      {editor.error ? (
        // The notice holds the server's text only, so its live region speaks it once; the countdown is a
        // plain line under it (a live region around a countdown makes TalkBack read every tick).
        <Notice
          tone="error"
          text={editor.error.message}
          action={
            // Never sent again by itself: the student decides, and only once a rate-limit wait is over.
            wait > 0 ? undefined : <TextButton label={m.common.actions.retry} tone="danger" onPress={editor.retry} testID="number-note-retry" />
          }
          testID="number-note-error"
          style={wait > 0 ? null : styles.notice}
        />
      ) : null}
      {editor.error ? <RetryWaitLine seconds={wait} testID="number-note-wait" style={styles.notice} /> : null}
      <View style={styles.head}>
        <Text variant="kickerSm">{t.note}</Text>
        {editor.status === 'saving' ? (
          <Text variant="captionMedium" color="textMuted" accessibilityLiveRegion="polite" testID="number-note-status">
            {t.saving}
          </Text>
        ) : editor.status === 'queued' || editor.status === 'retrying' ? (
          <Text variant="captionStrong" color="yellowText" accessibilityLiveRegion="polite" testID="number-note-status">
            {editor.status === 'queued' ? m.student.note.queued : m.student.note.retrying}
          </Text>
        ) : editor.status === 'saved' ? (
          <Text variant="captionStrong" color="greenText" accessibilityLiveRegion="polite" testID="number-note-status">
            {t.saved}
          </Text>
        ) : null}
      </View>
      <TextArea
        variant="note"
        value={editor.text}
        onChangeText={editor.onChangeText}
        onBlur={editor.flush}
        onFocus={onFocus}
        maxLength={NOTE_MAX_LENGTH}
        numberOfLines={2}
        accessibilityLabel={format(t.noteAria, { number })}
        testID="number-note-input"
      />
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  root: { gap: t.space.xs },
  notice: { marginBottom: t.space.sm },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: t.space.md, minHeight: 18 },
}));
