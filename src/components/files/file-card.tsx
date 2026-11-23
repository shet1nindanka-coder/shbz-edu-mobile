// File card of a topic — «Теория» / «Домашнее задание» (site: `FileResourceCard`). On a phone the inline
// multi-page preview is replaced by a compact file row with "open" and "download / share" actions
// (docs/spec/09-data-i18n-math.md §5.2 "Screen mapping"); an image file keeps a fitted preview.
import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { formatFileSize } from '@/domain/files';
import { format, useI18n } from '@/i18n';
import { Hint } from '@/providers/preferences-provider';
import { SHARE_IS_DOWNLOAD } from '@/services/files/file-actions';
import { useFileService } from '@/services/files/file-service-context';
import { makeStyles } from '@/theme';
import { Button, Card, Icon, Notice, PressableScale, Text } from '@/ui';

import { useFileActions } from './use-file-share';
import { fileIconName, fileTypeLabel, viewerFileKind, type ViewerFile } from './viewer-file';

export type FileCardProps = {
  /** Kicker of the card: `dict.topics.view.theory`, `dict.topics.view.homework`… */
  title: string;
  description?: string;
  /** `null` → the "not uploaded" state. */
  file: ViewerFile | null;
  /** Opens the file in the viewer (the screen owns navigation). Without it there is no "Open" button. */
  onOpen?: (file: ViewerFile) => void;
  /** Hide the "download / share" button (e.g. while the card is being edited). */
  hideShare?: boolean;
  /** Extra controls under the actions: "replace", "remove" in the topic editor. */
  footer?: ReactNode;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

export function FileCard({ title, description, file, onOpen, hideShare = false, footer, testID, style }: FileCardProps) {
  const styles = useStyles();
  const files = useFileService();
  const { dict, m, locale } = useI18n();
  const actions = useFileActions();
  const t = dict.student.fileCard;
  const kind = file ? viewerFileKind(file) : 'other';
  const sharing = file !== null && actions.pending?.fileId === file.id && actions.pending.action === 'share';
  const shareLabel = SHARE_IS_DOWNLOAD ? t.download : m.common.actions.share;
  // A topic shows two cards with the same buttons: out of context the slot tells them apart.
  const named = (action: string) => format(m.common.files.actionOf, { action, slot: title });

  return (
    <Card testID={testID} style={style}>
      <View style={styles.header}>
        <Text variant="bodyBold" accessibilityRole="header">
          {title}
        </Text>
        {description ? (
          <Text variant="small" color="textMuted">
            {description}
          </Text>
        ) : null}
      </View>

      {file === null ? (
        <View style={styles.missing}>
          <Text variant="small" color="textMuted">
            {t.notUploaded}
          </Text>
        </View>
      ) : (
        <View style={styles.body}>
          {kind === 'image' ? (
            <PressableScale
              accessibilityRole="imagebutton"
              accessibilityLabel={file.originalName}
              disabled={!onOpen}
              onPress={() => onOpen?.(file)}
              scaleTo={0.99}
              style={styles.preview}
            >
              <Image
                source={file.localUri ? { uri: file.localUri } : files.source(file.id, 'original')}
                contentFit="contain"
                transition={150}
                style={styles.previewImage}
              />
            </PressableScale>
          ) : null}

          <View style={styles.fileRow}>
            <View style={styles.typeTile}>
              <Icon name={fileIconName(kind)} size={24} color="label" />
            </View>
            <View style={styles.fileText}>
              <Text variant="bodyStrong" numberOfLines={2}>
                {file.originalName}
              </Text>
              <Text variant="small" color="textMuted" tabular>
                {typeof file.size === 'number'
                  ? `${fileTypeLabel(file)} · ${formatFileSize(file.size, locale)}`
                  : fileTypeLabel(file)}
              </Text>
            </View>
          </View>

          {kind === 'docx' ? (
            // An explanatory line (`.ui-hint` on the site): hidden when hints are switched off.
            <Hint>
              <Text variant="hint" color="textMuted">
                {m.common.files.docxHint}
              </Text>
            </Hint>
          ) : null}

          {actions.error ? (
            <Notice
              tone="error"
              text={actions.error}
              onDismiss={actions.dismissError}
              dismissLabel={m.common.actions.close}
            />
          ) : null}

          <View style={styles.actions}>
            {onOpen ? (
              <Button
                label={dict.student.fullscreen.open}
                accessibilityLabel={named(dict.student.fullscreen.open)}
                variant="outline"
                onPress={() => onOpen(file)}
                style={styles.action}
                testID={testID ? `${testID}-open` : undefined}
              />
            ) : null}
            {hideShare ? null : (
              <Button
                variant="outline"
                label={shareLabel}
                accessibilityLabel={named(shareLabel)}
                leftIcon={SHARE_IS_DOWNLOAD ? 'download' : 'share'}
                loading={sharing}
                disabled={actions.pending !== null && !sharing}
                onPress={() => void actions.share(file)}
                style={styles.action}
                testID={testID ? `${testID}-share` : undefined}
              />
            )}
          </View>
        </View>
      )}
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </Card>
  );
}

const useStyles = makeStyles((t) => ({
  header: { gap: t.space.xxs },
  // An empty slot, not an error: a dashed outline.
  missing: {
    marginTop: t.space.md,
    paddingHorizontal: t.space.lg,
    paddingVertical: t.space.xl,
    borderRadius: t.radii.lg,
    borderWidth: t.borders.interactive,
    borderStyle: 'dashed',
    borderColor: t.colors.line2,
  },
  body: { marginTop: t.space.md, gap: t.space.md },
  preview: {
    height: 180,
    padding: t.space.sm,
    borderRadius: t.radii.lg,
    backgroundColor: t.colors.soft2,
  },
  previewImage: { flex: 1, borderRadius: t.radii.md },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: t.space.md },
  typeTile: {
    width: t.sizes.tile,
    height: t.sizes.tile,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: t.radii.md,
    backgroundColor: t.colors.soft2,
  },
  fileText: { flex: 1, minWidth: 0, gap: t.space.xxxs },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.sm },
  action: { flexGrow: 1 },
  footer: { marginTop: t.space.md },
}));
