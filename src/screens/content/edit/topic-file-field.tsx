import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';

import { hasErrorCode, qk, useApi } from '@/api';
import type { StoredFileRef, TopicDetail } from '@/api/types';
import { FileCard, type ViewerFile } from '@/components/files';
import { useI18n } from '@/i18n';
import { makeStyles } from '@/theme';
import { Button, Dialog, Notice, Text, TextButton } from '@/ui';

import { UploadSlotField } from '../browse/upload-slot-field';
import type { UploadSlot } from '../browse/use-upload-slot';
import { errorText } from '../shared/error-text';

import type { EditNotice } from './use-topic-edit-form';

export type TopicFileKind = 'theory' | 'homework';

export type TopicFileFieldProps = {
  kind: TopicFileKind;
  topicId: string;
  /** The file attached to the topic now. */
  file: StoredFileRef | null;
  /** The replacement picked on this screen (uploaded already, attached by the next save). */
  slot: UploadSlot;
  /** The form is saving: nothing in the cell may change under it. */
  disabled: boolean;
  /** `api:teacher-uploads` is cooling down: picking waits, deleting does not (it is not an upload). */
  uploadsLimited: boolean;
  onOpen: (file: ViewerFile, title: string) => void;
  onNotice: (notice: EditNotice | null) => void;
};

/**
 * One cell of the «Файлы» block (docs/spec/07-developer-content.md §1.3 item 4, §3.3): the attached file
 * with open / share, the picker that replaces it, and «Удалить файл …» — an immediate action of its own,
 * independent of the form.
 */
export function TopicFileField({ kind, topicId, file, slot, disabled, uploadsLimited, onOpen, onNotice }: TopicFileFieldProps) {
  const styles = useStyles();
  const api = useApi();
  const queryClient = useQueryClient();
  const { dict, m } = useI18n();
  const t = dict.topics.edit;
  const texts = kind === 'theory' ? t.deleteTheory : t.deleteHomework;
  const title = kind === 'theory' ? dict.topics.view.theory : dict.topics.view.homework;
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = useMutation({
    mutationFn: () => api.content.deleteTopicFile(topicId, kind),
    onSuccess: () => {
      // The card empties at once; the student-facing lists refetch.
      queryClient.setQueryData<TopicDetail>(qk('content', 'getTopic', topicId), (current) =>
        current
          ? {
              topic: { ...current.topic, [kind === 'theory' ? 'theoryFile' : 'homeworkFile']: null },
              stats: { ...current.stats, [kind === 'theory' ? 'theoryAttached' : 'homeworkAttached']: false },
            }
          : current,
      );
      void queryClient.invalidateQueries({ queryKey: qk('content') });
      setConfirmOpen(false);
      setError(null);
      onNotice({ tone: 'success', text: kind === 'theory' ? t.notices.theoryDeleted : t.notices.homeworkDeleted });
    },
    onError: (failure) => {
      if (hasErrorCode(failure, 'topicNotFound')) void queryClient.invalidateQueries({ queryKey: qk('content') });
      setError(errorText(failure, t.notices.fileDelete));
    },
  });

  const closeConfirm = () => {
    if (remove.isPending) return;
    setConfirmOpen(false);
    setError(null);
  };

  return (
    <>
      {/* SPEC-GAP: the site adds «Предпросмотр скрыт…» under the name; the phone card never embeds a
          document preview (09 §5.2), so there is nothing to call hidden. */}
      <FileCard
        title={title}
        file={file}
        onOpen={(opened) => onOpen(opened, title)}
        testID={`edit-${kind}-file`}
        footer={
          <View style={styles.footer}>
            <UploadSlotField
              label={kind === 'theory' ? t.replaceTheory : t.replaceHomework}
              slot={slot}
              disabled={disabled || uploadsLimited}
              testID={`edit-${kind}-slot`}
            />
            {slot.file ? (
              <View style={styles.pending} testID={`edit-${kind}-pending`}>
                <Text variant="small" color="label" style={styles.grow}>
                  {file ? m.content.edit.willReplace : m.content.edit.willAttach}
                </Text>
                <TextButton
                  label={m.content.edit.discardFile}
                  tone="muted"
                  disabled={disabled}
                  onPress={slot.reset}
                  style={styles.touch}
                  testID={`edit-${kind}-discard`}
                />
              </View>
            ) : null}
            {file ? (
              <Button
                label={texts.label}
                variant="danger"
                size="sm"
                leftIcon="trash"
                disabled={disabled}
                onPress={() => {
                  setError(null);
                  setConfirmOpen(true);
                }}
                style={styles.delete}
                testID={`edit-${kind}-delete`}
              />
            ) : null}
          </View>
        }
      />

      <Dialog
        visible={confirmOpen}
        kicker={dict.topics.widgets.confirm.kicker}
        title={texts.title}
        description={texts.description}
        confirmLabel={dict.topics.widgets.confirm.confirm}
        pendingLabel={dict.topics.widgets.confirm.pending}
        cancelLabel={dict.topics.widgets.confirm.cancel}
        pending={remove.isPending}
        onConfirm={() => {
          setError(null);
          remove.mutate();
        }}
        onCancel={closeConfirm}
        testID={`edit-${kind}-delete-dialog`}
      >
        {error ? <Notice tone="error" text={error} testID={`edit-${kind}-delete-error`} /> : null}
      </Dialog>
    </>
  );
}

const useStyles = makeStyles((t) => ({
  footer: { gap: t.space.md },
  pending: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: t.space.md },
  grow: { flex: 1, minWidth: 180 },
  touch: { minHeight: t.sizes.minTouch, justifyContent: 'center' },
  delete: { alignSelf: 'flex-start' },
}));
