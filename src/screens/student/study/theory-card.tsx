import { View } from 'react-native';

import type { TheoryLibraryResponse } from '@/api/types';
import { isImageMime, isPdfMime } from '@/domain/files';
import { format, useI18n } from '@/i18n';
import { Hint } from '@/providers';
import { makeStyles } from '@/theme';
import { Button, Card, Text } from '@/ui';

export type TheoryTopic = TheoryLibraryResponse['topics'][number];

export type TheoryCardProps = {
  topic: TheoryTopic;
  /** PDF / image: open the in-app viewer. */
  onOpen: (topic: TheoryTopic) => void;
  /** Anything else (DOCX): download and hand the file to another app. */
  onDownload: (topic: TheoryTopic) => void;
  /** The download of this card's file is running. */
  downloading: boolean;
};

/** A file the app can show itself (the site's "Открыть"); everything else is "Скачать файл". */
export function isPreviewableTheory(mimeType: string): boolean {
  return isPdfMime(mimeType) || isImageMime(mimeType);
}

/**
 * Theory card (02 S2): by the owner's decision it shows only the topic title and one button — no
 * description, file name, size or date (02 Q9: parity until a secondary line is approved).
 * SPEC-GAP: 02 S2a leaves the DOCX strategy open (Q3); the file is downloaded and handed to another app,
 * as 09 §5.2 proposes, straight from the button — there is nothing to preview in a viewer.
 */
export function TheoryCard({ topic, onOpen, onDownload, downloading }: TheoryCardProps) {
  const styles = useStyles();
  const { dict, m } = useI18n();
  const t = dict.student.fullscreen;
  const previewable = isPreviewableTheory(topic.theoryFile.mimeType);
  if (previewable) {
    return (
      <Card padded={16} testID={`theory-card-${topic.id}`}>
        {/* One row on a phone: the title, and the single action on the right. */}
        <View style={styles.row}>
          <Text variant="cardTitle" accessibilityRole="header" style={styles.title}>
            {topic.title}
          </Text>
          <Button
            label={t.open}
            accessibilityLabel={format(m.student.theory.openAria, { title: topic.title })}
            onPress={() => onOpen(topic)}
            testID={`theory-open-${topic.id}`}
          />
        </View>
      </Card>
    );
  }
  // «Скачать файл» is too wide to share a row with a long title: it goes under it, with its hint.
  return (
    <Card padded={16} testID={`theory-card-${topic.id}`}>
      <View style={styles.column}>
        <Text variant="cardTitle" accessibilityRole="header">
          {topic.title}
        </Text>
        <Button
          label={t.download}
          accessibilityLabel={format(m.student.theory.downloadAria, { title: topic.title })}
          leftIcon="download"
          loading={downloading}
          onPress={() => onDownload(topic)}
          fullWidth
          testID={`theory-download-${topic.id}`}
        />
        <Hint>
          <Text variant="hint">{m.student.fileCard.docxHint}</Text>
        </Hint>
      </View>
    </Card>
  );
}

const useStyles = makeStyles((t) => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: t.space.md },
  // `minWidth: 0` lets a very long word wrap instead of pushing the button out of the card.
  title: { flex: 1, minWidth: 0 },
  column: { gap: t.space.md },
}));
