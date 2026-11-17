// Camera and photo-library pickers for solution photos (docs/spec/03-student-homework-lesson.md §7 Q1,
// 90-addendum-5 A.6 item 9). The result is ready for `uploadHomeworkPhotos` / `submitLessonItem`: JPEG,
// long side ≤ 2400 px, a safe `.jpg` name, real size, already checked with the site's upload rules.
// expo-image-picker and expo-image-manipulator both have web implementations (a file input and a
// canvas), so this module runs unchanged on web.
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

import type { PhotoUpload } from '@/api/types';
import { MAX_UPLOAD_SIZE_BYTES, UploadValidationError, validateUploadMetadata } from '@/domain/upload-validation';
import { getDictionary } from '@/i18n/get-dictionary';
import { DEFAULT_LOCALE, type Locale } from '@/lib/i18n/locale';

import { getLocalFileSize } from './file-size';
import {
  clampSelectionLimit,
  normalisedPhotoName,
  pickerExitRemainingMs,
  PHOTO_JPEG_QUALITY,
  PHOTO_MIME_TYPE,
  planPhotoResize,
} from './photo-rules';
import type { PickOptions, PickResult } from './pick-result';

export type PickFromLibraryOptions = PickOptions & {
  /** Allow choosing several photos at once. Default false. */
  multiple?: boolean;
  /** Free slots: `maxPhotosPerAssignment − attached` for a homework, 3 for a lesson item. */
  limit?: number;
};

/**
 * Resolves `result` only once the system picker that resolved at `resolvedAt` has left the screen (iOS), so
 * the caller may present a sheet right away (the lesson's photo preview). The re-encoding usually covers
 * most of the wait already.
 */
async function afterPickerExit<T>(resolvedAt: number, result: T): Promise<T> {
  const remaining = pickerExitRemainingMs(Platform.OS, resolvedAt, Date.now());
  if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
  return result;
}

/** Re-encodes one picked asset to a bounded JPEG and describes it as an upload. */
async function normalisePhoto(asset: ImagePicker.ImagePickerAsset, stamp: number, index: number): Promise<PhotoUpload> {
  const context = ImageManipulator.manipulate(asset.uri);
  const resize = planPhotoResize(asset.width, asset.height);
  if (resize) context.resize(resize);
  const image = await context.renderAsync();
  try {
    const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: PHOTO_JPEG_QUALITY });
    return {
      uri: saved.uri,
      name: normalisedPhotoName(asset.fileName, stamp, index),
      mimeType: PHOTO_MIME_TYPE,
      size: await getLocalFileSize(saved.uri),
    };
  } finally {
    // Shared native objects hold the decoded bitmap; free them as soon as the file is written.
    image.release();
    context.release();
  }
}

async function preparePhotos(
  assets: ImagePicker.ImagePickerAsset[],
  locale: Locale,
): Promise<PickResult<PhotoUpload>> {
  const stamp = Date.now();
  let photos: PhotoUpload[];
  try {
    photos = [];
    // One at a time: decoding several 12 MP bitmaps in parallel is how a phone runs out of memory.
    for (let index = 0; index < assets.length; index += 1) {
      photos.push(await normalisePhoto(assets[index], stamp, index));
    }
  } catch {
    return { status: 'failed' };
  }

  try {
    for (const photo of photos) validateUploadMetadata(photo.name, photo.mimeType, photo.size, locale);
  } catch (error) {
    if (error instanceof UploadValidationError) return { status: 'invalid', message: error.message };
    return { status: 'failed' };
  }
  // The request cap counts the whole batch, not each file.
  if (photos.reduce((sum, photo) => sum + photo.size, 0) > MAX_UPLOAD_SIZE_BYTES) {
    return { status: 'invalid', message: getDictionary(locale).apiStudent.upload.photosTooLarge };
  }
  return { status: 'picked', files: photos };
}

/**
 * Opens the camera for one photo. Asks for the camera permission first; a refusal is `denied` (show the
 * rationale `m.common.photos.cameraPermissionTitle` / `cameraPermissionBody`).
 */
export async function pickFromCamera(options: PickOptions = {}): Promise<PickResult<PhotoUpload>> {
  const locale = options.locale ?? DEFAULT_LOCALE;
  try {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      return { status: 'denied', permission: 'camera', canAskAgain: permission.canAskAgain };
    }
  } catch {
    return { status: 'unavailable' };
  }

  let result: ImagePicker.ImagePickerResult;
  try {
    result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1, exif: false });
  } catch {
    // No camera hardware (simulator, some tablets) or the system refused to start it.
    return { status: 'unavailable' };
  }
  const resolvedAt = Date.now();
  if (result.canceled) return afterPickerExit<PickResult<PhotoUpload>>(resolvedAt, { status: 'cancelled' });
  return afterPickerExit(resolvedAt, await preparePhotos(result.assets.slice(0, 1), locale));
}

/**
 * Opens the system photo picker. Modern iOS and Android pickers run out of process and need no
 * permission; if the system still refuses, the result is `denied`.
 */
export async function pickFromLibrary(options: PickFromLibraryOptions = {}): Promise<PickResult<PhotoUpload>> {
  const locale = options.locale ?? DEFAULT_LOCALE;
  const multiple = options.multiple ?? false;
  const limit = clampSelectionLimit(options.limit, multiple);
  // No free slot: nothing can be added, so do not even open the picker.
  if (options.limit !== undefined && limit === 0) return { status: 'picked', files: [] };

  let result: ImagePicker.ImagePickerResult;
  try {
    result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: multiple,
      selectionLimit: multiple ? limit : 1,
      orderedSelection: multiple,
      quality: 1,
      exif: false,
    });
  } catch {
    try {
      const permission = await ImagePicker.getMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        return { status: 'denied', permission: 'library', canAskAgain: permission.canAskAgain };
      }
    } catch {
      // Fall through.
    }
    return { status: 'failed' };
  }
  const resolvedAt = Date.now();
  if (result.canceled) return afterPickerExit<PickResult<PhotoUpload>>(resolvedAt, { status: 'cancelled' });
  // The web file input and some Android pickers ignore the selection limit.
  const assets = limit > 0 ? result.assets.slice(0, limit) : result.assets;
  const prepared = await preparePhotos(assets, locale);
  // The caller tells the user about the photos left out instead of dropping them silently.
  const dropped = result.assets.length - assets.length;
  return afterPickerExit(resolvedAt, prepared.status === 'picked' && dropped > 0 ? { ...prepared, dropped } : prepared);
}
