// File composites (docs/spec/09-data-i18n-math.md §5.2, docs/spec/08-design-system.md §5.15): the topic
// file card, the full-screen viewer, and the solution-photo grid. They take file references and read the
// `FileService` from `FileServiceProvider`.
export { FileCard, type FileCardProps } from './file-card';
export { FileViewer, type FileViewerProps } from './file-viewer';
export { FileViewerModal, type FileViewerModalProps } from './file-viewer-modal';
export { PhotoGrid, type PhotoGridItem, type PhotoGridProps } from './photo-grid';
export { PHOTO_THUMB_SIZE, PhotoThumb, type PhotoThumbProps } from './photo-thumb';
export { PhotoSourceSheet, type PhotoSource, type PhotoSourceSheetProps } from './photo-source-sheet';
export { useFileDownload, type FileDownloadState } from './use-file-download';
export { useFileActions, type FileAction, type FileActions } from './use-file-share';
export { fileIconName, fileTypeLabel, toDownloadable, viewerFileKind, type ViewerFile } from './viewer-file';
