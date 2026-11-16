import { View } from 'react-native';

import { formatFileSize } from '@/domain/files';
import { format, useI18n } from '@/i18n';
import { Hint } from '@/providers';
import { makeStyles } from '@/theme';
import { Button, Icon, Notice, ProgressBar, Text, TextButton } from '@/ui';

import type { UploadSlot } from './use-upload-slot';

export type UploadSlotFieldProps = {
  /** `dict.topics.createForm.theoryFile` / `homeworkFile`. */
  label: string;
  slot: UploadSlot;
  disabled?: boolean;
  testID: string;
};

/**
 * File field of the manual create form (site: the upload variant of `FileDropInput`; 08 §5.15): the
 * dropzone becomes a tile with a "choose file" button, the upload shows a real percentage bar.
 */
export function UploadSlotField({ label, slot, disabled = false, testID }: UploadSlotFieldProps) {
  const styles = useStyles();
  const { dict, m, locale } = useI18n();
  const t = dict.topics.createForm;
  const drop = dict.topics.widgets.fileDrop;
  const { status } = slot;
  const uploaded = status.kind === 'uploaded';

  return (
    <View style={styles.root} testID={testID}>
      <Text variant="label">{label}</Text>
      <View style={[styles.tile, uploaded ? styles.tileDone : null]}>
        <View style={styles.tileRow}>
          <View style={styles.icon}>
            <Icon name={uploaded ? 'check' : 'upload'} size={20} color="greenText" />
          </View>
          <View style={styles.texts}>
            {status.kind === 'uploaded' ? (
              <>
                <Text variant="captionStrong" color="greenText">
                  {t.uploaded}
                </Text>
                <Text variant="smallStrong" numberOfLines={2} testID={`${testID}-name`}>
                  {`${status.file.originalName} · ${formatFileSize(status.file.size, locale)}`}
                </Text>
              </>
            ) : status.kind === 'uploading' ? (
              <>
                <Text variant="smallStrong" numberOfLines={1}>
                  {status.name}
                </Text>
                <Text variant="caption" color="textMuted">
                  {`${t.uploading} ${format(m.content.upload.progress, { percent: status.progress })}`}
                </Text>
              </>
            ) : (
              <Text variant="smallStrong" color="textMuted">
                {drop.none}
              </Text>
            )}
          </View>
        </View>

        {status.kind === 'uploading' ? (
          <ProgressBar value={status.progress} transition="linear" accessibilityLabel={dict.topics.widgets.dropzoneUploadAria} />
        ) : null}

        <View style={styles.actions}>
          <Button
            label={uploaded ? drop.replace : drop.choose}
            variant="outline"
            size="sm"
            leftIcon="paperclip"
            disabled={disabled}
            onPress={slot.pick}
            testID={`${testID}-pick`}
          />
          {status.kind === 'uploading' ? (
            <TextButton label={m.content.upload.cancel} tone="danger" onPress={slot.cancel} style={styles.cancel} testID={`${testID}-cancel`} />
          ) : null}
        </View>
      </View>

      {status.kind === 'error' ? <Notice tone="error" text={status.message} testID={`${testID}-error`} /> : null}
      <Hint>
        <Text variant="hint">{m.content.fileDrop.helper}</Text>
      </Hint>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  root: { gap: t.space.sm },
  tile: {
    gap: t.space.md,
    padding: t.space.md,
    borderRadius: t.radii.lg,
    borderWidth: t.borders.interactive,
    borderStyle: 'dashed',
    borderColor: t.colors.inputBorder,
    backgroundColor: t.colors.dropzoneBg,
  },
  tileDone: { borderStyle: 'solid', borderColor: t.colors.greenBorder, backgroundColor: t.colors.greenSoft },
  tileRow: { flexDirection: 'row', alignItems: 'center', gap: t.space.md },
  icon: {
    width: 44,
    height: 44,
    borderRadius: t.radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.colors.greenSoft,
  },
  texts: { flex: 1, gap: 2 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: t.space.md },
  cancel: { minHeight: t.sizes.minTouch, justifyContent: 'center' },
}));
