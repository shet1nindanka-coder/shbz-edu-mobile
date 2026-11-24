import { View } from 'react-native';

import type { StoredFileRef } from '@/api/types';
import { fileTypeLabel, type ViewerFile } from '@/components/files';
import { formatFileSize } from '@/domain/files';
import { format, useI18n } from '@/i18n';
import { IconTile, ListRow, type IconName } from '@/ui';

export type TopicFilesProps = {
  theoryFile: StoredFileRef | null;
  homeworkFile: StoredFileRef | null;
  /** Opens the file in the viewer, titled with its slot («Теория»). */
  onOpen: (file: ViewerFile, title: string) => void;
};

/**
 * «Материалы» of the topic view (docs/spec/07-developer-content.md §1.2 item 3; text:
 * docs/design/glass-over-paper.md §1a): the theory and the tasks file as two rows — the slot's icon and
 * its name. A row opens the file in the viewer, which carries the file name and "download / share"; the
 * name, the type and the size are spoken, not shown. Only an empty slot has a caption, and is not pressed.
 * Rendered inside a card (the rows bring no padding of their own).
 */
export function TopicFiles({ theoryFile, homeworkFile, onOpen }: TopicFilesProps) {
  const { dict, m, locale } = useI18n();
  const t = dict.topics.view;
  const slots: { key: 'theory' | 'homework'; title: string; icon: IconName; file: StoredFileRef | null }[] = [
    { key: 'theory', title: t.theory, icon: 'bookOpen', file: theoryFile },
    { key: 'homework', title: t.homework, icon: 'file', file: homeworkFile },
  ];

  return (
    // No «Материалы» title: the two rows name themselves.
    <View accessibilityLabel={t.materialsTitle}>
      {slots.map((slot, index) => {
        const file = slot.file;
        const facts = file
          ? `${file.originalName} · ${typeof file.size === 'number' ? `${fileTypeLabel(file)} · ${formatFileSize(file.size, locale)}` : fileTypeLabel(file)}`
          : dict.student.fileCard.notUploaded;
        return (
          <ListRow
            key={slot.key}
            inset={0}
            left={<IconTile icon={slot.icon} tone="quiet" />}
            title={slot.title}
            subtitle={file ? undefined : facts}
            divider={index < slots.length - 1}
            onPress={file ? () => onOpen(file, slot.title) : undefined}
            accessibilityLabel={
              file ? `${format(m.common.files.actionOf, { action: dict.student.fullscreen.open, slot: slot.title })}. ${facts}` : `${slot.title}. ${facts}`
            }
            testID={`topic-${slot.key}-file`}
          />
        );
      })}
    </View>
  );
}
