// Picks a text file and reads it on the device — the AI reply of the topic import
// (docs/spec/07-developer-content.md §1.5: «.json / .txt, only the first file, read as text»).
// `pickDocument` accepts topic files only (PDF / DOCX / images) and hands back an upload; this one hands
// back the text. expo-document-picker has a web implementation (a file input).
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';

export type PickedText =
  | { status: 'picked'; name: string; text: string }
  | { status: 'cancelled' }
  /** The picker could not be opened or the file could not be read. */
  | { status: 'failed' };

/** `application/json`, `.json`, `.txt` — the site's `accept`; some Android providers report JSON as octet-stream. */
export const JSON_PICKER_MIME_TYPES = ['application/json', 'text/plain', 'text/json', 'application/octet-stream'];

async function readAssetText(asset: DocumentPicker.DocumentPickerAsset): Promise<string> {
  if (Platform.OS === 'web') {
    // The web picker always hands over the browser's `File`; without it there is nothing to read.
    if (!asset.file) throw new Error('no file');
    return asset.file.text();
  }
  return new File(asset.uri).text();
}

/** Opens the system file browser for one JSON / text file and returns its content. */
export async function pickJsonFile(): Promise<PickedText> {
  let result: DocumentPicker.DocumentPickerResult;
  try {
    result = await DocumentPicker.getDocumentAsync({ type: JSON_PICKER_MIME_TYPES, copyToCacheDirectory: true, multiple: false });
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
