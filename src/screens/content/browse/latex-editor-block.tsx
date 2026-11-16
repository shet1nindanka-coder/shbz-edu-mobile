import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';

import { useApi } from '@/api';
import { MathPreview } from '@/components/math';
import { format, useI18n } from '@/i18n';
import { Hint } from '@/providers';
import { makeStyles } from '@/theme';
import { Button, Card, Dialog, Notice, Text, TextArea, TextButton } from '@/ui';

import { errorText } from '../shared/error-text';
import { canSaveLatexDraft, hasLatex } from '../shared/number-fill-status';
import { RateLimitLine, useRateLimit } from '../shared/use-rate-limit';

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
};

/**
 * LaTeX editor of one value of a number (site: one panel of `TeacherSingleNumberCard`,
 * docs/spec/07-developer-content.md §1.4b, §4.9): a saved value and a draft. «Сохранить» is offered when
 * the draft is non-blank and differs from the saved value; «Удалить» only when a saved value exists.
 * Unlike the site's card the preview follows the DRAFT — the spec's phone mapping asks for it.
 */
export function LatexEditorBlock({ kind, homeworkNumberId, number, saved, onChanged }: LatexEditorBlockProps) {
  const styles = useStyles();
  const api = useApi();
  const { dict, m } = useI18n();
  const single = dict.topics.singleNumber;
  const manager = dict.topics.answerManager;
  const isCondition = kind === 'condition';
  const texts = isCondition
    ? {
        label: single.conditionLabel,
        placeholder: single.conditionPlaceholder,
        empty: manager.conditionEmpty,
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
        label: single.answerLabel,
        placeholder: single.answerPlaceholder,
        empty: manager.answerEmpty,
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
  const wait = useRateLimit();

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
    },
  });

  const busy = save.isPending || remove.isPending;
  const hasSaved = hasLatex(saved);
  const dirty = draft.trim() !== (saved ?? '').trim();
  const canSave = canSaveLatexDraft(draft, saved) && !busy && !wait.waiting;

  return (
    <Card style={styles.card} testID={`latex-${kind}`}>
      <TextArea
        label={texts.label}
        value={draft}
        onChangeText={(value) => {
          setDraft(value);
          if (success) setSuccess(null);
        }}
        placeholder={texts.placeholder}
        numberOfLines={4}
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        disabled={busy}
        inputStyle={styles.mono}
        testID={`latex-${kind}-input`}
      />
      <Hint>
        <Text variant="hint">{`${manager.latexHintBefore}$...$${manager.latexHintMiddle}$$...$$${manager.latexHintAfter}`}</Text>
      </Hint>

      <View style={styles.preview}>
        <Text variant="kickerSm">{single.preview}</Text>
        {hasLatex(draft) ? (
          <MathPreview value={draft} testID={`latex-${kind}-preview`} />
        ) : (
          <Card variant="soft" dashed padded={14} testID={`latex-${kind}-empty`}>
            <Text variant="small" color="textMuted">
              {texts.empty}
            </Text>
          </Card>
        )}
      </View>

      {dirty && !busy ? (
        <View style={styles.dirty}>
          <Text variant="caption" color="textMuted" style={styles.grow}>
            {m.content.number.unsaved}
          </Text>
          <TextButton
            label={m.content.number.resetDraft}
            tone="muted"
            onPress={() => setDraft(saved ?? '')}
            style={styles.reset}
            testID={`latex-${kind}-reset`}
          />
        </View>
      ) : null}

      {error ? <Notice tone="error" text={error} testID={`latex-${kind}-error`} /> : null}
      <RateLimitLine seconds={wait.seconds} testID={`latex-${kind}-wait`} />
      {success ? (
        <Notice
          tone="success"
          text={success}
          onDismiss={() => setSuccess(null)}
          dismissLabel={m.common.actions.close}
          testID={`latex-${kind}-success`}
        />
      ) : null}

      <View style={styles.actions}>
        <Button
          label={save.isPending ? manager.saving : texts.save}
          loading={save.isPending}
          disabled={!canSave}
          onPress={() => {
            setError(null);
            save.mutate(draft);
          }}
          testID={`latex-${kind}-save`}
        />
        {hasSaved ? (
          <Button
            label={texts.remove}
            variant="danger"
            disabled={busy || wait.waiting}
            onPress={() => setConfirmOpen(true)}
            testID={`latex-${kind}-delete`}
          />
        ) : null}
      </View>

      <Dialog
        visible={confirmOpen}
        kicker={dict.topics.widgets.confirm.kicker}
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
    </Card>
  );
}

const useStyles = makeStyles((t) => ({
  card: { gap: t.space.md },
  mono: { ...t.typography.mono },
  preview: { gap: t.space.xs },
  dirty: { flexDirection: 'row', alignItems: 'center', gap: t.space.md },
  grow: { flex: 1 },
  reset: { minHeight: t.sizes.minTouch, justifyContent: 'center' },
  // Stacked: «Сохранить условие» / «Удалить условие» do not fit side by side on a phone.
  actions: { gap: t.space.md },
}));
