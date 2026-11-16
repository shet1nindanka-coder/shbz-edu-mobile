import { FileViewer } from '@/components/files';
import { useAppNavigation, type FileViewerFile } from '@/navigation';

import { NotFoundScreen } from './NotFoundScreen';

export type FileViewerScreenProps = {
  /** One document, or the files of one set (the photos of a homework) in display order. */
  files: FileViewerFile[];
  initialIndex?: number;
  /** Header title instead of the file name. */
  title?: string;
};

/**
 * `shared.fileViewer` (docs/spec/09-data-i18n-math.md §5.2): the full-screen viewer as a route. Open it
 * with `useAppNavigation().openFiles(files, { initialIndex, title })`. The body is the shared `FileViewer`
 * composite; this wrapper only supplies "close" and the empty case (a link that lost its payload).
 */
export function FileViewerScreen({ files, initialIndex, title }: FileViewerScreenProps) {
  const navigation = useAppNavigation();
  if (files.length === 0) return <NotFoundScreen />;
  return <FileViewer files={files} initialIndex={initialIndex} title={title} onClose={navigation.back} testID="file-viewer-screen" />;
}
