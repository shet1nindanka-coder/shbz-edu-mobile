// Disk cache for downloaded files (native). Files are immutable — a replaced file gets a new id — so the
// cache key is the `fileId`, entries are never re-validated, and the only upkeep is trimming by size
// (docs/spec/09-data-i18n-math.md §5.2). Layout: <cache>/shbz-files/<fileId>/<safe name>.
import { Directory, File, Paths } from 'expo-file-system';

import { cacheFileName, safeFileId } from './file-names';

const DIRECTORY = 'shbz-files';
/** The cache may grow to this size before the stalest entries are dropped. */
export const FILE_CACHE_MAX_BYTES = 200 * 1024 * 1024;

export type CacheableFile = { id: string; originalName: string; mimeType: string };

function cacheRoot(): Directory {
  return new Directory(Paths.cache, DIRECTORY);
}

function entryDirectory(fileId: string): Directory {
  return new Directory(cacheRoot(), safeFileId(fileId));
}

function entryFile(file: CacheableFile): File {
  return new File(entryDirectory(file.id), cacheFileName(file.originalName, file.mimeType));
}

/** Local URI of the cached copy, or null when the file has not been downloaded (or was purged). */
export function findCachedFile(file: CacheableFile): string | null {
  try {
    const cached = entryFile(file);
    return cached.exists && cached.size > 0 ? cached.uri : null;
  } catch {
    return null;
  }
}

/** Where the download of `file` must be written: the directory exists, a stale partial file is gone. */
export function prepareCacheTarget(file: CacheableFile): File {
  const directory = entryDirectory(file.id);
  if (!directory.exists) directory.create({ intermediates: true, idempotent: true });
  const target = entryFile(file);
  if (target.exists) target.delete();
  return target;
}

/** Removes one entry (a failed or cancelled download must not leave a partial file behind). */
export function dropCachedFile(fileId: string): void {
  try {
    const directory = entryDirectory(fileId);
    if (directory.exists) directory.delete();
  } catch {
    // Already gone.
  }
}

/** Empties the cache (sign-out: another user must not find the previous user's files on disk). */
export function clearFileCache(): void {
  try {
    const root = cacheRoot();
    if (root.exists) root.delete();
  } catch {
    // Nothing cached.
  }
}

/** Drops the least recently written entries until the cache fits `maxBytes`. Returns the bytes freed. */
export function trimFileCache(maxBytes: number = FILE_CACHE_MAX_BYTES): number {
  try {
    const root = cacheRoot();
    if (!root.exists) return 0;
    const entries = root
      .list()
      .filter((entry): entry is Directory => entry instanceof Directory)
      .map((directory) => {
        const info = directory.info();
        return { directory, size: info.size ?? 0, modified: info.modificationTime ?? 0 };
      })
      .sort((a, b) => a.modified - b.modified);
    let total = entries.reduce((sum, entry) => sum + entry.size, 0);
    let freed = 0;
    for (const entry of entries) {
      if (total <= maxBytes) break;
      entry.directory.delete();
      total -= entry.size;
      freed += entry.size;
    }
    return freed;
  } catch {
    return 0;
  }
}
