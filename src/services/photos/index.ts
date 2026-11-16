// Pickers for uploads: solution photos (camera / library, normalised to JPEG) and topic documents.
export { pickFromCamera, pickFromLibrary, type PickFromLibraryOptions } from './photo-picker';
export { DOCUMENT_PICKER_MIME_TYPES, pickDocument } from './document-picker';
export type { PickOptions, PickResult } from './pick-result';
export {
  clampSelectionLimit,
  normalisedPhotoName,
  PHOTO_EXTENSION,
  PHOTO_JPEG_QUALITY,
  PHOTO_MAX_SIDE,
  PHOTO_MIME_TYPE,
  planPhotoResize,
  type PhotoResize,
} from './photo-rules';
