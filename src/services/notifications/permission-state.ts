// Pure: maps what expo-notifications reports to the three states the app acts on. No native import, so it
// is unit-tested as it is.
import type { ReminderPermissionState } from './local-notifications.types';

/** The fields of expo-notifications' `NotificationPermissionsStatus` the decision needs. */
export type NativePermissionAnswer = {
  granted: boolean;
  status: string;
  canAskAgain: boolean;
  /** iOS "provisional" authorization (delivers quietly) — counted as granted. */
  provisional?: boolean;
};

/**
 * - `granted` — reminders are delivered.
 * - `undetermined` — not allowed yet, but the OS prompt can still be shown: a tap on a reminder switch asks.
 *   Android 13+ reports a never-asked POST_NOTIFICATIONS as `denied` with `canAskAgain: true`
 *   (NotificationPermissionsModule.getPermissionsWithPromiseImplApi33: `!areNotificationsEnabled() -> DENIED`),
 *   and so is a single refusal there; iOS reports `undetermined` before the first prompt.
 * - `denied` — refused for good (`canAskAgain: false`: iOS after a refusal, Android after the second one or
 *   below 13 with notifications off): only the device settings can allow it.
 */
export function permissionStateOf(answer: NativePermissionAnswer): ReminderPermissionState {
  if (answer.granted || answer.provisional === true) return { status: 'granted', canAskAgain: answer.canAskAgain };
  // The OS will not show its prompt any more, whatever the status string says.
  if (!answer.canAskAgain) return { status: 'denied', canAskAgain: false };
  return { status: 'undetermined', canAskAgain: true };
}
