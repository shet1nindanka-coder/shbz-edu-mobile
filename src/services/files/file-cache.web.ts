// Web has no app cache directory: the browser's HTTP cache does the job, and a "downloaded" file is
// simply its URL. Every function is a no-op with the native signatures.
export const FILE_CACHE_MAX_BYTES = 200 * 1024 * 1024;

export type CacheableFile = { id: string; originalName: string; mimeType: string };

export function findCachedFile(_file: CacheableFile): string | null {
  return null;
}

export function dropCachedFile(_fileId: string): void {}

export function clearFileCache(): void {}

export function trimFileCache(_maxBytes: number = FILE_CACHE_MAX_BYTES): number {
  return 0;
}
