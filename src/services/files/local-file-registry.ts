// Runtime registry of files picked on this device. In mock mode an "upload" has nowhere to go, so the
// mock backend registers the picked file under the `fileId` of the row it creates, and the mock
// FileService then shows the real picture instead of a bundled sample (docs/spec/90-addendum-5.md A.6
// item 4). In-memory and pure; `local-file-store` adds the on-disk copy.
export type LocalFile = {
  /** Local URI (file://, content://, blob:). */
  uri: string;
  mimeType: string;
  originalName: string;
  /** Bytes. */
  size: number;
};

const registry = new Map<string, LocalFile>();

/** Makes `fileId` resolve to this local file. Re-registering an id replaces the previous entry. */
export function registerLocalFile(fileId: string, file: LocalFile): void {
  registry.set(fileId, { uri: file.uri, mimeType: file.mimeType, originalName: file.originalName, size: file.size });
}

/** The local file registered under `fileId` in this session, or null. */
export function getRegisteredLocalFile(fileId: string): LocalFile | null {
  return registry.get(fileId) ?? null;
}

export function unregisterLocalFile(fileId: string): boolean {
  return registry.delete(fileId);
}

/** Forgets every registration (sign-out, mock reset, tests). */
export function clearLocalFileRegistry(): void {
  registry.clear();
}
