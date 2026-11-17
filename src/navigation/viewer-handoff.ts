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
 * any words («Введите пароль заново») into the app's own chrome. So does the file name — the viewer shows
 * it as the header, as the document name and in its accessibility label — and so do the type and size: the
 * file references of the app's own screens are kept here, and a file the link alone describes keeps only
 * its id. Its name and type are left empty and the viewer reads them from the stored file
 * (`FileService.describe`, access checked) — a link cannot make a PDF render as a picture or as
 * "preview unavailable", and a reload of a file the app opened itself still shows its real name.
 *
 * Pure: no React, no expo-router.
 */
import type { FileViewerFile } from "./routes";

/** More than any one set of documents the app opens; the oldest entries fall out. */
const MAX_ENTRIES = 64;

/** What `openFiles` handed over for one file id: the reference of the app's own screen. */
const handedOver = new Map<string, FileViewerFile>();
/** Title of the last opened set, keyed by its file ids. */
let lastTitle: { key: string; title: string } | null = null;

function setKey(files: readonly FileViewerFile[]): string {
  return files.map((file) => file.id).join("\u0000");
}

/**
 * Remembers every file reference (name, type, size, `localUri`) and the viewer title of this set. Call
 * right before navigating to the viewer.
 */
export function handOverViewerFiles(files: readonly FileViewerFile[], title?: string): void {
  lastTitle = title ? { key: setKey(files), title } : null;
  for (const file of files) {
    // Re-insert so the entry counts as the newest one.
    handedOver.delete(file.id);
    handedOver.set(file.id, { ...file });
  }
  while (handedOver.size > MAX_ENTRIES) {
    const oldest = handedOver.keys().next();
    if (oldest.done) break;
    handedOver.delete(oldest.value);
  }
}

/**
 * The files of the route as the viewer may show them: a file `openFiles` handed over gets its own reference
 * back (with its `localUri`); any other file keeps its id only — an empty name and type, no size, no
 * `localUri` — and is listed in `linkOnlyIds`, for the viewer to describe from the stored file.
 */
export function viewerRouteFiles(files: readonly FileViewerFile[]): { files: FileViewerFile[]; linkOnlyIds: string[] } {
  const linkOnlyIds: string[] = [];
  const resolved = files.map((file) => {
    const own = handedOver.get(file.id);
    if (own) return { ...own };
    linkOnlyIds.push(file.id);
    return { id: file.id, originalName: "", mimeType: "" };
  });
  return { files: resolved, linkOnlyIds };
}

/** `viewerRouteFiles(files).files`. */
export function withHandedOverUris(files: readonly FileViewerFile[]): FileViewerFile[] {
  return viewerRouteFiles(files).files;
}

/** The title `openFiles` gave for exactly this set of files, or undefined (a deep link, a web reload). */
export function handedOverTitle(files: readonly FileViewerFile[]): string | undefined {
  return lastTitle && lastTitle.key === setKey(files) ? lastTitle.title : undefined;
}

/** Sign-out: nothing of the previous session stays addressable. */
export function clearViewerHandoff(): void {
  handedOver.clear();
  lastTitle = null;
}
