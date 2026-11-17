// Local (on-device) notifications through expo-notifications. Works in Expo Go; nothing here talks to a
// push service — see `push-registration.ts` for the one place remote push will plug in. Metro picks
// `local-notifications.web.ts` on web, where everything is a no-op.
import * as Notifications from 'expo-notifications';
import { AndroidImportance, IosAuthorizationStatus } from 'expo-notifications';
import { Platform } from 'react-native';

import type { ExactTimingState, LocalNotifications, ReminderPermissionState } from './local-notifications.types';
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

function isReminder(identifier: string): boolean {
  return identifier.startsWith(`${REMINDER_ID_PREFIX}:`);
}

function toExactTiming(response: { granted: boolean; canAskAgain: boolean }): ExactTimingState {
  return { status: response.granted ? 'granted' : 'denied', canAskAgain: response.canAskAgain };
}

/** What the last `sync` wanted on the device: rescheduled when exact timing is granted later. */
let lastWanted: readonly LocalReminder[] = [];

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

  async sync(reminders, keep) {
    try {
      installForegroundHandler();
      const scheduled = await Notifications.getAllScheduledNotificationsAsync();
      const plan = diffReminders(
        scheduled.map((request) => request.identifier),
        reminders,
        keep,
      );
      lastWanted = reminders;
      await Promise.all(plan.cancel.map((identifier) => Notifications.cancelScheduledNotificationAsync(identifier)));
      for (const reminder of plan.schedule) await schedule(reminder);
    } catch {
      // Reminders are a convenience: a failed sync is retried on the next data change.
    }
  },

  async cancelAll() {
    lastWanted = [];
    try {
      const scheduled = await Notifications.getAllScheduledNotificationsAsync();
      await Promise.all(
        scheduled
          .filter((request) => isReminder(request.identifier))
          .map((request) => Notifications.cancelScheduledNotificationAsync(request.identifier)),
      );
    } catch {
      // Nothing scheduled or the module is unavailable.
    }
  },

  async removeAll() {
    await localNotifications.cancelAll();
    try {
      // A delivered notification keeps the identifier of its request.
      const presented = await Notifications.getPresentedNotificationsAsync();
      await Promise.all(
        presented
          .filter((notification) => isReminder(notification.request.identifier))
          .map((notification) => Notifications.dismissNotificationAsync(notification.request.identifier)),
      );
    } catch {
      // Nothing in the tray or the module is unavailable.
    }
  },

  async getExactTiming() {
    if (Platform.OS !== 'android') return { status: 'granted', canAskAgain: false };
    try {
      return toExactTiming(await Notifications.getExactAlarmPermissionsAsync());
    } catch {
      return { status: 'unavailable', canAskAgain: false };
    }
  },

  async requestExactTiming() {
    if (Platform.OS !== 'android') return { status: 'granted', canAskAgain: false };
    let state: ExactTimingState;
    try {
      state = toExactTiming(await Notifications.requestExactAlarmPermissionsAsync());
    } catch {
      // The host app does not declare SCHEDULE_EXACT_ALARM (e.g. Expo Go): nothing can be asked.
      return { status: 'unavailable', canAskAgain: false };
    }
    if (state.status === 'granted') {
      try {
        // An alarm keeps the mode it was set with: the same request scheduled again replaces it as exact.
        const scheduled = new Set((await Notifications.getAllScheduledNotificationsAsync()).map((request) => request.identifier));
        for (const reminder of lastWanted) if (scheduled.has(reminderIdentifier(reminder))) await schedule(reminder);
      } catch {
        // The next sync plans them again anyway.
      }
    }
    return state;
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
