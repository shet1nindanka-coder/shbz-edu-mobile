import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';

import { errorText, isNotFoundError, qk, useApi } from '@/api';
import { MathPreview } from '@/components/math';
import { RetryWaitLine, useRetryWait } from '@/components/retry-wait';
import { format, useI18n } from '@/i18n';
import { makeStyles, useTheme } from '@/theme';
import { Button, Dialog, IconButton, Notice, TextArea } from '@/ui';

import { canSaveLatexDraft, hasLatex } from '../shared/number-fill-status';

/** What an unnamed empty field takes — a format name, the same in every language. */
const FORMAT_PLACEHOLDER = 'LaTeX';

export type LatexEditorBlockProps = {
  /** Which value of the number this block edits. */
  kind: 'condition' | 'answer';
  homeworkNumberId: string;
  /** Recorded spelling of the number, for the confirm dialog title. */
  number: string;
  /** The value the server holds now. */
  saved: string | null;
  /** The server accepted a save (the stored string) or a delete (`null`). */
  onChanged: (value: string | null) => void;
  /**
   * The block shares the screen with the other value's editor (tablet panels): its save is an ordinary
   * button then — a screen has one gradient action.
   */
  secondary?: boolean;
  /**
   * Name the field («Условие» / «Ответ»). A phone shows one editor under the switch that already names
   * it; a tablet shows the two side by side and each needs its name.
   */
  named?: boolean;
};

/**
 * LaTeX editor of one value of a number (site: one panel of `TeacherSingleNumberCard`,
 * docs/spec/07-developer-content.md §1.4b, §4.9; text: docs/design/glass-over-paper.md §1a): a saved
 * value and a draft. «Сохранить» is offered when the draft is non-blank and differs from the saved
 * value; the trash mark only when a saved value exists; the «вернуть» mark only while the draft differs.
 * Unlike the site's card the preview follows the DRAFT — the spec's phone mapping asks for it — and it
 * needs no caption: it is the rendered card right under the field.
 * Rendered inside a card (a `Panel` of the number screen): the block brings no surface of its own.
 */
