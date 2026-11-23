import { View } from 'react-native';

import type { StoredFileRef } from '@/api/types';
import { fileTypeLabel, type ViewerFile } from '@/components/files';
import { formatFileSize } from '@/domain/files';
import { format, useI18n } from '@/i18n';
import { Hint } from '@/providers';
import { makeStyles } from '@/theme';
import { IconTile, ListRow, Text, type IconName } from '@/ui';

export type TopicFilesProps = {
  theoryFile: StoredFileRef | null;
  homeworkFile: StoredFileRef | null;
  /** Opens the file in the viewer, titled with its slot («Теория»). */
  onOpen: (file: ViewerFile, title: string) => void;
};

/**
 * «Материалы» of the topic view (docs/spec/07-developer-content.md §1.2 item 3): the theory and the tasks
 * file as two rows. A row opens the file in the viewer, which carries "download / share"; an empty slot
 * says so and is not pressed. Rendered inside a card (the rows bring no padding of their own).
 */
export function TopicFiles({ theoryFile, homeworkFile, onOpen }: TopicFilesProps) {
  const styles = useStyles();
  const { dict, m, locale } = useI18n();
  const t = dict.topics.view;
  const slots: { key: 'theory' | 'homework'; title: string; icon: IconName; file: StoredFileRef | null }[] = [
    { key: 'theory', title: t.theory, icon: 'bookOpen', file: theoryFile },
    { key: 'homework', title: t.homework, icon: 'file', file: homeworkFile },
  ];

  return (
    <View style={styles.root}>
      <View style={styles.head}>
        <Text variant="sectionTitle" accessibilityRole="header">
          {t.materialsTitle}
        </Text>
        <Hint>
          <Text variant="hint">{t.materialsDescription}</Text>
        </Hint>
      </View>
      <View>
        {slots.map((slot, index) => {
          const file = slot.file;
          const caption = file
            ? `${file.originalName} · ${typeof file.size === 'number' ? `${fileTypeLabel(file)} · ${formatFileSize(file.size, locale)}` : fileTypeLabel(file)}`
            : dict.student.fileCard.notUploaded;
          return (
            <ListRow
              key={slot.key}
              inset={0}
              left={<IconTile icon={slot.icon} tone="quiet" />}
              title={slot.title}
              subtitle={caption}
              divider={index < slots.length - 1}
              onPress={file ? () => onOpen(file, slot.title) : undefined}
              accessibilityLabel={
                file ? `${format(m.common.files.actionOf, { action: dict.student.fullscreen.open, slot: slot.title })}. ${caption}` : `${slot.title}. ${caption}`
              }
              testID={`topic-${slot.key}-file`}
            />
          );
        })}
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  root: { gap: t.space.xs },
  head: { gap: t.space.xxs },
}));
