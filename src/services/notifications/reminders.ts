/**
 * Local reminders derived from data the app already has (pure planning; the device calls are in
 * `local-notifications.ts`). The mock backend cannot send remote push, and the site has no push at all
 * (docs/spec/01-shell-auth.md §7 item 7), so the app schedules on-device notifications:
 *
 * - STUDENT · homework deadlines: 24 h and 2 h before the deadline of every unfinished homework;
 * - STUDENT · lesson start: 10 minutes before the upcoming lesson and at its start;
 * - TEACHER · parent calls: 10:00 Moscow time on the day a student's call becomes due.
 *
 * // SPEC-GAP: the lead times above are a mobile decision — the site has no reminders to copy.
 *
 * Privacy: a reminder never contains a parent-call comment or AI diagnostics; it carries only what the
 * in-app bell already shows (homework label, topic, student name).
 */
import type { GetLessonResponse, HomeworkDeadlinesResponse, ParentCallsOverviewResponse } from "@/api/types";
import { format } from "@/lib/i18n/format";

import type { ReminderCategory } from "../preferences";

/** Where a tap on the reminder leads: a screen id plus its params (validated by `parseAppLink` on arrival). */
export type ReminderLink = { screen: string } & Record<string, string | number | undefined>;

export type LocalReminder = {
  /** Stable id inside its category (entity id + which lead time). */
  id: string;
  category: ReminderCategory;
  /** Epoch ms. */
  fireAt: number;
  title: string;
  body: string;
  link: ReminderLink;
};

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** iOS keeps at most 64 pending local notifications per app; stay well below it. */
export const MAX_SCHEDULED_REMINDERS = 24;

export const HOMEWORK_LEAD_TIMES_MS = [DAY_MS, 2 * HOUR_MS] as const;
export const LESSON_LEAD_TIME_MS = 10 * MINUTE_MS;
/** Hour of the Moscow day (UTC+3, no DST) at which a parent-call reminder fires. */
export const PARENT_CALL_HOUR_MSK = 10;
/** Parent-call reminders are planned at most this many days ahead; later ones are picked up by a later sync. */
export const PARENT_CALL_HORIZON_DAYS = 14;

const MSK_OFFSET_MS = 3 * HOUR_MS;

/** Texts with `{placeholders}`, built by the caller from the dictionaries of the current language. */
export type ReminderTexts = {
  /** «Скоро дедлайн» */
  homeworkTitle: string;
  /** «{homework} · {topic} — сдать до {deadline}» */
  homeworkBody: string;
  /** «Урок через 10 минут» */
  lessonSoonTitle: string;
  /** «Урок начался» */
  lessonStartTitle: string;
  /** «{title}» — the lesson title, with the group when there is one: «{title} · {group}» */
  lessonBody: string;
  lessonBodyWithGroup: string;
  /** «Пора позвонить родителям» */
  parentCallTitle: string;
  /** «{name}: с последнего звонка прошло {days} дн.» */
  parentCallBody: string;
  /** «{name}: успешных звонков ещё не было.» */
  parentCallBodyNoCalls: string;
};

export type ReminderFormatters = {
  /** Label of a homework: its title or «ДЗ {n}». */
  homeworkLabel: (homework: { title: string | null; orderInTopic: number }) => string;
  /** Day, month and time in Moscow time, in the interface language. */
  dateTime: (iso: string) => string;
};

function timeOf(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const time = new Date(iso).getTime();
  return Number.isFinite(time) ? time : null;
}

export function planHomeworkReminders(
  response: HomeworkDeadlinesResponse | undefined,
  now: number,
  texts: ReminderTexts,
  formatters: ReminderFormatters,
): LocalReminder[] {
  if (!response) return [];
  const reminders: LocalReminder[] = [];
  for (const homework of response.items) {
    const deadline = timeOf(homework.deadlineAt);
    if (deadline === null || deadline <= now) continue;
    // A finished homework needs no nudge.
    if (homework.totalNumbers > 0 && homework.solvedCount >= homework.totalNumbers) continue;
    for (const lead of HOMEWORK_LEAD_TIMES_MS) {
      const fireAt = deadline - lead;
      if (fireAt <= now) continue;
      reminders.push({
        id: `${homework.id}:${lead / HOUR_MS}h`,
        category: "homeworkDeadlines",
        fireAt,
        title: texts.homeworkTitle,
        body: format(texts.homeworkBody, {
          homework: formatters.homeworkLabel(homework),
          topic: homework.topicTitle,
          deadline: formatters.dateTime(homework.deadlineAt ?? ""),
        }),
        link: { screen: "student.homework", assignmentId: homework.id },
      });
    }
  }
  return reminders;
}

export function planLessonReminders(response: GetLessonResponse | undefined, now: number, texts: ReminderTexts): LocalReminder[] {
  const upcoming = response?.upcoming;
  if (!upcoming) return [];
  const startsAt = timeOf(upcoming.startsAt);
  if (startsAt === null) return [];
  const body = upcoming.groupName
    ? format(texts.lessonBodyWithGroup, { title: upcoming.title, group: upcoming.groupName })
    : format(texts.lessonBody, { title: upcoming.title });
  const link: ReminderLink = { screen: "student.lesson" };
  const reminders: LocalReminder[] = [];
  if (startsAt - LESSON_LEAD_TIME_MS > now) {
    reminders.push({
      id: `${upcoming.lessonId}:soon`,
      category: "lessonStart",
      fireAt: startsAt - LESSON_LEAD_TIME_MS,
      title: texts.lessonSoonTitle,
      body,
      link,
    });
  }
  if (startsAt > now) {
    reminders.push({ id: `${upcoming.lessonId}:start`, category: "lessonStart", fireAt: startsAt, title: texts.lessonStartTitle, body, link });
  }
  return reminders;
}

