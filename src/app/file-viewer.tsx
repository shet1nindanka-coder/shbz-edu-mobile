// `shared.fileViewer` — thin route: `?files=<JSON>&index=<n>` (built by `openFiles`; file references only).
import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';

import { fileViewerFilesParam, indexParam } from '@/navigation/routes';
import { FileViewerScreen, ModalRouteFrame } from '@/screens/shell';

export { RouteErrorBoundary as ErrorBoundary } from '@/screens/shell';

export default function FileViewerRoute() {
  const { files, index } = useLocalSearchParams<{ files?: string; index?: string }>();
  // Parsed once per param value: the screen keys its work on the identity of the list.
  const parsed = useMemo(() => fileViewerFilesParam(files), [files]);
  return (
    <ModalRouteFrame presentation="fullScreen">
      <FileViewerScreen files={parsed} initialIndex={indexParam(index)} />
    </ModalRouteFrame>
  );
}
