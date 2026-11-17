// File services (docs/spec/09-data-i18n-math.md §5.2): the mock `FileService`, the registry of files
// picked on this device, the disk cache, and share / open-with actions. Platform differences are hidden
// behind `.web.ts` variants.
export { createMockFileService, type MockFileLookup, type MockFileServiceOptions } from './mock-file-service';
export { FileServiceProvider, useFileService, type FileServiceProviderProps } from './file-service-context';
export {
  clearLocalFileRegistry,
  getRegisteredLocalFile,
  registerLocalFile,
  unregisterLocalFile,
  type LocalFile,
} from './local-file-registry';
export { forgetAllLocalFiles, forgetLocalFile, importLocalFile, resolveLocalFile } from './local-file-store';
export { readLocalFileBytes } from './local-file-bytes';
export { clearFileCache, dropCachedFile, FILE_CACHE_MAX_BYTES, findCachedFile, trimFileCache } from './file-cache';
export { isDeferredDocumentUri, resolveDocumentUri } from './document-uri';
export { materialiseMockSample, mockSampleUri } from './mock-sample-store';
export {
  openInAnotherApp,
  SHARE_IS_DOWNLOAD,
  shareFile,
  type FileActionResult,
  type FileActionTarget,
} from './file-actions';
export {
  cacheFileName,
  extensionForMime,
  fileKindOf,
  hashFileId,
  safeFileId,
  utiForMime,
  type FileKind,
} from './file-names';
export {
  MOCK_PHOTO_COUNT,
  pickMockPhoto,
  pickMockSample,
  type MockFileMeta,
  type MockSampleKey,
} from './mock-samples';
