/**
 * Notification rules — the mock `lib/notifications.ts`, the lazy parent-call reminders of the teacher's bell
 * and the lazy developer alerts (docs/spec/01-shell-auth.md §3.6 – §3.7, §4.6 – §4.8).
 *
 * A stored row keeps the Russian snapshot plus `type` + `params`; a response renders the text for the
 * request language and carries the navigation `target` computed from the stored site `href`.
 * PRIVACY: parent-call comments never appear in a notification.
 */
import type { Locale, Notification, NotificationItem, NotificationParams, NotificationsResponse, UserRole } from "@/api/types";
import { LIMITS } from "@/api/types";
import { DEVELOPER_ALERTS_THROTTLE_MS, STALE_CHECK_AGE_MS, resolveDeveloperAlerts } from "@/domain/developer-alerts";
import { DAY_MS, MINUTE_MS } from "@/domain/moscow-time";
import { notificationTextFor, renderNotificationText } from "@/domain/notification-text";
import { PARENT_CALL_OVERDUE_DAYS, resolveParentCallReminder, shouldCreateParentCallNotification } from "@/domain/parent-call-state";
import { resolveHrefTarget } from "@/navigation/targets";

import type { MockCore } from "./core";
import type { MockQueries } from "./queries";

export const PARENT_CALL_NOTIFICATION_TYPE = "parent_call_due";
/** The teacher's bell re-evaluates the reminders at most once a minute. */
export const PARENT_CALL_ENSURE_THROTTLE_MS = MINUTE_MS;

/** Site path a parent-call reminder points at; also the key that matches a reminder to its student. */
export function parentCallHref(studentId: string): string {
  return `/teacher/calls?studentId=${studentId}`;
}

export type CreateNotificationInput = {
  userId: string;
  /** A `NotificationType` (`"homework-assigned"`, `"homework-checked"`, `"broadcast"`, …). */
  type: string;
  /** With params the Russian snapshot title / body are rendered automatically. */
  params?: NotificationParams | null;
  /** Required when there are no params (a developer broadcast is free text, shown as stored). */
  title?: string;
  body?: string | null;
  /** Site path (`/student/homeworks/{assignmentId}`, …) or null; the app receives the resolved `target`. */
  href?: string | null;
};

export interface MockNotifications {
  /**
   * Creates a notification for a user. Returns null — and creates nothing — when it would have no title
   * (neither `title` nor renderable params), like the site.
   */
  create(input: CreateNotificationInput): Notification | null;
  /** The wire item of a stored row: text for the request language, `target` for the recipient's role. */
  toItem(row: Notification, role: UserRole, locale?: Locale): NotificationItem;
  /** Newest 20 rows of a user plus the count of ALL unread ones. */
  list(userId: string, role: UserRole): NotificationsResponse;
  /** Marks one unread row (or all of them) read; an unknown / foreign / already read id is a no-op. Returns the unread count after. */
  markRead(userId: string, notificationId?: string): number;
  /** Marks the unread parent-call reminders about one student read (after a REACHED call was recorded). */
  markParentCallRemindersRead(teacherId: string, studentId: string): void;
  /** Lazy parent-call reminders of a teacher (throttled to one evaluation a minute per teacher). */
  ensureParentCallReminders(teacherId: string): void;
  /** Lazy developer alerts (throttled to one evaluation per 10 minutes per developer). */
  ensureDeveloperAlerts(developerId: string): void;
  /** Forgets the throttling marks (after a reset of the dataset). */
  resetThrottles(): void;
}

