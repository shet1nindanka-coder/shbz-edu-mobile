// Pure rules for preparing a picked photo for upload (docs/spec/09-data-i18n-math.md §5.2,
// 90-addendum-5 A.6 item 9): every photo is re-encoded to JPEG — iPhone cameras produce HEIC, which the
// server rejects by extension, MIME type and magic bytes — and downscaled so a batch of ten stays under
// the 15 MiB request cap.
import { getSafeUploadFileName } from '@/domain/upload-file-name';

/** Longest side of an uploaded photo, px. Handwriting stays legible; a 12 MP shot shrinks ~3×. */
export const PHOTO_MAX_SIDE = 2400;
/** JPEG quality of the re-encoded photo. */
export const PHOTO_JPEG_QUALITY = 0.8;
export const PHOTO_MIME_TYPE = 'image/jpeg' as const;
export const PHOTO_EXTENSION = '.jpg';

export type PhotoResize = { width: number } | { height: number } | null;

/**
 * The resize to apply so the long side is at most `maxSide`; the other side follows the aspect ratio.
 * `null` — the photo is already small enough (never upscale) or its size is unknown.
 */
export function planPhotoResize(width: number, height: number, maxSide: number = PHOTO_MAX_SIDE): PhotoResize {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  if (Math.max(width, height) <= maxSide) return null;
  return width >= height ? { width: maxSide } : { height: maxSide };
}

/**
 * Upload name of a re-encoded photo: the picker's name made ASCII-safe with a `.jpg` suffix, or
 * `photo-<stamp>-<n>.jpg` when the picker gave none (camera shots, Android content URIs).
 */
export function normalisedPhotoName(originalName: string | null | undefined, stamp: number, index: number): string {
  const fallback = `photo-${stamp}-${index + 1}`;
  const trimmed = (originalName ?? '').trim();
  if (!trimmed) return `${fallback}${PHOTO_EXTENSION}`;
  const safe = getSafeUploadFileName(trimmed);
  const dot = safe.lastIndexOf('.');
  const base = (dot > 0 ? safe.slice(0, dot) : safe).slice(0, 80);
  // `getSafeUploadFileName` turns a name without Latin letters or digits into "file".
  return `${base && base !== 'file' ? base : fallback}${PHOTO_EXTENSION}`;
}

/** How many photos a picker may return: never more than the free slots, never less than zero. */
export function clampSelectionLimit(limit: number | undefined, multiple: boolean): number {
  if (!multiple) return limit === undefined ? 1 : Math.min(1, Math.max(0, Math.floor(limit)));
  // 0 means "no limit" for the system pickers; the caller always knows its own cap, so it is explicit here.
  if (limit === undefined) return 0;
  return Math.max(0, Math.floor(limit));
}

/**
 * How long the iOS system picker (camera, photo library) takes to leave the screen after it hands back its
 * result. expo-image-picker resolves the promise independently of `picker.dismiss(animated: true)`, and
 * UIKit refuses to present a modal (the photo preview sheet) while that dismissal is still running — the
 * refusal is silent and React Native never retries it.
 */
export const IOS_PICKER_EXIT_MS = 650;

/** Milliseconds still to wait before a modal may be presented over the picker that resolved at `resolvedAt`. */
export function pickerExitRemainingMs(platform: string, resolvedAt: number, now: number, exitMs: number = IOS_PICKER_EXIT_MS): number {
  if (platform !== 'ios') return 0;
  return Math.max(0, resolvedAt + exitMs - now);
}
