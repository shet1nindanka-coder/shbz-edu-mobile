// File picker for the developer's topic files — theory, homework, answers (docs/spec/08-design-system.md
// §5.15: the site's dropzone becomes a tap that opens the system file browser). PDF, DOCX, PNG and JPG,
// checked with the site's upload rules before anything is sent. expo-document-picker has a web
// implementation (a file input), so this module runs unchanged on web.
import * as DocumentPicker from 'expo-document-picker';

import type { FileUpload } from '@/api/types';
import { allowedUploadExtensions, getMimeTypeFromExtension } from '@/domain/files';
import { UploadValidationError, validateUploadMetadata } from '@/domain/upload-validation';
import { DEFAULT_LOCALE } from '@/lib/i18n/locale';

import { getLocalFileSize } from './file-size';
import type { PickOptions, PickResult } from './pick-result';

/** MIME types offered by the system browser — the upload whitelist. */
export const DOCUMENT_PICKER_MIME_TYPES = allowedUploadExtensions
  .map(getMimeTypeFromExtension)
  .filter((type, index, all) => all.indexOf(type) === index);

/** Picks one topic file. The MIME type sent with the upload is derived from the extension, as the server does. */
export async function pickDocument(options: PickOptions = {}): Promise<PickResult<FileUpload>> {
  const locale = options.locale ?? DEFAULT_LOCALE;
  let result: DocumentPicker.DocumentPickerResult;
  try {
    result = await DocumentPicker.getDocumentAsync({
      type: DOCUMENT_PICKER_MIME_TYPES,
      // The upload reads the file later; a copy in the app cache outlives the picker's temporary grant.
      copyToCacheDirectory: true,
      multiple: false,
    });
  } catch {
    return { status: 'failed' };
  }
  if (result.canceled) return { status: 'cancelled' };
  const asset = result.assets[0];
  if (!asset) return { status: 'cancelled' };

  const size = typeof asset.size === 'number' && asset.size > 0 ? asset.size : await getLocalFileSize(asset.uri);
  try {
    // Pickers report all sorts of MIME types for the same file (Android gives octet-stream for DOCX);
    // the extension is what the server trusts, so the name is validated and typed by it.
    const checked = validateUploadMetadata(asset.name, '', size, locale);
    return {
      status: 'picked',
      files: [{ uri: asset.uri, name: checked.originalName, mimeType: checked.mimeType, size }],
    };
  } catch (error) {
    if (error instanceof UploadValidationError) return { status: 'invalid', message: error.message };
    return { status: 'failed' };
  }
}
