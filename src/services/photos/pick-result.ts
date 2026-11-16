import type { Locale } from '@/lib/i18n/locale';

/** Outcome of a picker call. Only `picked` carries files; every other state is a reason there are none. */
export type PickResult<T> =
  | { status: 'picked'; files: T[] }
  /** The user closed the picker. Not an error: show nothing. */
  | { status: 'cancelled' }
  /**
   * The OS permission is not granted. `canAskAgain: false` — the system will not prompt again; send the
   * user to the device settings (`m.common.photos.permissionDenied`, `m.common.actions.openSettings`).
   */
  | { status: 'denied'; permission: 'camera' | 'library'; canAskAgain: boolean }
  /** The device has no camera (or no picker) to offer. */
  | { status: 'unavailable' }
  /** A picked file breaks the upload rules; `message` is the site's localized text for it. */
  | { status: 'invalid'; message: string }
  /** Reading or re-encoding failed. */
  | { status: 'failed' };

export type PickOptions = {
  /** Language of validation messages. Default Russian, like the domain validators. */
  locale?: Locale;
};
