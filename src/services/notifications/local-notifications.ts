// Local (on-device) notifications through expo-notifications. Works in Expo Go; nothing here talks to a
// push service — see `push-registration.ts` for the one place remote push will plug in. Metro picks
// `local-notifications.web.ts` on web, where everything is a no-op.
import * as Notifications from 'expo-notifications';
import { AndroidImportance, IosAuthorizationStatus } from 'expo-notifications';
import { Platform } from 'react-native';

import type { LocalNotifications, ReminderPermissionState } from './local-notifications.types';
import { REMINDER_ID_PREFIX, diffReminders, reminderIdentifier, type LocalReminder, type ReminderLink } from './reminders';

/** Android channel of every reminder. The id is stable; the visible name follows the interface language. */
export const REMINDER_CHANNEL_ID = 'reminders';

function toState(response: Notifications.NotificationPermissionsStatus): ReminderPermissionState {
  // iOS "provisional" delivers quietly — good enough to count as granted.
  const provisional = response.ios?.status === IosAuthorizationStatus.PROVISIONAL;
  if (response.granted || provisional) return { status: 'granted', canAskAgain: response.canAskAgain };
  return { status: response.status === 'denied' ? 'denied' : 'undetermined', canAskAgain: response.canAskAgain };
}

function linkOf(response: Notifications.NotificationResponse | null): ReminderLink | null {
  const data = response?.notification.request.content.data;
  const link = data && typeof data === 'object' ? (data as Record<string, unknown>).link : null;
  if (typeof link !== 'object' || link === null) return null;
  return typeof (link as { screen?: unknown }).screen === 'string' ? (link as ReminderLink) : null;
}

let handlerInstalled = false;

/** A reminder that fires while the app is open is still shown as a banner (the default is to drop it). */
function installForegroundHandler(): void {
  if (handlerInstalled) return;
  handlerInstalled = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

async function schedule(reminder: LocalReminder): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    identifier: reminderIdentifier(reminder),
    content: { title: reminder.title, body: reminder.body, data: { link: reminder.link } },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: reminder.fireAt,
      channelId: Platform.OS === 'android' ? REMINDER_CHANNEL_ID : undefined,
    },
  });
}

export const localNotifications: LocalNotifications = {
  supported: true,

  async getPermission() {
    try {
      return toState(await Notifications.getPermissionsAsync());
    } catch {
      return { status: 'unavailable', canAskAgain: false };
    }
  },

  async requestPermission() {
    try {
      return toState(
        await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } }),
      );
    } catch {
      return { status: 'unavailable', canAskAgain: false };
    }
  },

  async ensureChannel(name) {
    if (Platform.OS !== 'android') return;
    try {
      await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL_ID, {
        name,
        importance: AndroidImportance.DEFAULT,
      });
    } catch {
      // Without the channel Android falls back to its default one.
    }
  },

  async sync(reminders) {
    try {
      installForegroundHandler();
      const scheduled = await Notifications.getAllScheduledNotificationsAsync();
      const plan = diffReminders(
        scheduled.map((request) => request.identifier),
        reminders,
      );
      await Promise.all(plan.cancel.map((identifier) => Notifications.cancelScheduledNotificationAsync(identifier)));
      for (const reminder of plan.schedule) await schedule(reminder);
    } catch {
      // Reminders are a convenience: a failed sync is retried on the next data change.
    }
  },

  async cancelAll() {
    try {
      const scheduled = await Notifications.getAllScheduledNotificationsAsync();
      await Promise.all(
        scheduled
          .filter((request) => request.identifier.startsWith(`${REMINDER_ID_PREFIX}:`))
          .map((request) => Notifications.cancelScheduledNotificationAsync(request.identifier)),
      );
    } catch {
      // Nothing scheduled or the module is unavailable.
    }
  },

  listenForOpens(onOpen) {
    let active = true;
    // The tap that started the app arrives before any listener exists.
    try {
      const initial = linkOf(Notifications.getLastNotificationResponse());
      if (initial) {
        Notifications.clearLastNotificationResponse();
        // Defer: the navigator may not be mounted during the first render.
        setTimeout(() => {
          if (active) onOpen(initial);
        }, 0);
      }
    } catch {
      // No stored response.
    }
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const link = linkOf(response);
      if (link) onOpen(link);
    });
    return () => {
      active = false;
      subscription.remove();
    };
  },
};
