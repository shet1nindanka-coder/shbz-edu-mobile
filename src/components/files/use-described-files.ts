import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { isApiError } from '@/api/errors';
import type { FileRef } from '@/api/types';
import { useFileService } from '@/services/files/file-service-context';
import { useIsOnline } from '@/services/network/network-state';

import { applyDescription, type FileDescription, type ViewerFile } from './viewer-file';

/**
 * The files of the viewer with the stored metadata of every file named in `describeIds` read from
 * `FileService.describe` — files a deep link (or a web reload) names by id alone, whose name and type in the
 * link are untrusted (`viewer-handoff.ts`). Until its description arrives such a file is `pending`; a file
 * that does not exist or may not be read (`404 fileNotFound`) is `missing`; any other failure (no
 * connection, 429, 5xx) makes it `failed`: its page shows that error with a retry (`retry`), and the
 * description is asked again when the connection returns. A failed file is never shown or handed over
 * without its stored name and type — a PDF must not become an untitled "other" document.
 */
export function useDescribedFiles(
  files: ViewerFile[],
  describeIds: readonly string[] | undefined,
): {
  files: ViewerFile[];
  pendingIds: ReadonlySet<string>;
  missingIds: ReadonlySet<string>;
  /** Description failed without an answer; the value is the error text to show (null: the generic one). */
  failedIds: ReadonlyMap<string, string | null>;
  /** Asks again for every description that failed without an answer. */
  retry: () => void;
} {
  const service = useFileService();
  const [described, setDescribed] = useState<ReadonlyMap<string, FileDescription>>(() => new Map());
  // Every round asks for the files that have no answer yet (round 0: all of them).
  const [round, setRound] = useState(0);
  const describedRef = useRef(described);
  // Declared before the request effect, so a round reads the map of the same commit.
  useEffect(() => {
    describedRef.current = described;
  }, [described]);
  const idsKey = (describeIds ?? []).join('\u0000');

  useEffect(() => {
    const ids = idsKey === '' ? [] : idsKey.split('\u0000');
    if (ids.length === 0) return;
    let active = true;
    const settle = (id: string, description: FileDescription) => {
      if (!active) return;
      setDescribed((current) => new Map(current).set(id, description));
    };
    for (const id of new Set(ids)) {
      // Already answered (or answered for good): nothing to ask again.
      if (describedRef.current.has(id)) continue;
      service
        .describe(id)
        .then((ref: FileRef) => settle(id, { status: 'ready', ref }))
        .catch((error: unknown) =>
          settle(id, {
            status: 'failed',
            notFound: isApiError(error) && error.code === 'fileNotFound',
            message: isApiError(error) && error.message.trim() !== '' ? error.message : null,
          }),
        );
    }
    return () => {
      active = false;
    };
  }, [service, idsKey, round]);

  const retry = useCallback(() => {
    // The failed files go back to pending (a spinner, nothing handed over), then the next round asks again.
    setDescribed((current) => {
      const next = new Map(current);
      for (const [id, description] of current) {
        if (description.status === 'failed' && !description.notFound) next.delete(id);
      }
      return next.size === current.size ? current : next;
    });
    setRound((current) => current + 1);
  }, []);

  // Back online: a description that failed for want of a connection is asked again by itself.
  const online = useIsOnline();
  const wasOnline = useRef(online);
  useEffect(() => {
    const cameBack = online && !wasOnline.current;
    wasOnline.current = online;
    if (!cameBack) return;
    const anyFailed = [...describedRef.current.values()].some((description) => description.status === 'failed' && !description.notFound);
    if (anyFailed) retry();
  }, [online, retry]);

  return useMemo(() => {
    const wanted = new Set(idsKey === '' ? [] : idsKey.split('\u0000'));
    const pendingIds = new Set<string>();
    const missingIds = new Set<string>();
    const failedIds = new Map<string, string | null>();
    const result = files.map((file) => {
      if (!wanted.has(file.id)) return file;
      const description = described.get(file.id);
      if (!description) pendingIds.add(file.id);
      else if (description.status === 'failed') {
        if (description.notFound) missingIds.add(file.id);
        else failedIds.set(file.id, description.message ?? null);
      }
      return applyDescription(file, description);
    });
    return { files: result, pendingIds, missingIds, failedIds, retry };
  }, [files, described, idsKey, retry]);
}
