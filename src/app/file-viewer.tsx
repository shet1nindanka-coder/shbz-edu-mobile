// `shared.fileViewer` — thin route: `?files=<JSON>&index=<n>&title=<text>` (built by `openFiles`).
import { useLocalSearchParams } from 'expo-router';

import { fileViewerFilesParam, indexParam, stringParam } from '@/navigation/routes';
import { FileViewerScreen } from '@/screens/shell';

export { RouteErrorBoundary as ErrorBoundary } from '@/screens/shell';

export default function FileViewerRoute() {
  const { files, index, title } = useLocalSearchParams<{ files?: string; index?: string; title?: string }>();
  return <FileViewerScreen files={fileViewerFilesParam(files)} initialIndex={indexParam(index)} title={stringParam(title)} />;
}