export function createNotifications(core: MockCore, q: MockQueries): MockNotifications {
  const { store } = core;
  const parentCallRuns = new Map<string, number>();
  const developerAlertRuns = new Map<string, number>();

  const create = (input: CreateNotificationInput): Notification | null => {
    const rendered = input.params ? renderNotificationText(input.type, input.params, "ru") : null;
    const title = input.title ?? rendered?.title;
    if (!title) return null;
    return store.notifications.insert({
      id: store.nextId("ntf"),
      userId: input.userId,
      type: input.type,
      title,
      body: input.body ?? rendered?.body ?? null,
      href: input.href ?? null,
      params: input.params ?? null,
      readAt: null,
      createdAt: core.nowIso(),
    });
  };

  const toItem = (row: Notification, role: UserRole, locale: Locale = core.locale()): NotificationItem => {
    const text = notificationTextFor({ type: row.type, title: row.title, body: row.body, params: row.params }, locale);
    return {
      id: row.id,
      type: row.type,
      title: text.title,
      body: text.body,
      params: row.params,
      href: row.href,
      target: resolveHrefTarget(row.href, role),
      readAt: row.readAt,
      createdAt: row.createdAt,
    };
  };

  const unreadCount = (userId: string) => store.notifications.by("userId", userId).filter((row) => row.readAt === null).length;

  return {
    create,
    toItem,
    list(userId, role) {
      const rows = q.notificationsOfUser(userId).slice(0, LIMITS.notificationsReturned);
      return { notifications: rows.map((row) => toItem(row, role)), unreadCount: unreadCount(userId) };
    },
    markRead(userId, notificationId) {
      const readAt = core.nowIso();
      for (const row of store.notifications.by("userId", userId)) {
        if (row.readAt !== null) continue;
        if (notificationId !== undefined && row.id !== notificationId) continue;
        store.notifications.update(row.id, { readAt });
      }
      return unreadCount(userId);
    },
    markParentCallRemindersRead(teacherId, studentId) {
      const href = parentCallHref(studentId);
      const readAt = core.nowIso();
      for (const row of store.notifications.by("userId", teacherId)) {
        if (row.type === PARENT_CALL_NOTIFICATION_TYPE && row.href === href && row.readAt === null) {
          store.notifications.update(row.id, { readAt });
        }
      }
    },
    ensureParentCallReminders(teacherId) {
      const now = core.now();
      const lastRun = parentCallRuns.get(teacherId);
      if (lastRun !== undefined && now - lastRun < PARENT_CALL_ENSURE_THROTTLE_MS) return;
      parentCallRuns.set(teacherId, now);

      const existing = q.notificationsOfUser(teacherId).filter((row) => row.type === PARENT_CALL_NOTIFICATION_TYPE);
      for (const student of q.studentsOfTeacher(teacherId)) {
        // Anchor = the latest REACHED call, else the student's creation; NO_ANSWER never moves it.
        const lastReached = q.callsOfStudent(student.id).find((call) => call.outcome === "REACHED");
        const lastReachedAt = lastReached ? new Date(lastReached.calledAt) : null;
        const studentCreatedAt = new Date(student.createdAt);
        const reminder = resolveParentCallReminder({ lastReachedAt, studentCreatedAt, now: new Date(now) });
        const anchorAt = lastReachedAt ?? studentCreatedAt;
        const href = parentCallHref(student.id);
        const last = existing.find((row) => row.href === href);

        const needed = shouldCreateParentCallNotification({
          reminderState: reminder.state,
          anchorAt,
          overdueAt: new Date(anchorAt.getTime() + PARENT_CALL_OVERDUE_DAYS * DAY_MS),
          lastNotificationCreatedAt: last ? new Date(last.createdAt) : null,
        });
        if (!needed) continue;

        create({
          userId: teacherId,
          type: PARENT_CALL_NOTIFICATION_TYPE,
          params: { state: reminder.state, name: student.name, days: reminder.daysSinceAnchor, hasReachedCall: reminder.hasReachedCall },
          href,
        });
      }
    },
    ensureDeveloperAlerts(developerId) {
      const now = core.now();
      const lastRun = developerAlertRuns.get(developerId);
      if (lastRun !== undefined && now - lastRun < DEVELOPER_ALERTS_THROTTLE_MS) return;
      developerAlertRuns.set(developerId, now);

      const lastSentAt: Partial<Record<string, Date>> = {};
      for (const row of q.notificationsOfUser(developerId)) {
        // Newest first: the first row of a type is the latest alert of that type.
        if (row.type.startsWith("dev_") && lastSentAt[row.type] === undefined) lastSentAt[row.type] = new Date(row.createdAt);
      }
      const dayAgo = new Date(now - DAY_MS).toISOString();
      const failed = store.auditLogs.filter((row) => row.outcome === "failed" && row.createdAt >= dayAgo);
      const lastErrorsAlert = lastSentAt.dev_errors?.toISOString();
      const staleBefore = new Date(now - STALE_CHECK_AGE_MS).toISOString();

      const alerts = resolveDeveloperAlerts({
        failedCount: failed.length,
        failedSinceLastAlert: lastErrorsAlert ? failed.filter((row) => row.createdAt > lastErrorsAlert).length : failed.length,
        checksLastDay: store.homeworkChecks.count((check) => check.createdAt >= dayAgo),
        aiDailyLimit: store.settings.aiDailyLimit,
        staleCheckCount: store.homeworkChecks.count((check) => (check.status === "PENDING" || check.status === "CHECKING") && check.createdAt < staleBefore),
        storageBytes: store.files.all().reduce((total, file) => total + file.size, 0),
        lastSentAt,
        now: new Date(now),
      });
      for (const alert of alerts) {
        create({ userId: developerId, type: alert.type, params: alert.params, href: alert.href });
      }
    },
    resetThrottles() {
      parentCallRuns.clear();
      developerAlertRuns.clear();
    },
  };
}
