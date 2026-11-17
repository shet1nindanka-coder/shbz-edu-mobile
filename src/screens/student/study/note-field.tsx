import { View } from 'react-native';

import { useCountdown, useWaitText } from '@/components/retry-wait';
import { format, useI18n } from '@/i18n';
import { Hint } from '@/providers';
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
 * on a typing pause, on blur and when the screen goes away. Clearing the text deletes the note.
 * Mount it with `key={homeworkNumberId}`: the draft belongs to one problem.
 */
export function NoteField({ homeworkNumberId, number, serverNote, onFocus }: NoteFieldProps) {
  const styles = useStyles();
  const { dict, m } = useI18n();
  const waitText = useWaitText();
  const t = dict.student.numberCard;
  const editor = useNoteEditor(homeworkNumberId, serverNote, t.noteSaveFailed);
  const wait = useCountdown(editor.error?.retryAt ?? null);

  if (editor.disabledByServer) return null;

  const errorMessage = editor.error
    ? wait > 0
      ? `${editor.error.message} ${waitText.retryIn(wait)}`
      : editor.error.message
    : null;

  return (
    <View style={styles.root} testID="number-note">
      {errorMessage ? (
        <Notice
          tone="error"
          text={errorMessage}
          action={
            // Never sent again by itself: the student decides, and only once a rate-limit wait is over.
            wait > 0 ? undefined : <TextButton label={m.common.actions.retry} tone="danger" onPress={editor.retry} testID="number-note-retry" />
          }
          testID="number-note-error"
          style={styles.notice}
        />
      ) : null}
      <View style={styles.head}>
        <Text variant="kickerSm">{t.note}</Text>
        {editor.status === 'saving' ? (
          <Text variant="captionMedium" color="textMuted" accessibilityLiveRegion="polite" testID="number-note-status">
            {t.saving}
          </Text>
        ) : editor.status === 'queued' ? (
          <Text variant="captionStrong" color="yellowText" accessibilityLiveRegion="polite" testID="number-note-status">
            {m.student.note.queued}
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
        placeholder={t.notePlaceholder}
        accessibilityLabel={format(t.noteAria, { number })}
        testID="number-note-input"
      />
      {editor.status === 'queued' ? (
        <Hint>
          <Text variant="hint">{m.student.note.queuedHint}</Text>
        </Hint>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  root: { gap: t.space.xs },
  notice: { marginBottom: t.space.sm },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: t.space.md, minHeight: 18 },
}));
