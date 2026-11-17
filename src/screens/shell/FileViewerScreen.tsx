import { useMemo } from 'react';

import { FileViewer } from '@/components/files';
import { useAppNavigation, type FileViewerFile } from '@/navigation';
import { handedOverTitle, viewerRouteFiles } from '@/navigation/viewer-handoff';

import { NotFoundScreen } from './NotFoundScreen';

export type FileViewerScreenProps = {
  /** One document, or the files of one set (the photos of a homework) in display order. */
  files: FileViewerFile[];
  initialIndex?: number;
};

/**
 * `shared.fileViewer` (docs/spec/09-data-i18n-math.md §5.2): the full-screen viewer as a route. Open it
 * with `useAppNavigation().openFiles(files, { initialIndex, title })`. The body is the shared `FileViewer`
 * composite; this wrapper only supplies "close" and the empty case (a link that lost its payload).
 *
 * The route params are untrusted (any deep link can write them), so they carry file references only: each
 * file is loaded through `FileService`, which checks access. A document the app downloaded itself (a
 * report, a handout) and the header title are picked up from the in-memory hand-over of `openFiles`.
 */
export function FileViewerScreen({ files, initialIndex }: FileViewerScreenProps) {
  const navigation = useAppNavigation();
  // A file the link names by id alone is typed and named from the stored file (`describeIds`).
  const route = useMemo(() => viewerRouteFiles(files), [files]);
  // Header title instead of the file name — only the one `openFiles` handed over for this set.
  const title = useMemo(() => handedOverTitle(files), [files]);
  if (files.length === 0) return <NotFoundScreen />;
  return (
    <FileViewer
      files={route.files}
      describeIds={route.linkOnlyIds}
      initialIndex={initialIndex}
      title={title}
      onClose={navigation.back}
      testID="file-viewer-screen"
    />
  );
}
