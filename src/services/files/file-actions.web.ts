// Web variant of the file actions: "share" saves the file through a download link, "open in another
// app" opens it in a new tab (the browser's own viewer). Same signatures as the native module.
import { cacheFileName } from './file-names';

export type FileActionTarget = { uri: string; mimeType: string; name: string };

export type FileActionResult = { ok: true } | { ok: false; reason: 'unavailable' | 'noApp' | 'failed' };

export const SHARE_IS_DOWNLOAD = true;

export async function shareFile(target: FileActionTarget): Promise<FileActionResult> {
  if (typeof document === 'undefined') return { ok: false, reason: 'unavailable' };
  try {
    const link = document.createElement('a');
    link.href = target.uri;
    link.download = cacheFileName(target.name, target.mimeType);
    link.rel = 'noopener';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
    return { ok: true };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}

export async function openInAnotherApp(target: FileActionTarget): Promise<FileActionResult> {
  if (typeof window === 'undefined') return { ok: false, reason: 'unavailable' };
  const opened = window.open(target.uri, '_blank', 'noopener,noreferrer');
  // With `noopener` browsers return null even on success, so only a thrown error counts as a failure.
  void opened;
  return { ok: true };
}
