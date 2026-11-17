import { useCallback, useEffect, useRef, useState } from 'react';

import { isApiError, isNetworkError, useApi } from '@/api';
import type { StoredFileRef } from '@/api/types';
import { useI18n } from '@/i18n';
import { pickDocument } from '@/services/photos';

export type UploadSlotStatus =
  | { kind: 'idle' }
  | { kind: 'uploading'; name: string; progress: number }
  | { kind: 'uploaded'; file: StoredFileRef }
  | { kind: 'error'; message: string };

export type UploadSlot = {
  status: UploadSlotStatus;
  /** The uploaded file, when the slot is in `uploaded`. */
  file: StoredFileRef | null;
  uploading: boolean;
  /** Opens the system file browser; the picked file is uploaded at once. */
  pick: () => Promise<void>;
  /** Aborts the running upload. */
  cancel: () => void;
  /** Back to `idle` (after the topic is created the files belong to it). */
  reset: () => void;
};

/**
 * One file field of the manual create form (docs/spec/07-developer-content.md §1.4, §4.9):
 * `idle → uploading(progress) → uploaded(file) | error(message)`. Picking a file uploads it immediately
 * through `POST /uploads`; picking another one aborts the running upload and tells the server which file
 * the new one replaces (`previousFileId`), so the orphan is deleted.
 */
export function useUploadSlot(onRateLimited: (error: unknown) => void): UploadSlot {
  const api = useApi();
  const { dict, m, locale } = useI18n();
  const [status, setStatus] = useState<UploadSlotStatus>({ kind: 'idle' });
  const controller = useRef<AbortController | null>(null);
  // The file this slot uploaded last: replaced (and removed server-side) by the next upload.
  const previous = useRef<string | null>(null);
  // A newer pick supersedes an older one: only the latest run may write the state.
  const run = useRef(0);

  useEffect(
    () => () => {
      controller.current?.abort();
    },
    [],
  );

  const cancel = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    run.current += 1;
    setStatus((current) => (current.kind === 'uploading' ? { kind: 'error', message: m.content.upload.cancelled } : current));
  }, [m]);

  const reset = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    previous.current = null;
    run.current += 1;
    setStatus({ kind: 'idle' });
  }, []);

  const pick = useCallback(() => {
    // Returned until the picker has answered: Button keeps its press lock meanwhile, so a double tap does not
    // open a second picker. The upload itself runs on (a newer pick may supersede it).
    return (async () => {
      const picked = await pickDocument({ locale });
      if (picked.status === 'cancelled') return;
      if (picked.status !== 'picked') {
        const message =
          picked.status === 'invalid'
            ? picked.message
            : picked.status === 'unavailable'
              ? m.content.upload.pickerUnavailable
              : m.content.upload.pickFailed;
        controller.current?.abort();
        run.current += 1;
        setStatus({ kind: 'error', message });
        return;
      }
      const upload = picked.files[0];
      if (!upload) return;

      void (async () => {
        controller.current?.abort();
        const current = new AbortController();
        controller.current = current;
        const id = (run.current += 1);
        setStatus({ kind: 'uploading', name: upload.name, progress: 0 });
        try {
          const stored = await api.content.uploadFile(upload, {
            signal: current.signal,
            previousFileId: previous.current ?? undefined,
            onProgress: (percent) => {
              if (run.current === id) setStatus({ kind: 'uploading', name: upload.name, progress: percent });
            },
          });
          if (run.current !== id) return;
          previous.current = stored.id;
          setStatus({ kind: 'uploaded', file: stored });
        } catch (failure) {
          // An aborted or superseded upload reports nothing: the newer run owns the slot.
          if (run.current !== id || current.signal.aborted) return;
          onRateLimited(failure);
          const message = isNetworkError(failure)
            ? dict.topics.errors.networkUpload
            : isApiError(failure) && failure.message
              ? failure.message
              : dict.topics.errors.uploadFailed;
          setStatus({ kind: 'error', message });
        } finally {
          if (controller.current === current) controller.current = null;
        }
      })();
    })();
  }, [api, dict, locale, m, onRateLimited]);

  return {
    status,
    file: status.kind === 'uploaded' ? status.file : null,
    uploading: status.kind === 'uploading',
    pick,
    cancel,
    reset,
  };
}
