// Local (on-device) notifications through expo-notifications. Works in Expo Go; nothing here talks to a
// push service — see `push-registration.ts` for the one place remote push will plug in. Metro picks
// `local-notifications.web.ts` on web, where everything is a no-op.
import * as Notifications from 'expo-notifications';
import { AndroidImportance, IosAuthorizationStatus } from 'expo-notifications';
import { AppState, Platform } from 'react-native';

import type { ExactTimingState, LocalNotifications, ReminderPermissionState } from './local-notifications.types';
import { permissionStateOf } from './permission-state';
import { REMINDER_ID_PREFIX, diffReminders, reminderIdentifier, remindersToRearm, type LocalReminder, type ReminderLink } from './reminders';

/** Android channel of every reminder. The id is stable; the visible name follows the interface language. */
export const REMINDER_CHANNEL_ID = 'reminders';

function toState(response: Notifications.NotificationPermissionsStatus): ReminderPermissionState {
  return permissionStateOf({
    granted: response.granted,
    status: response.status,
    canAskAgain: response.canAskAgain,
    provisional: response.ios?.status === IosAuthorizationStatus.PROVISIONAL,
  });
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

/** What the last `sync` wanted on the device: set again when the exact-timing access changes. */
let lastWanted: readonly LocalReminder[] = [];

/**
 * Android: identifiers whose alarm this process has set in the current exact-timing mode. An alarm keeps
 * the mode it was set with (ExpoSchedulingDelegate.setupAlarm reads canScheduleExactAlarms() once), and a
 * revoked access cancels the exact ones while expo's store still lists them — so a reminder scheduled by an
 * earlier run, or before the access changed, is set again once (`remindersToRearm`).
 */
const armed = new Set<string>();

/** Android: the exact-timing access as last read, to notice a change made in the system settings. */
let knownExact: ExactTimingState['status'] | null = null;

/**
 * Every change of the device schedule runs one after another: a re-arm after a foreground check must not
 * interleave with a sync or with the sign-out cancel (it would set again a reminder just cancelled).
 */
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
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
  const identifier = reminderIdentifier(reminder);
  await Notifications.scheduleNotificationAsync({
    identifier,
    content: { title: reminder.title, body: reminder.body, data: { link: reminder.link } },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: reminder.fireAt,
      channelId: Platform.OS === 'android' ? REMINDER_CHANNEL_ID : undefined,
    },
  });
  armed.add(identifier);
}

async function cancel(identifier: string): Promise<void> {
  armed.delete(identifier);
  await Notifications.cancelScheduledNotificationAsync(identifier);
}

async function readExactTiming(): Promise<ExactTimingState> {
  if (Platform.OS !== 'android') return { status: 'granted', canAskAgain: false };
  try {
    return toExactTiming(await Notifications.getExactAlarmPermissionsAsync());
  } catch {
    return { status: 'unavailable', canAskAgain: false };
  }
}

/** Records the access just read; a change makes every alarm set so far of the wrong mode. */
function noteExactTiming(state: ExactTimingState): void {
  if (state.status === 'unavailable') return;
  if (knownExact !== null && knownExact !== state.status) armed.clear();
  knownExact = state.status;
}

/** Android: sets again the wanted reminders that are scheduled but not armed in the current mode. */
async function rearmScheduled(): Promise<void> {
  if (Platform.OS !== 'android' || lastWanted.length === 0) return;
  const scheduled = (await Notifications.getAllScheduledNotificationsAsync()).map((request) => request.identifier);
  // The same request scheduled again replaces the alarm, now in the current mode.
  for (const reminder of remindersToRearm(scheduled, lastWanted, armed)) await schedule(reminder);
}

/** After the exact-timing access was read: when it changed, the reminders already scheduled are set again. */
function reconcileExactTiming(state: ExactTimingState): Promise<void> {
  return serial(async () => {
    noteExactTiming(state);
    try {
      await rearmScheduled();
    } catch {
      // The next sync arms them anyway.
    }
  });
}

let foregroundWatched = false;

/**
 * Android: the access can be granted in the system settings (app info → alarms & reminders) without the
 * in-app button, while any screen is open; it is read again whenever the app returns to the foreground.
 */
function watchExactTiming(): void {
  if (foregroundWatched || Platform.OS !== 'android') return;
  foregroundWatched = true;
  AppState.addEventListener('change', (next) => {
    if (next === 'active') void readExactTiming().then(reconcileExactTiming);
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

  sync(reminders, keep) {
    return serial(async () => {
      try {
        installForegroundHandler();
        watchExactTiming();
        if (Platform.OS === 'android') noteExactTiming(await readExactTiming());
        const scheduled = await Notifications.getAllScheduledNotificationsAsync();
        const plan = diffReminders(
          scheduled.map((request) => request.identifier),
          reminders,
          keep,
        );
        lastWanted = reminders;
        await Promise.all(plan.cancel.map(cancel));
        for (const reminder of plan.schedule) await schedule(reminder);
        // Alarms left by an earlier run (or set before the access changed) are set again once.
        await rearmScheduled();
      } catch {
        // Reminders are a convenience: a failed sync is retried on the next data change.
      }
    });
  },

  cancelAll() {
    return serial(async () => {
      lastWanted = [];
      try {
        const scheduled = await Notifications.getAllScheduledNotificationsAsync();
        await Promise.all(scheduled.filter((request) => isReminder(request.identifier)).map((request) => cancel(request.identifier)));
      } catch {
        // Nothing scheduled or the module is unavailable.
      }
    });
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
    const state = await readExactTiming();
    // A screen that re-reads the access also re-arms what a change outside the app left inexact.
    void reconcileExactTiming(state);
    return state;
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
    // Granted: the reminders already scheduled are set again, now as exact alarms.
    await reconcileExactTiming(state);
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
