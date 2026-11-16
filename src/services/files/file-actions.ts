// What the user can do with a downloaded file outside the app (native): the share sheet, and "open in
// another app" (docs/spec/09-data-i18n-math.md §5.2). Every function takes the local URI returned by
// `FileService.download`. Metro picks `file-actions.web.ts` on web.
import { File } from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import { utiForMime } from './file-names';

export type FileActionTarget = {
  /** Local file URI. */
  uri: string;
  mimeType: string;
  /** Shown as the dialog title where the platform has one. */
  name: string;
};

export type FileActionResult =
  | { ok: true }
  /** `unavailable` — the device cannot do this at all; `noApp` — nothing installed handles the type. */
  | { ok: false; reason: 'unavailable' | 'noApp' | 'failed' };

const ACTION_VIEW = 'android.intent.action.VIEW';
/** `Intent.FLAG_GRANT_READ_URI_PERMISSION`: the receiving app may read our content:// URI. */
const FLAG_GRANT_READ_URI_PERMISSION = 1;

/** True where `shareFile` saves the file instead of opening a share sheet (web). */
export const SHARE_IS_DOWNLOAD = false;

/** System share sheet: save to Files / gallery, send to a messenger, print. */
export async function shareFile(target: FileActionTarget): Promise<FileActionResult> {
  try {
    if (!(await Sharing.isAvailableAsync())) return { ok: false, reason: 'unavailable' };
    await Sharing.shareAsync(target.uri, {
      mimeType: target.mimeType,
      UTI: utiForMime(target.mimeType),
      dialogTitle: target.name,
    });
    return { ok: true };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}

/**
 * Hands the file to a viewer outside the app. Android: an `ACTION_VIEW` intent on a content:// URI —
 * the system shows its app chooser; no handler → `noApp`. iOS: Quick Look, falling back to the share
 * sheet for types it cannot preview.
 */
export async function openInAnotherApp(target: FileActionTarget): Promise<FileActionResult> {
  if (Platform.OS === 'android') {
    try {
      await IntentLauncher.startActivityAsync(ACTION_VIEW, {
        data: new File(target.uri).contentUri,
        type: target.mimeType,
        flags: FLAG_GRANT_READ_URI_PERMISSION,
      });
      return { ok: true };
    } catch {
      // ActivityNotFoundException: nothing on the device opens this type.
      return { ok: false, reason: 'noApp' };
    }
  }
  try {
    const file = new File(target.uri);
    if (await file.canPreview({ mimeType: target.mimeType })) {
      await file.preview({ mimeType: target.mimeType, title: target.name });
      return { ok: true };
    }
  } catch {
    // Fall through to the share sheet.
  }
  return shareFile(target);
}
