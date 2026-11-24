import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { View } from 'react-native';

import { errorText, hasErrorCode, qk, useApi } from '@/api';
import type { StoredFileRef, TopicDetail } from '@/api/types';
import { fileIconName, fileTypeLabel, viewerFileKind, type ViewerFile } from '@/components/files';
import { formatFileSize } from '@/domain/files';
import { format, useI18n } from '@/i18n';
import { makeStyles, useTheme } from '@/theme';
import { BottomSheet, Button, Card, Dialog, Icon, IconButton, IconTile, ListRow, Notice, Text } from '@/ui';

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
 * `D-topic-edit` mockup; text: docs/design/glass-over-paper.md §1a): a box that names the slot. The box
 * opens a sheet with everything that can be done to the file — open it, pick the one that replaces it,
 * and «Удалить», an immediate action of its own, independent of the form.
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
  const drop = dict.topics.widgets.fileDrop;
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

  // The box shows a state only where one needs attention (§1a): the running upload, its failure, the
  // replacement that waits for the save, the empty slot. An attached file is the box alone — its name is
  // in the sheet. The spoken name keeps every fact.
  const { status } = slot;
  const pendingNote = file ? m.content.edit.willReplace : m.content.edit.willAttach;
  const facts = (target: Pick<StoredFileRef, 'originalName' | 'mimeType' | 'size'>) =>
    typeof target.size === 'number'
      ? `${target.originalName} · ${fileTypeLabel(target)} · ${formatFileSize(target.size, locale)}`
      : `${target.originalName} · ${fileTypeLabel(target)}`;
  const state: { shown: string | null; spoken: string } =
    status.kind === 'uploading'
      ? {
          shown: format(m.content.upload.progress, { percent: status.progress }),
          spoken: `${dict.topics.createForm.uploading} ${format(m.content.upload.progress, { percent: status.progress })}`,
        }
      : status.kind === 'error'
        ? { shown: status.message, spoken: status.message }
        : slot.file
          ? { shown: m.content.edit.filePending, spoken: pendingNote }
          : file
            ? { shown: null, spoken: facts(file) }
            : { shown: m.content.topic.noFile, spoken: dict.student.fileCard.notUploaded };

  return (
    <>
      <Card
        onPress={() => setSheetOpen(true)}
        accessibilityLabel={title}
        accessibilityParts={[state.spoken]}
        style={styles.box}
        testID={`edit-${kind}-file`}
      >
        <Icon name={kind === 'theory' ? 'bookOpen' : 'file'} size={theme.sizes.icon.md} color="textMuted" />
        <View style={styles.texts}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {title}
          </Text>
          {state.shown ? (
            <Text variant="small" color={status.kind === 'error' ? 'redText' : 'textMuted'} tabular numberOfLines={2}>
              {state.shown}
            </Text>
          ) : null}
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
          {/* The attached file is a row pressed as a whole: its name, its type on the right. */}
          {file ? (
            <ListRow
              inset={0}
              left={<IconTile icon={fileIconName(viewerFileKind(file))} tone="quiet" />}
              title={file.originalName}
              titleLines={2}
              meta={fileTypeLabel(file)}
              divider={false}
              onPress={() => leaveSheetFor('open')}
              accessibilityLabel={`${format(m.common.files.actionOf, { action: dict.student.fullscreen.open, slot: title })}. ${facts(file)}`}
              testID={`edit-${kind}-file-open`}
            />
          ) : null}

          <UploadSlotField
            label={file ? drop.replace : drop.choose}
            slot={slot}
            disabled={disabled || uploadsLimited}
            trailing={
              // The picked file waits for the form's save; until then it can be taken back.
              slot.file ? (
                <IconButton
                  icon="close"
                  accessibilityLabel={m.content.edit.discardFile}
                  accessibilityHint={pendingNote}
                  disabled={disabled}
                  onPress={slot.reset}
                  testID={`edit-${kind}-discard`}
                />
              ) : undefined
            }
            testID={`edit-${kind}-slot`}
          />

          {file ? (
            <Button
              label={dict.topics.widgets.delete}
              accessibilityLabel={texts.label}
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
}));
