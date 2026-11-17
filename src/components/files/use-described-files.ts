import { useEffect, useMemo, useState } from 'react';

import { isApiError } from '@/api/errors';
import type { FileRef } from '@/api/types';
import { useFileService } from '@/services/files/file-service-context';

import { applyDescription, type FileDescription, type ViewerFile } from './viewer-file';

/**
 * The files of the viewer with the stored metadata of every file named in `describeIds` read from
 * `FileService.describe` — files a deep link (or a web reload) names by id alone, whose name and type in the
 * link are untrusted (`viewer-handoff.ts`). Until its description arrives such a file is `pending`; a file
 * that does not exist or may not be read (`404 fileNotFound`) is `missing`; any other failure (network)
 * leaves it without a name and a type, so its page downloads it by id and shows that error with a retry.
 */
export function useDescribedFiles(
  files: ViewerFile[],
  describeIds: readonly string[] | undefined,
): {
  files: ViewerFile[];
  pendingIds: ReadonlySet<string>;
  missingIds: ReadonlySet<string>;
} {
  const service = useFileService();
  const [described, setDescribed] = useState<ReadonlyMap<string, FileDescription>>(() => new Map());
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
      service
        .describe(id)
        .then((ref: FileRef) => settle(id, { status: 'ready', ref }))
        .catch((error: unknown) =>
          settle(id, {
            status: 'failed',
            notFound: isApiError(error) && error.code === 'fileNotFound',
          }),
        );
    }
    return () => {
      active = false;
    };
  }, [service, idsKey]);

  return useMemo(() => {
    const wanted = new Set(idsKey === '' ? [] : idsKey.split('\u0000'));
    const pendingIds = new Set<string>();
    const missingIds = new Set<string>();
    const result = files.map((file) => {
      if (!wanted.has(file.id)) return file;
      const description = described.get(file.id);
      if (!description) pendingIds.add(file.id);
      else if (description.status === 'failed' && description.notFound) missingIds.add(file.id);
      return applyDescription(file, description);
    });
    return { files: result, pendingIds, missingIds };
  }, [files, described, idsKey]);
}
