// Web has no scheduled local notifications the app could rely on: the service reports itself as
// unsupported and every call is a no-op, so the settings rows are shown disabled.
import type { LocalNotifications } from './local-notifications.types';

export const REMINDER_CHANNEL_ID = 'reminders';

export const localNotifications: LocalNotifications = {
  supported: false,
  getPermission: async () => ({ status: 'unavailable', canAskAgain: false }),
  requestPermission: async () => ({ status: 'unavailable', canAskAgain: false }),
  ensureChannel: async () => undefined,
  sync: async () => undefined,
  cancelAll: async () => undefined,
  listenForOpens: () => () => undefined,
};
