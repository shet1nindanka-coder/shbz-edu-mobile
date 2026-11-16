import { useCallback, useState } from 'react';
import { Linking, Platform } from 'react-native';

import type { PhotoUpload } from '@/api/types';
import type { PhotoSource } from '@/components/files';
import { useI18n } from '@/i18n';
import { pickFromCamera, pickFromLibrary, type PickResult } from '@/services/photos';
import { Notice, TextButton } from '@/ui';

/** Why a pick produced no photos, in words for the student. */
export type PickProblem = {
  title?: string;
  text: string;
  /** The OS will not ask again: offer the device settings. */
  settings: boolean;
};

export type PhotoSourceFlow = {
  /** The "camera or gallery" sheet is open. */
  sheetOpen: boolean;
  openSheet: () => void;
  closeSheet: () => void;
  /** Runs the chosen picker; resolves when it has finished (photos handed to `onPicked`, or a problem set). */
  select: (source: PhotoSource) => void;
  /** A picker is open or the photos are being re-encoded. */
  preparing: boolean;
  problem: PickProblem | null;
  clearProblem: () => void;
};

// iOS cannot present the system picker while the source sheet is still being dismissed (its exit takes
// 160 ms); the call would be dropped silently.
const IOS_SHEET_EXIT_MS = 320;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Camera / gallery flow for solution photos (03 §1 H2.a and L2 "Mobile translation"; 90-addendum-5 A.6
 * rule 9): the picker is capped at `limit` free slots, and what comes back is already a bounded JPEG that
 * passed the site's upload rules.
 */
export function usePhotoSource(limit: number, onPicked: (files: PhotoUpload[]) => void): PhotoSourceFlow {
  const { locale, m } = useI18n();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [problem, setProblem] = useState<PickProblem | null>(null);

  const handle = useCallback(
    (result: PickResult<PhotoUpload>) => {
      const t = m.common.photos;
      switch (result.status) {
        case 'picked':
          if (result.files.length > 0) onPicked(result.files.slice(0, Math.max(1, limit)));
          return;
        case 'cancelled':
          return;
        case 'denied': {
          const camera = result.permission === 'camera';
          setProblem({
            title: camera ? t.cameraPermissionTitle : t.galleryPermissionTitle,
            text: result.canAskAgain ? (camera ? t.cameraPermissionBody : t.galleryPermissionBody) : t.permissionDenied,
            settings: !result.canAskAgain,
          });
          return;
        }
        case 'unavailable':
          setProblem({ text: t.cameraUnavailable, settings: false });
          return;
        case 'invalid':
          setProblem({ text: result.message, settings: false });
          return;
        default:
          setProblem({ text: t.pickFailed, settings: false });
      }
    },
    [limit, m, onPicked],
  );

  const select = useCallback(
    (source: PhotoSource) => {
      if (limit <= 0) return;
      setProblem(null);
      setPreparing(true);
      const run = async () => {
        if (Platform.OS === 'ios') await wait(IOS_SHEET_EXIT_MS);
        return source === 'camera' ? pickFromCamera({ locale }) : pickFromLibrary({ multiple: limit > 1, limit, locale });
      };
      run()
        .then(handle, () => setProblem({ text: m.common.photos.pickFailed, settings: false }))
        .finally(() => setPreparing(false));
    },
    [handle, limit, locale, m],
  );

  return {
    sheetOpen,
    openSheet: useCallback(() => setSheetOpen(true), []),
    closeSheet: useCallback(() => setSheetOpen(false), []),
    select,
    preparing,
    problem,
    clearProblem: useCallback(() => setProblem(null), []),
  };
}

/** The notice of a failed pick; with "open settings" when the OS will not ask for the permission again. */
export function PickProblemNotice({ problem, onDismiss, testID }: { problem: PickProblem; onDismiss: () => void; testID?: string }) {
  const { m } = useI18n();
  return (
    <Notice
      tone="error"
      title={problem.title}
      text={problem.text}
      onDismiss={onDismiss}
      dismissLabel={m.common.actions.close}
      // The browser has no app settings to open.
      action={
        problem.settings && Platform.OS !== 'web' ? (
          <TextButton label={m.common.actions.openSettings} onPress={() => void Linking.openSettings()} />
        ) : undefined
      }
      testID={testID}
    />
  );
}
