import type { ReactNode } from 'react';
import { View } from 'react-native';

import { formatFileSize } from '@/domain/files';
import { format, useI18n } from '@/i18n';
import { makeStyles, useTheme } from '@/theme';
import { accessibilityLabelOf, Icon, IconButton, Notice, PressableScale, ProgressBar, Text } from '@/ui';

import type { UploadSlot } from './use-upload-slot';

export type UploadSlotFieldProps = {
  /** The one name of the slot, shown while it is empty: `dict.topics.createForm.theoryFile`, «Заменить файл». */
  label: string;
  slot: UploadSlot;
  disabled?: boolean;
  /** A control after the slot (the editor's «Убрать выбранный файл»); a running upload shows its cancel instead. */
  trailing?: ReactNode;
  testID: string;
};

/**
 * File field of the manual create form and of the editor's file sheet (site: the upload variant of
 * `FileDropInput`; text: docs/design/glass-over-paper.md §1a): ONE line — a dashed slot that is the button.
 * Empty it carries its name; with a file in it the outline turns solid and it carries the file name; while
 * the upload runs — the name, the real percentage and the bar. «Выбрать файл» / «Заменить файл», the
 * size and the formats are spoken or said by the error, not shown.
 */
export function UploadSlotField({ label, slot, disabled = false, trailing, testID }: UploadSlotFieldProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { dict, m, locale } = useI18n();
  const t = dict.topics.createForm;
  const drop = dict.topics.widgets.fileDrop;
  const { status } = slot;
  const uploaded = status.kind === 'uploaded';
  const percent = status.kind === 'uploading' ? format(m.content.upload.progress, { percent: status.progress }) : null;
  const action = uploaded ? drop.replace : drop.choose;
  const spoken = accessibilityLabelOf(
    [
      action,
      label === action ? null : label,
      status.kind === 'uploaded'
        ? `${t.uploaded} ${status.file.originalName} · ${formatFileSize(status.file.size, locale)}`
        : status.kind === 'uploading'
          ? `${status.name}. ${t.uploading} ${percent}`
          : drop.none,
    ],
    '. ',
  );

  return (
    <View style={styles.root} testID={testID}>
      <View style={styles.row}>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={spoken}
          accessibilityState={{ disabled }}
          disabled={disabled}
          onPress={slot.pick}
          scaleTo={0.99}
          style={[styles.slot, uploaded ? styles.slotDone : null, disabled ? styles.slotDisabled : null]}
          testID={`${testID}-pick`}
        >
          <Icon name={uploaded ? 'check' : 'upload'} size={theme.sizes.icon.md} color={uploaded ? 'greenText' : 'textMuted'} />
          {status.kind === 'uploaded' ? (
            <Text variant="bodyStrong" numberOfLines={1} style={styles.grow} testID={`${testID}-name`}>
              {status.file.originalName}
            </Text>
          ) : (
            <Text variant="bodyStrong" color={status.kind === 'uploading' ? 'textStrong' : 'label'} numberOfLines={1} style={styles.grow}>
              {status.kind === 'uploading' ? status.name : label}
            </Text>
          )}
          {percent ? (
            <Text variant="small" color="textMuted" tabular>
              {percent}
            </Text>
          ) : null}
        </PressableScale>
        {status.kind === 'uploading' ? (
          <IconButton icon="close" accessibilityLabel={m.content.upload.cancel} onPress={slot.cancel} testID={`${testID}-cancel`} />
        ) : (
          trailing
        )}
      </View>

      {status.kind === 'uploading' ? (
        <ProgressBar value={status.progress} transition="linear" accessibilityLabel={dict.topics.widgets.dropzoneUploadAria} />
      ) : null}
      {status.kind === 'error' ? <Notice tone="error" text={status.message} testID={`${testID}-error`} /> : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  root: { gap: t.space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: t.space.sm },
  // An empty slot is an invitation (dashed); with a file in it the outline turns solid.
  slot: {
    flex: 1,
    minWidth: 0,
    minHeight: t.sizes.fieldLg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space.md,
    paddingHorizontal: t.space.lg,
    borderRadius: t.radii.md,
    borderWidth: t.borders.interactive,
    borderStyle: 'dashed',
    borderColor: t.colors.line2,
    backgroundColor: t.colors.softBg,
  },
  slotDone: { borderStyle: 'solid', borderColor: t.colors.greenSolid, backgroundColor: t.colors.greenSoft },
  slotDisabled: { opacity: 0.5 },
  grow: { flex: 1, minWidth: 0 },
}));
