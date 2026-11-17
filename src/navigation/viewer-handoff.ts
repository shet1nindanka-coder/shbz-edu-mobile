/**
 * Hand-over of already downloaded documents to the file-viewer route.
 *
 * A route is a deep link: whatever sits in its params can be written by another app or a web page
 * (`shbz://file-viewer?files=…`). A file reference (`id`) is safe there — the viewer asks `FileService`,
 * which checks access — but a `localUri` is not: the viewer would show whatever address the link names
 * inside the app's own chrome. So a `localUri` never travels in the URL. `openFiles` leaves it here, keyed
 * by the file id, and the viewer screen picks it up; a link that did not come from `openFiles` (a deep
 * link, a web reload) finds nothing and the file is loaded by its id like any other.
 *
 * The header title of the viewer travels the same way: a title taken from the URL would let a link put
 * any words («Введите пароль заново») into the app's own chrome. Without a handed-over title the viewer
 * shows the file name.
 *
 * Pure: no React, no expo-router.
 */
import type { FileViewerFile } from "./routes";

/** More than any one set of documents the app opens; the oldest entries fall out. */
const MAX_ENTRIES = 64;

const uris = new Map<string, string>();
/** Title of the last opened set, keyed by its file ids. */
let lastTitle: { key: string; title: string } | null = null;

function setKey(files: readonly FileViewerFile[]): string {
  return files.map((file) => file.id).join("\u0000");
}

/**
 * Remembers the `localUri` of every file that has one, and the viewer title of this set. Call right before
 * navigating to the viewer.
 */
export function handOverViewerFiles(files: readonly FileViewerFile[], title?: string): void {
  lastTitle = title ? { key: setKey(files), title } : null;
  for (const file of files) {
    if (!file.localUri) continue;
    // Re-insert so the entry counts as the newest one.
    uris.delete(file.id);
    uris.set(file.id, file.localUri);
  }
  while (uris.size > MAX_ENTRIES) {
    const oldest = uris.keys().next();
    if (oldest.done) break;
    uris.delete(oldest.value);
  }
}

/** The files of the route with the handed-over `localUri` put back; a `localUri` already on a file is dropped. */
export function withHandedOverUris(files: readonly FileViewerFile[]): FileViewerFile[] {
  return files.map((file) => {
    const { localUri: _untrusted, ...reference } = file;
    const uri = uris.get(file.id);
    return uri ? { ...reference, localUri: uri } : reference;
  });
}

/** The title `openFiles` gave for exactly this set of files, or undefined (a deep link, a web reload). */
export function handedOverTitle(files: readonly FileViewerFile[]): string | undefined {
  return lastTitle && lastTitle.key === setKey(files) ? lastTitle.title : undefined;
}

/** Sign-out: nothing of the previous session stays addressable. */
export function clearViewerHandoff(): void {
  uris.clear();
  lastTitle = null;
}
