// Notifications: local reminders (planning is pure, scheduling is per platform) and the single place
// where remote push will be registered.
export { localNotifications, REMINDER_CHANNEL_ID } from './local-notifications';
export type { LocalNotifications, ReminderPermission, ReminderPermissionState } from './local-notifications.types';
export { registerRemotePush, unregisterRemotePush, type RemotePushContext, type RemotePushRegistration } from './push-registration';
export {
  HOMEWORK_LEAD_TIMES_MS,
  LESSON_LEAD_TIME_MS,
  MAX_SCHEDULED_REMINDERS,
  PARENT_CALL_HORIZON_DAYS,
  PARENT_CALL_HOUR_MSK,
  REMINDER_ID_PREFIX,
  diffReminders,
  moscowHourAhead,
  planHomeworkReminders,
  planLessonReminders,
  planParentCallReminders,
  reminderIdentifier,
  selectReminders,
  type LocalReminder,
  type ReminderFormatters,
  type ReminderLink,
  type ReminderTexts,
} from './reminders';
