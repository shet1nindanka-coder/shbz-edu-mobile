import type { TheoryLibraryResponse } from '@/api/types';
import { isImageMime, isPdfMime } from '@/domain/files';
import { format, useI18n } from '@/i18n';
import { ListRow, Spinner } from '@/ui';

export type TheoryTopic = TheoryLibraryResponse['topics'][number];

export type TheoryCardProps = {
  topic: TheoryTopic;
  /** PDF / image: open the in-app viewer. */
  onOpen: (topic: TheoryTopic) => void;
  /** Anything else (DOCX): download and hand the file to another app. */
  onDownload: (topic: TheoryTopic) => void;
  /** The download of this row's file is running. */
  downloading: boolean;
  /** Hairline under the row; off on the last one. */
  divider?: boolean;
};

/** A file the app can show itself (the site's "Открыть"); everything else is "Скачать файл". */
export function isPreviewableTheory(mimeType: string): boolean {
  return isPdfMime(mimeType) || isImageMime(mimeType);
}

/**
 * A topic of the theory list (02 S2; layout: docs/design/glass-over-paper.md §8): one row, pressed as a
 * whole — there is no «Открыть» button. A PDF or an image opens in the viewer; a file the app cannot show
 * (Word) says so in its caption and is handed to another app.
 * SPEC-GAP: 02 S2a leaves the DOCX strategy open (Q3); the file is downloaded and handed to another app,
 * as 09 §5.2 proposes — there is nothing to preview in a viewer.
 */
export function TheoryCard({ topic, onOpen, onDownload, downloading, divider }: TheoryCardProps) {
  const { m } = useI18n();
  const previewable = isPreviewableTheory(topic.theoryFile.mimeType);
  return (
    <ListRow
      title={topic.title}
      titleLines={2}
      subtitle={previewable ? undefined : downloading ? m.student.theory.downloading : m.student.theory.external}
      right={downloading ? <Spinner size={16} /> : undefined}
      divider={divider}
      disabled={downloading}
      onPress={() => (previewable ? onOpen(topic) : onDownload(topic))}
      accessibilityLabel={format(previewable ? m.student.theory.openAria : m.student.theory.downloadAria, { title: topic.title })}
      testID={`theory-card-${topic.id}`}
    />
  );
}
