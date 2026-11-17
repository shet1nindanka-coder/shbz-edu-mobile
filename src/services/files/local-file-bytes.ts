// Bytes of a local file picked on this device (native): `file://` from the image manipulator and the
// document picker's cache copy, `content://` where Android hands one over. The mock backend reads them to
// check an upload's real size and magic bytes like the site's `saveUploadedFile`
// (`MockApiClientOptions.readUploadBytes`).
import { File } from 'expo-file-system';

/** The whole content of a local file, or null when it cannot be read (the mock then skips the byte check). */
export async function readLocalFileBytes(uri: string): Promise<Uint8Array | null> {
  try {
    const file = new File(uri);
    if (!file.exists) return null;
    const bytes: unknown = await file.bytes();
    return bytes instanceof Uint8Array ? bytes : null;
  } catch {
    return null;
  }
}
