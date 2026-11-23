import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { View } from 'react-native';

import { errorText, hasErrorCode, qk, useApi } from '@/api';
import type { StoredFileRef, TopicDetail } from '@/api/types';
import { fileTypeLabel, type ViewerFile } from '@/components/files';
import { formatFileSize } from '@/domain/files';
import { format, useI18n } from '@/i18n';
import { makeStyles, useTheme } from '@/theme';
import { BottomSheet, Button, Card, Dialog, Icon, Notice, Text, TextButton } from '@/ui';

import { UploadSlotField } from '../browse/upload-slot-field';
import type { UploadSlot } from '../browse/use-upload-slot';

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
 * One file of the «Файлы» block (docs/spec/07-developer-content.md §1.3 item 4, §3.3; layout: the
 * `D-topic-edit` mockup): a box that names the slot and says what is in it. The box opens a sheet with
 * everything that can be done to the file — open it, pick the one that replaces it, and «Удалить файл …»,
 * an immediate action of its own, independent of the form.
 */
export function TopicFileField({ kind, topicId, file, slot, disabled, uploadsLimited, onOpen, onNotice }: TopicFileFieldProps) {
  const styles = useStyles();
  const theme = useTheme();
  const api = useApi();
  const queryClient = useQueryClient();
  const { dict, m, locale } = useI18n();
  const t = dict.topics.edit;
  const texts = kind === 'theory' ? t.deleteTheory : t.deleteHomework;
  const title = kind === 'theory' ? dict.topics.view.theory : dict.topics.view.homework;
  const [sheetOpen, setSheetOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // What the sheet leads to: it runs once the sheet has left the screen — a dialog asked for while the
  // sheet's window is still presented would be refused on iOS.
  const afterSheet = useRef<'confirm' | 'open' | null>(null);

  const remove = useMutation({
    mutationFn: () => api.content.deleteTopicFile(topicId, kind),
    onSuccess: () => {
      // The box empties at once; the student-facing lists refetch.
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
  const leaveSheetFor = (next: 'confirm' | 'open') => {
    afterSheet.current = next;
    setSheetOpen(false);
  };

  const describe = (target: Pick<StoredFileRef, 'originalName' | 'mimeType' | 'size'>) =>
    typeof target.size === 'number' ? `${target.originalName} · ${formatFileSize(target.size, locale)}` : target.originalName;
  // The one caption of the box: the running upload, its failure, the replacement that waits for the save,
  // the attached file, or the empty slot — in this order of importance.
  const { status } = slot;
  const caption =
    status.kind === 'uploading'
      ? `${dict.topics.createForm.uploading} ${format(m.content.upload.progress, { percent: status.progress })}`
      : status.kind === 'error'
        ? status.message
        : slot.file
          ? file
            ? m.content.edit.willReplace
            : m.content.edit.willAttach
          : file
            ? describe(file)
            : dict.student.fileCard.notUploaded;

  return (
    <>
      <Card
        onPress={() => setSheetOpen(true)}
        accessibilityLabel={title}
        accessibilityParts={[caption]}
        style={styles.box}
        testID={`edit-${kind}-file`}
      >
        <Icon name={kind === 'theory' ? 'bookOpen' : 'file'} size={theme.sizes.icon.md} color="textMuted" />
        <View style={styles.texts}>
          <Text variant="bodyStrong">{title}</Text>
          <Text variant="small" color={status.kind === 'error' ? 'redText' : 'textMuted'} tabular numberOfLines={2}>
            {caption}
          </Text>
        </View>
      </Card>

      <BottomSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        closeLabel={m.common.actions.close}
        title={title}
        onClosed={() => {
          const next = afterSheet.current;
          afterSheet.current = null;
          if (next === 'confirm') {
            setError(null);
            setConfirmOpen(true);
          } else if (next === 'open' && file) {
            onOpen(file, title);
          }
        }}
        testID={`edit-${kind}-sheet`}
      >
        <View style={styles.sheet}>
          {/* SPEC-GAP: the site adds «Предпросмотр скрыт…» under the name; the app never embeds a
              document preview here (09 §5.2), so there is nothing to call hidden. */}
          {file ? (
            <View style={styles.current}>
              <View style={styles.texts}>
                <Text variant="bodyStrong" numberOfLines={2}>
                  {file.originalName}
                </Text>
                <Text variant="small" color="textMuted" tabular>
                  {typeof file.size === 'number' ? `${fileTypeLabel(file)} · ${formatFileSize(file.size, locale)}` : fileTypeLabel(file)}
                </Text>
              </View>
              <Button
                label={dict.student.fullscreen.open}
                accessibilityLabel={format(m.common.files.actionOf, { action: dict.student.fullscreen.open, slot: title })}
                variant="outline"
                size="sm"
                onPress={() => leaveSheetFor('open')}
                testID={`edit-${kind}-file-open`}
              />
            </View>
          ) : (
            <Text variant="small" color="textMuted">
              {dict.student.fileCard.notUploaded}
            </Text>
          )}

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
              leftIcon="trash"
              disabled={disabled}
              onPress={() => leaveSheetFor('confirm')}
              testID={`edit-${kind}-delete`}
            />
          ) : null}
        </View>
      </BottomSheet>

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
  // Side by side on a tablet (the mockup's two boxes), one under the other on a phone.
  box: { flexDirection: 'row', alignItems: 'center', gap: t.space.md, flexGrow: 1, flexBasis: t.tablet ? '45%' : '100%' },
  texts: { flex: 1, minWidth: 0, gap: t.space.xxxs },
  sheet: { gap: t.space.lg },
  current: { flexDirection: 'row', alignItems: 'center', gap: t.space.md },
  pending: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: t.space.md },
  grow: { flex: 1, minWidth: 0 },
  touch: { minHeight: t.sizes.minTouch, justifyContent: 'center' },
}));
