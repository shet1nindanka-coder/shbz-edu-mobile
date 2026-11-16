// Size in bytes of a local file (native). Pickers and the image manipulator do not always report it.
import { File } from 'expo-file-system';

export async function getLocalFileSize(uri: string): Promise<number> {
  try {
    const file = new File(uri);
    return file.exists ? file.size : 0;
  } catch {
    return 0;
  }
}
