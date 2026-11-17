import type { ReminderCategory } from '../preferences';

import type { LocalReminder, ReminderLink } from './reminders';

/** `unavailable` — the platform cannot show local notifications (web). */
export type ReminderPermission = 'granted' | 'denied' | 'undetermined' | 'unavailable';

export type ReminderPermissionState = {
  status: ReminderPermission;
  /** False once the OS will no longer show its prompt — the user has to open the device settings. */
  canAskAgain: boolean;
};

/**
 * Android 12+: whether reminders fire at their exact time (the "alarms & reminders" special access).
 * Without it the OS delivers them at an approximate time. `granted` on iOS and below Android 12;
 * `unavailable` when the runtime cannot tell or cannot ask (e.g. a host app without the permission).
 */
export type ExactTimingState = {
  status: 'granted' | 'denied' | 'unavailable';
  /** The system settings page that grants it can be opened. */
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
  /** Cancels every reminder of this app (all categories off, notifications denied). */
  cancelAll(): Promise<void>;
  /**
   * Sign-out: cancels every scheduled reminder AND removes the delivered ones from the tray / lock screen,
   * so nothing of the previous account stays visible or tappable.
   */
  removeAll(): Promise<void>;
  getExactTiming(): Promise<ExactTimingState>;
  /**
   * Opens the system page that grants exact timing and resolves when the user is back. When it was
   * granted, the reminders already scheduled are scheduled again (an alarm set before stays inexact).
   */
  requestExactTiming(): Promise<ExactTimingState>;
  /** `onOpen` receives the link of a tapped reminder, including the one that launched the app. Returns the unsubscribe function. */
  listenForOpens(onOpen: (link: ReminderLink) => void): () => void;
}
