// Naming and typing helpers for files that leave the app (cache, share sheet, "open with"). Pure.
import {
  getFileExtension,
  getMimeTypeFromExtension,
  isImageMime,
  isOfficeMime,
  isPdfMime,
} from '@/domain/files';
import { getSafeUploadFileName } from '@/domain/upload-file-name';

/** FNV-1a, 32 bit, as an unsigned integer: a stable way to pick "the same sample for the same id". */
export function hashFileId(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** A file id as a directory / file name: ids are cuid-like, but nothing else may reach the file system. */
export function safeFileId(fileId: string): string {
  const cleaned = fileId.replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 96);
  return cleaned || `file_${hashFileId(fileId).toString(36)}`;
}

const EXTENSION_BY_MIME: Record<string, string> = {
  'application/pdf': '.pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
};

export function extensionForMime(mimeType: string): string {
  return EXTENSION_BY_MIME[mimeType.trim().toLowerCase()] ?? '';
}

/**
 * Name of the cached copy: ASCII-safe (share targets and Android intents choke on exotic names), and
 * always carrying the extension of the real type — "open with" picks the app by it.
 */
export function cacheFileName(originalName: string, mimeType: string): string {
  const safe = getSafeUploadFileName(originalName.trim() || 'file');
  const wanted = extensionForMime(mimeType);
  const actual = getFileExtension(safe);
  if (!wanted) return safe;
  // .jpeg is as good as .jpg; anything else that disagrees with the MIME type gets the right suffix.
  if (actual === wanted || (wanted === '.jpg' && actual === '.jpeg')) return safe;
  if (actual && getMimeTypeFromExtension(actual) !== 'application/octet-stream') {
    return `${safe.slice(0, -actual.length)}${wanted}`;
  }
  return `${safe}${wanted}`;
}

/** Uniform Type Identifier for the iOS share sheet. */
export function utiForMime(mimeType: string): string | undefined {
  switch (mimeType.trim().toLowerCase()) {
    case 'application/pdf':
      return 'com.adobe.pdf';
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      return 'org.openxmlformats.wordprocessingml.document';
    case 'image/png':
      return 'public.png';
    case 'image/jpeg':
      return 'public.jpeg';
    default:
      return undefined;
  }
}

export type FileKind = 'image' | 'pdf' | 'docx' | 'other';

/** Which viewer a file gets (docs/spec/09-data-i18n-math.md §5.2). */
export function fileKindOf(mimeType: string): FileKind {
  if (isImageMime(mimeType)) return 'image';
  if (isPdfMime(mimeType)) return 'pdf';
  if (isOfficeMime(mimeType)) return 'docx';
  return 'other';
}