/** Epoch ms of `hour`:00 Moscow time, `daysAhead` Moscow calendar days after the Moscow day of `now`. */
export function moscowHourAhead(now: number, daysAhead: number, hour: number): number {
  const mskDayStart = Math.floor((now + MSK_OFFSET_MS) / DAY_MS) * DAY_MS;
  return mskDayStart + daysAhead * DAY_MS + hour * HOUR_MS - MSK_OFFSET_MS;
}

export function planParentCallReminders(
  response: ParentCallsOverviewResponse | undefined,
  now: number,
  texts: ReminderTexts,
): LocalReminder[] {
  // A read-only viewer (DEVELOPER) records no calls and gets no reminders.
  if (!response || !response.canRecord) return [];
  const reminders: LocalReminder[] = [];
  for (const student of response.students) {
    const { state, daysUntilDue, daysSinceAnchor, hasReachedCall } = student.reminder;
    // Calls that are already due are in the in-app bell; only the moment a call BECOMES due is announced.
    if (state !== "ok" || daysUntilDue < 1 || daysUntilDue > PARENT_CALL_HORIZON_DAYS) continue;
    const fireAt = moscowHourAhead(now, daysUntilDue, PARENT_CALL_HOUR_MSK);
    if (fireAt <= now) continue;
    reminders.push({
      id: `${student.studentId}:due`,
      category: "parentCalls",
      fireAt,
      title: texts.parentCallTitle,
      body: hasReachedCall
        ? format(texts.parentCallBody, { name: student.studentName, days: daysSinceAnchor + daysUntilDue })
        : format(texts.parentCallBodyNoCalls, { name: student.studentName }),
      link: { screen: "calls.list", studentId: student.studentId },
    });
  }
  return reminders;
}

/** Keeps the enabled categories, soonest first, within the device budget. */
export function selectReminders(
  reminders: readonly LocalReminder[],
  enabled: Readonly<Record<ReminderCategory, boolean>>,
  limit: number = MAX_SCHEDULED_REMINDERS,
): LocalReminder[] {
  return reminders
    .filter((reminder) => enabled[reminder.category])
    .sort((a, b) => a.fireAt - b.fireAt || a.id.localeCompare(b.id))
    .slice(0, limit);
}

/** Identifier prefix of every notification this app schedules — what a sync is allowed to cancel. */
export const REMINDER_ID_PREFIX = "shbz-reminder";

/**
 * Device identifier of a reminder. It contains the fire time and the text, so a moved deadline or a
 * language switch produces a new identifier and the old notification is cancelled by the sync.
 */
export function reminderIdentifier(reminder: LocalReminder): string {
  return `${REMINDER_ID_PREFIX}:${reminder.category}:${reminder.id}:${reminder.fireAt}:${textHash(`${reminder.title}\n${reminder.body}`)}`;
}

function textHash(text: string): string {
  let hash = 5381;
  for (let index = 0; index < text.length; index += 1) hash = ((hash << 5) + hash + text.charCodeAt(index)) >>> 0;
  return hash.toString(36);
}

/** The category an identifier of this app was scheduled for, or null for a foreign identifier. */
export function reminderCategoryOf(identifier: string): string | null {
  const [prefix, category] = identifier.split(":");
  return prefix === REMINDER_ID_PREFIX && category ? category : null;
}

/**
 * What a sync has to do given what is scheduled on the device now.
 *
 * `keep` names the categories whose source data is not known yet (the query has not answered: a cold start
 * without a connection, a failed first load). "No data yet" is not "nothing wanted": what is already
 * scheduled for such a category stays untouched until its data arrives.
 */
export function diffReminders(
  scheduledIdentifiers: readonly string[],
  desired: readonly LocalReminder[],
  keep: readonly ReminderCategory[] = [],
): { cancel: string[]; schedule: LocalReminder[] } {
  const ours = scheduledIdentifiers.filter((identifier) => identifier.startsWith(`${REMINDER_ID_PREFIX}:`));
  const wanted = new Map(desired.map((reminder) => [reminderIdentifier(reminder), reminder] as const));
  const present = new Set(ours);
  const kept = new Set<string>(keep);
  return {
    cancel: ours.filter((identifier) => !wanted.has(identifier) && !kept.has(reminderCategoryOf(identifier) ?? "")),
    schedule: [...wanted.entries()].filter(([identifier]) => !present.has(identifier)).map(([, reminder]) => reminder),
  };
}

/**
 * Android: the wanted reminders that are scheduled but whose alarm was not set by this process in the
 * current exact-timing mode (`armed`), so they have to be set again. An alarm keeps the mode (exact or
 * inexact) it was set with, and the OS cancels the exact ones when the "alarms & reminders" access is
 * revoked (killing the app) while the notifications module's own store still lists them — so an alarm
 * from an earlier run, or from before the access changed, is of unknown state.
 */
export function remindersToRearm(
  scheduledIdentifiers: readonly string[],
  desired: readonly LocalReminder[],
  armed: ReadonlySet<string>,
): LocalReminder[] {
  const present = new Set(scheduledIdentifiers);
  const seen = new Set<string>();
  return desired.filter((reminder) => {
    const identifier = reminderIdentifier(reminder);
    if (!present.has(identifier) || armed.has(identifier) || seen.has(identifier)) return false;
    seen.add(identifier);
    return true;
  });
}