export function LatexEditorBlock({ kind, homeworkNumberId, number, saved, onChanged, secondary = false, named = false }: LatexEditorBlockProps) {
  const styles = useStyles();
  const theme = useTheme();
  const api = useApi();
  const queryClient = useQueryClient();
  const { dict, m } = useI18n();
  const single = dict.topics.singleNumber;
  const manager = dict.topics.answerManager;
  const isCondition = kind === 'condition';
  const texts = isCondition
    ? {
        name: dict.topics.viewNumbers.condition,
        label: single.conditionLabel,
        save: manager.saveCondition,
        remove: manager.deleteCondition,
        removeTitle: manager.deleteConditionTitle,
        removeDescription: manager.deleteConditionDescription,
        saveFailed: dict.topics.errors.conditionSave,
        removeFailed: dict.topics.errors.conditionDelete,
        savedNotice: m.content.number.conditionSaved,
        removedNotice: m.content.number.conditionDeleted,
      }
    : {
        name: dict.topics.viewNumbers.answer,
        label: single.answerLabel,
        save: manager.saveAnswer,
        remove: manager.deleteAnswer,
        removeTitle: manager.deleteAnswerTitle,
        removeDescription: manager.deleteAnswerDescription,
        saveFailed: dict.topics.errors.answerSave,
        removeFailed: dict.topics.errors.answerDelete,
        savedNotice: m.content.number.answerSaved,
        removedNotice: m.content.number.answerDeleted,
      };

  const [draft, setDraft] = useState(saved ?? '');
  // The saved value the draft was last compared with. When the server value changes under the editor
  // (another developer, a realtime refresh) an untouched draft follows it; an edited one is kept.
  const [synced, setSynced] = useState(saved);
  if (saved !== synced) {
    if (draft.trim() === (synced ?? '').trim()) setDraft(saved ?? '');
    setSynced(saved);
  }
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Save and delete of one value share a bucket (60 / 60 s).
  const wait = useRetryWait();
  // `404 numberNotFound`: the number (or its topic) was deleted elsewhere. Re-read it, so the screen turns
  // into the not-found state instead of offering a save that can only fail again (90-addendum-1 A.3 rule 6).
  const refetchIfGone = (failure: unknown) => {
    if (isNotFoundError(failure)) void queryClient.invalidateQueries({ queryKey: qk('content') });
  };

  const save = useMutation({
    mutationFn: (value: string) => (isCondition ? api.content.saveCondition(homeworkNumberId, value) : api.content.saveAnswer(homeworkNumberId, value)),
    onSuccess: (stored) => {
      // The server normalises the text: both the saved value and the draft become what it stored.
      setDraft(stored);
      setSynced(stored);
      setError(null);
      setSuccess(texts.savedNotice);
      onChanged(stored);
    },
    onError: (failure) => {
      wait.note(failure);
      setSuccess(null);
      setError(errorText(failure, texts.saveFailed));
      refetchIfGone(failure);
    },
  });

  const remove = useMutation({
    mutationFn: () => (isCondition ? api.content.deleteCondition(homeworkNumberId) : api.content.deleteAnswer(homeworkNumberId)),
    onSuccess: () => {
      setDraft('');
      setSynced(null);
      setError(null);
      setSuccess(texts.removedNotice);
      setConfirmOpen(false);
      onChanged(null);
    },
    onError: (failure) => {
      wait.note(failure);
      setSuccess(null);
      setConfirmOpen(false);
      setError(errorText(failure, texts.removeFailed));
      refetchIfGone(failure);
    },
  });

  const busy = save.isPending || remove.isPending;
  const hasSaved = hasLatex(saved);
  const dirty = draft.trim() !== (saved ?? '').trim();
  const canSave = canSaveLatexDraft(draft, saved) && !busy && !wait.waiting;

  return (
    <View style={styles.root}>
      <TextArea
        // One name per field: the label on a tablet, the format on a phone (the switch above names the value).
        label={named ? texts.name : undefined}
        placeholder={named ? undefined : FORMAT_PLACEHOLDER}
        accessibilityLabel={texts.label}
        value={draft}
        onChangeText={(value) => {
          setDraft(value);
          if (success) setSuccess(null);
        }}
        numberOfLines={4}
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        disabled={busy}
        inputStyle={styles.mono}
        testID={`latex-${kind}-input`}
      />

      {hasLatex(draft) ? (
        <View accessibilityLabel={single.preview}>
          <MathPreview value={draft} testID={`latex-${kind}-preview`} />
        </View>
      ) : null}

      {error ? <Notice tone="error" text={error} testID={`latex-${kind}-error`} /> : null}
      <RetryWaitLine seconds={wait.seconds} testID={`latex-${kind}-wait`} />
      {success ? (
        <Notice
          tone="success"
          text={success}
          onDismiss={() => setSuccess(null)}
          dismissLabel={m.common.actions.close}
          testID={`latex-${kind}-success`}
        />
      ) : null}

      {/* One line: back to the saved text (only while the draft differs), save, delete. The marks are named for a screen reader. */}
      <View style={styles.actions}>
        {dirty && !busy ? (
          <IconButton
            icon="rotateCcw"
            accessibilityLabel={m.content.number.resetDraft}
            onPress={() => setDraft(saved ?? '')}
            testID={`latex-${kind}-reset`}
          />
        ) : null}
        <Button
          label={save.isPending ? manager.saving : dict.common.save}
          accessibilityLabel={save.isPending ? undefined : texts.save}
          variant={secondary ? 'outline' : 'primary'}
          loading={save.isPending}
          disabled={!canSave}
          onPress={() => {
            setError(null);
            save.mutate(draft);
          }}
          style={styles.grow}
          testID={`latex-${kind}-save`}
        />
        {hasSaved ? (
          <IconButton
            icon="trash"
            tint={theme.colors.dangerText}
            accessibilityLabel={texts.remove}
            disabled={busy || wait.waiting}
            onPress={() => setConfirmOpen(true)}
            testID={`latex-${kind}-delete`}
          />
        ) : null}
      </View>

      <Dialog
        visible={confirmOpen}
        title={format(texts.removeTitle, { number })}
        description={texts.removeDescription}
        confirmLabel={dict.topics.widgets.confirm.confirm}
        pendingLabel={dict.topics.widgets.confirm.pending}
        cancelLabel={dict.topics.widgets.confirm.cancel}
        pending={remove.isPending}
        onConfirm={() => {
          setError(null);
          remove.mutate();
        }}
        onCancel={() => setConfirmOpen(false)}
        testID={`latex-${kind}-confirm`}
      />
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  root: { gap: t.space.md },
  mono: { ...t.typography.mono },
  grow: { flex: 1 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: t.space.sm },
}));
