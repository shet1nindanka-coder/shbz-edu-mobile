// What the file components are given: a reference, never a URL (docs/spec/00-unified-contract.md —
// "a response never contains a URL"). Pure helpers, no React.
import type { DownloadableFile } from '@/api/client';
import { getFileExtension } from '@/domain/files';
import { fileKindOf, type FileKind } from '@/services/files/file-names';
import type { IconName } from '@/ui';

/**
 * One file shown by `FileViewer`: a stored file (`FileRef`, `StoredFileRef`, a photo mapped to
 * `{ id: fileId, originalName, mimeType }`) or a document the app has already downloaded, such as a
 * generated report (`DownloadedFile` → `{ id, originalName: fileName, mimeType, localUri: uri }`).
 */
export type ViewerFile = {
  /** `StoredFile` id — what `FileService` takes; for a local document, any stable key. */
  id: string;
  originalName: string;
  mimeType: string;
  /** Bytes, when known (shown in file cards, enables download progress). */
  size?: number;
  /** Already on disk: the viewer shows this URI and never calls `FileService`. */
  localUri?: string;
};

export function viewerFileKind(file: Pick<ViewerFile, 'mimeType'>): FileKind {
  return fileKindOf(file.mimeType);
}

/** The reference `FileService.download` accepts. */
export function toDownloadable(file: ViewerFile): DownloadableFile {
  return typeof file.size === 'number'
    ? { id: file.id, originalName: file.originalName, mimeType: file.mimeType, size: file.size }
    : { id: file.id, originalName: file.originalName, mimeType: file.mimeType };
}

const TYPE_BY_MIME: Record<string, string> = {
  'application/pdf': 'PDF',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
  'image/png': 'PNG',
  'image/jpeg': 'JPG',
};

/** Short type badge: "PDF", "DOCX", "JPG"… — a format name, the same in every language. */
export function fileTypeLabel(file: Pick<ViewerFile, 'mimeType' | 'originalName'>): string {
  const known = TYPE_BY_MIME[file.mimeType.trim().toLowerCase()];
  if (known) return known;
  const extension = getFileExtension(file.originalName).slice(1).toUpperCase();
  return extension.slice(0, 5);
}

export function fileIconName(kind: FileKind): IconName {
  return kind === 'image' ? 'image' : 'file';
}
