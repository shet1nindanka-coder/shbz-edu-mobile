import { useEffect, useState } from 'react';

import { isApiError } from '@/api/errors';
import { isDeferredDocumentUri, resolveDocumentUri } from '@/services/files/document-uri';
import { useFileService } from '@/services/files/file-service-context';

import { toDownloadable, type ViewerFile } from './viewer-file';

export type FileDownloadState =
  | { status: 'idle' }
  /** `progress` is 0..1, or null while the size is unknown. */
  | { status: 'loading'; progress: number | null }
  | { status: 'ready'; uri: string }
  /** `message` — the server's localized text when there is one (`404 fileNotFound`, `429`…). */
  | { status: 'error'; message: string | null };

type Settled = { key: string; state: FileDownloadState };

/**
 * Downloads a file into the app cache while `enabled`, reporting progress. The file is immutable, so a
 * second mount resolves from the cache at once. `retry` starts over after an error.
 */
export function useFileDownload(file: ViewerFile | null, enabled = true): FileDownloadState & { retry: () => void } {
  const files = useFileService();
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<Settled | null>(null);

  const fileId = file?.id ?? null;
  const localUri = file?.localUri ?? null;
  const key = fileId === null ? null : `${fileId}#${attempt}`;

  // A document addressed by URL (the lesson handout) is not displayable as is: it is fetched first.
  const deferred = localUri !== null && isDeferredDocumentUri(localUri);

  useEffect(() => {
    if (!enabled || !file || key === null) return;
    if (localUri !== null && !deferred) return;
    let active = true;
    const update = (state: FileDownloadState) => {
      if (active) setSettled({ key, state });
    };
    const transfer =
      localUri !== null
        ? resolveDocumentUri(localUri, { id: file.id, originalName: file.originalName, mimeType: file.mimeType })
        : files.download(toDownloadable(file), (fraction) => update({ status: 'loading', progress: fraction }));
    transfer
      .then((uri) => update({ status: 'ready', uri }))
      .catch((error: unknown) => update({ status: 'error', message: isApiError(error) ? error.message : null }));
    return () => {
      active = false;
    };
    // The file is identified by its id; a new object for the same file must not restart the transfer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, key, localUri, enabled]);

  const retry = () => setAttempt((current) => current + 1);

  if (!file || !enabled) return { status: 'idle', retry };
  if (localUri !== null && !deferred) return { status: 'ready', uri: localUri, retry };
  // Until the first callback of this attempt arrives, the transfer is running with unknown progress.
  if (settled === null || settled.key !== key) return { status: 'loading', progress: null, retry };
  return { ...settled.state, retry };
}
