// What the file components are given: a reference, never a URL (docs/spec/00-unified-contract.md —
// "a response never contains a URL"). Pure helpers, no React.
import type { DownloadableFile } from '@/api/client';
import type { FileRef } from '@/api/types';
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

/**
 * The name to show for a file. A file the viewer route knows by its id alone (a deep link) has an empty
 * name — the link's own name is never shown (`viewer-handoff.ts`) — and gets the neutral word instead.
 */
export function viewerFileName(file: Pick<ViewerFile, 'originalName'>, untitled: string): string {
  return file.originalName.trim() === '' ? untitled : file.originalName;
}

export function viewerFileKind(file: Pick<ViewerFile, 'mimeType'>): FileKind {
  return fileKindOf(file.mimeType);
}

/** What `FileService.describe` answered for a file the viewer knows by id alone (`useDescribedFiles`). */
export type FileDescription =
  | { status: 'ready'; ref: FileRef }
  /** `notFound` — the service answered `404 fileNotFound` (missing or not readable): nothing to retry. */
  | { status: 'failed'; notFound: boolean };

/**
 * A file known by id alone, typed from the stored file instead of its link: the stored name, type and size
 * once described; no name and no type while the description is pending or after it failed — the link's own
 * name and type are never used (a PDF linked as `text/html` or as `image/png` is still a PDF).
 */
export function applyDescription(file: ViewerFile, description: FileDescription | undefined): ViewerFile {
  const base: ViewerFile = { id: file.id, originalName: '', mimeType: '' };
  if (file.localUri !== undefined) base.localUri = file.localUri;
  if (description?.status !== 'ready') return base;
  const { originalName, mimeType, size } = description.ref;
  const described: ViewerFile = { ...base, originalName, mimeType };
  if (typeof size === 'number' && Number.isFinite(size) && size > 0) described.size = size;
  return described;
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
