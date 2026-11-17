import type { ReminderCategory } from '../preferences';

import type { LocalReminder, ReminderLink } from './reminders';

/** `unavailable` — the platform cannot show local notifications (web). */
export type ReminderPermission = 'granted' | 'denied' | 'undetermined' | 'unavailable';

export type ReminderPermissionState = {
  status: ReminderPermission;
  /** False once the OS will no longer show its prompt — the user has to open the device settings. */
  canAskAgain: boolean;
};

export interface LocalNotifications {
  /** False on web: every other call is then a no-op. */
  readonly supported: boolean;
  getPermission(): Promise<ReminderPermissionState>;
  /** Shows the OS prompt when it still can; resolves with the resulting state. */
  requestPermission(): Promise<ReminderPermissionState>;
  /** Android: creates / renames the one channel reminders are posted to. */
  ensureChannel(name: string): Promise<void>;
  /**
   * Makes the device schedule equal to `reminders`: cancels what is no longer wanted, adds what is missing.
   * Categories in `keep` are left as they are (their data is not known yet, see `diffReminders`).
   */
  sync(reminders: readonly LocalReminder[], keep?: readonly ReminderCategory[]): Promise<void>;
  /** Cancels every reminder of this app (sign-out, all categories off). */
  cancelAll(): Promise<void>;
  /** `onOpen` receives the link of a tapped reminder, including the one that launched the app. Returns the unsubscribe function. */
  listenForOpens(onOpen: (link: ReminderLink) => void): () => void;
}
