import { useState } from 'react';

import { isApiError } from '@/api/errors';
import { useI18n } from '@/i18n';
import {
  openInAnotherApp,
  shareFile,
  type FileActionResult,
  type FileActionTarget,
} from '@/services/files/file-actions';
import { resolveDocumentUri } from '@/services/files/document-uri';
import { useFileService } from '@/services/files/file-service-context';

import { toDownloadable, type ViewerFile } from './viewer-file';

export type FileAction = 'share' | 'open';

export type FileActions = {
  /** Downloads the file if needed, then opens the share sheet (web: saves the file). */
  share: (file: ViewerFile) => Promise<void>;
  /** Downloads the file if needed, then hands it to another app (web: a new tab). */
  openExternally: (file: ViewerFile) => Promise<void>;
  /** The action in flight, with the id of its file — drives button spinners. */
  pending: { action: FileAction; fileId: string } | null;
  /** Localized text of the last failure, or null. */
  error: string | null;
  dismissError: () => void;
};

/** Share / open-with for a file reference: download → system UI, with one pending flag and one error. */
export function useFileActions(): FileActions {
  const files = useFileService();
  const { m } = useI18n();
  const [pending, setPending] = useState<FileActions['pending']>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (
    action: FileAction,
    file: ViewerFile,
    perform: (target: FileActionTarget) => Promise<FileActionResult>,
  ) => {
    if (pending) return;
    setPending({ action, fileId: file.id });
    setError(null);
    try {
      const uri = file.localUri
        ? await resolveDocumentUri(file.localUri, { id: file.id, originalName: file.originalName, mimeType: file.mimeType })
        : await files.download(toDownloadable(file));
      const result = await perform({ uri, mimeType: file.mimeType, name: file.originalName });
      if (!result.ok) {
        setError(
          result.reason === 'noApp'
            ? m.common.files.noAppToOpen
            : result.reason === 'unavailable'
              ? m.common.files.sharingUnavailable
              : m.common.files.openFailed,
        );
      }
    } catch (failure) {
      setError(isApiError(failure) ? failure.message : m.common.files.downloadFailed);
    } finally {
      setPending(null);
    }
  };

  return {
    share: (file) => run('share', file, shareFile),
    openExternally: (file) => run('open', file, openInAnotherApp),
    pending,
    error,
    dismissError: () => setError(null),
  };
}
