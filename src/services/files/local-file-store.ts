// On-disk half of the local-file registry (native). Picked files live in the picker's cache, which the
// OS may purge; a file the mock backend keeps a row for is copied into the document directory under its
// `fileId`, and found there again after an app restart, when the in-memory registry is empty
// (docs/spec/09-data-i18n-math.md §5.2: "The mock stores picked files in the app's document directory").
import { Directory, File, Paths } from 'expo-file-system';

import { getMimeTypeFromExtension } from '@/domain/files';

import { extensionForMime, safeFileId } from './file-names';
import {
  clearLocalFileRegistry,
  getRegisteredLocalFile,
  registerLocalFile,
  unregisterLocalFile,
  type LocalFile,
} from './local-file-registry';

const DIRECTORY = 'mock-uploads';
/** Extensions a stored copy can have — the upload whitelist. */
const KNOWN_EXTENSIONS = ['.jpg', '.png', '.pdf', '.docx'] as const;

/**
 * Ids already looked up on disk and not found. `resolveLocalFile` is called during render for every
 * thumbnail (through `FileService.source`), and almost every id is a fixture file that was never picked on
 * this device: without this set each render of a photo grid repeated four synchronous disk checks per
 * thumbnail on the JS thread. An id leaves the set when a file is imported under it.
 */
const missing = new Set<string>();

function storeDirectory(): Directory {
  return new Directory(Paths.document, DIRECTORY);
}

function storedFile(fileId: string, extension: string): File {
  return new File(storeDirectory(), `${safeFileId(fileId)}${extension}`);
}

/**
 * Copies a picked file into the document directory and registers the copy under `fileId`. Falls back to
 * registering the original URI when the copy fails — the file then lives as long as the picker cache.
 */
export async function importLocalFile(fileId: string, file: LocalFile): Promise<LocalFile> {
  let stored = file;
  try {
    const directory = storeDirectory();
    if (!directory.exists) directory.create({ intermediates: true, idempotent: true });
    const target = storedFile(fileId, extensionForMime(file.mimeType) || '.bin');
    if (target.exists) target.delete();
    await new File(file.uri).copy(target);
    stored = { ...file, uri: target.uri };
  } catch {
    // Keep the picker's own URI.
  }
  missing.delete(fileId);
  registerLocalFile(fileId, stored);
  return stored;
}

/** The local file behind `fileId`: this session's registration, else a copy left by an earlier one. */
export function resolveLocalFile(fileId: string): LocalFile | null {
  const registered = getRegisteredLocalFile(fileId);
  if (registered) return registered;
  if (missing.has(fileId)) return null;
  try {
    for (const extension of KNOWN_EXTENSIONS) {
      const candidate = storedFile(fileId, extension);
      if (candidate.exists) {
        const found: LocalFile = {
          uri: candidate.uri,
          mimeType: getMimeTypeFromExtension(extension),
          originalName: candidate.name,
          size: candidate.size,
        };
        registerLocalFile(fileId, found);
        return found;
      }
    }
  } catch {
    // The document directory is unreadable: behave as if nothing was stored.
  }
  missing.add(fileId);
  return null;
}

/** Drops the registration and the stored copy (the row was deleted). */
export function forgetLocalFile(fileId: string): void {
  unregisterLocalFile(fileId);
  try {
    for (const extension of KNOWN_EXTENSIONS) {
      const candidate = storedFile(fileId, extension);
      if (candidate.exists) candidate.delete();
    }
  } catch {
    // Nothing to clean up.
  }
}

/**
 * Drops every registration and every stored copy. For a reset of the mock dataset only: these files are
 * the mock server's storage, so a sign-out must NOT clear them (the teacher reviews the photo the student
 * has just handed in on the same device).
 */
export function forgetAllLocalFiles(): void {
  clearLocalFileRegistry();
  missing.clear();
  try {
    const directory = storeDirectory();
    if (directory.exists) directory.delete();
  } catch {
    // Nothing to clean up.
  }
}
