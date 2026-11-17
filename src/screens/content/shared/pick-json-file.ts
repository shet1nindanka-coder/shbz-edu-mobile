// Picks the AI reply for the import panel and reads it as text on the device
// (docs/spec/07-developer-content.md §1.5: «.json / .txt, only the first file, read as text»).
// The shared document picker of `@/services/photos` accepts topic files only (PDF / DOCX / images), so
// the JSON picker lives with the import panel. expo-document-picker has a web implementation.
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';

export type PickedText =
  | { status: 'picked'; name: string; text: string }
  | { status: 'cancelled' }
  /** The picker could not be opened or the file could not be read. */
  | { status: 'failed' };

/** `application/json`, `.json`, `.txt` — the site's `accept`; some Android providers report JSON as octet-stream. */
const JSON_MIME_TYPES = ['application/json', 'text/plain', 'text/json', 'application/octet-stream'];

async function readAssetText(asset: DocumentPicker.DocumentPickerAsset): Promise<string> {
  if (Platform.OS === 'web') {
    // The web picker always hands over the browser's `File`; without it there is nothing to read.
    if (!asset.file) throw new Error('no file');
    return asset.file.text();
  }
  return new File(asset.uri).text();
}

export async function pickJsonFile(): Promise<PickedText> {
  let result: DocumentPicker.DocumentPickerResult;
  try {
    result = await DocumentPicker.getDocumentAsync({ type: JSON_MIME_TYPES, copyToCacheDirectory: true, multiple: false });
  } catch {
    return { status: 'failed' };
  }
  if (result.canceled) return { status: 'cancelled' };
  const asset = result.assets[0];
  if (!asset) return { status: 'cancelled' };
  try {
    return { status: 'picked', name: asset.name, text: await readAssetText(asset) };
  } catch {
    return { status: 'failed' };
  }
}
