// Web half of the local-file registry: there is no document directory, a picked file is a blob: URL that
// lives as long as the page. Registration is therefore in-memory only.
import {
  clearLocalFileRegistry,
  getRegisteredLocalFile,
  registerLocalFile,
  unregisterLocalFile,
  type LocalFile,
} from './local-file-registry';

export async function importLocalFile(fileId: string, file: LocalFile): Promise<LocalFile> {
  registerLocalFile(fileId, file);
  return file;
}

export function resolveLocalFile(fileId: string): LocalFile | null {
  return getRegisteredLocalFile(fileId);
}

export function forgetLocalFile(fileId: string): void {
  unregisterLocalFile(fileId);
}

/** Drops every registration (a reset of the mock dataset; never a sign-out — see the native variant). */
export function forgetAllLocalFiles(): void {
  clearLocalFileRegistry();
}
