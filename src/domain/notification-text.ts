// Ported from the site (lib/notification-text.ts). [MOBILE] The deadline inside a notification text is
// printed in Moscow time through ./dates (the site formats it with `Intl.DateTimeFormat` on the server,
// whose process zone is Europe/Moscow) — same string, independent of the device zone.
import { DEFAULT_LOCALE, format, type Locale } from "@/lib/i18n";
import { formatMsk } from "@/domain/dates";
import { getDictionary } from "@/i18n/get-dictionary";

/*
 * Текст уведомления на языке интерфейса. В Notification.title/body лежит
 * русский снимок, в Notification.params — параметры; по типу и параметрам
 * колокольчик собирает текст заново для текущего языка. Записи без params
 * (старые или рассылка разработчика свободным текстом) показываются как есть,
 * у известных заголовков без параметров заголовок всё же переводится.
 */

export type NotificationParams = Record<string, string | number | boolean | null>;

export type NotificationText = {
  title: string;
  body: string | null;
};

export const NOTIFICATION_TYPES = {
  homeworkAssigned: "homework-assigned",
  homeworkChecked: "homework-checked",
  parentCall: "parent_call_due",
  devErrors: "dev_errors",
  devBudgetWarn: "dev_ai_budget_warn",
  devBudgetOut: "dev_ai_budget_out",
  devStaleChecks: "dev_stale_checks",
  devStorage: "dev_storage"
} as const;

function str(value: unknown, fallback = "") {
  return value === null || value === undefined ? fallback : String(value);
}

function num(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDeadline(value: unknown, locale: Locale) {
  const date = typeof value === "string" ? new Date(value) : null;

  if (!date || Number.isNaN(date.getTime())) {
    return str(value);
  }

  return formatMsk(date, "dayMonthTime", locale) ?? str(value);
}

export function sanitizeNotificationParams(params: unknown): NotificationParams | null {
  if (!params || typeof params !== "object" || Array.isArray(params)) {
    return null;
  }

  const safe: NotificationParams = {};

  for (const [name, value] of Object.entries(params as Record<string, unknown>)) {
    if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      safe[name] = value;
    }
  }

  return safe;
}

/** Собирает title/body по типу и параметрам; null — тип без шаблона или параметры не разобрать. */
export function renderNotificationText(type: string, rawParams: unknown, locale: Locale = DEFAULT_LOCALE): NotificationText | null {
  const params = sanitizeNotificationParams(rawParams);

  if (!params) {
    return null;
  }

  const t = getDictionary(locale).notifications;

  switch (type) {
    case NOTIFICATION_TYPES.homeworkAssigned: {
      const topic = str(params.topic, t.homeworkAssigned.fallbackTopic);
      const count = num(params.count);
      const title = params.variant === "deadline" ? t.homeworkAssigned.titleDeadline : t.homeworkAssigned.titleAssigned;
      const bodyTemplate = count > 1 ? t.homeworkAssigned.bodyMany : t.homeworkAssigned.bodyOne;

      return {
        title: format(title, { topic }),
        body: format(bodyTemplate, { numbers: str(params.numbers), deadline: formatDeadline(params.deadlineAt, locale) })
      };
    }
    case NOTIFICATION_TYPES.homeworkChecked: {
      const uncertain = num(params.uncertain);
      const applied = num(params.applied);

      return {
        title: t.homeworkChecked.title,
        body: format(t.homeworkChecked.body, {
          correct: num(params.correct),
          incorrect: num(params.incorrect),
          uncertain: uncertain > 0 ? format(t.homeworkChecked.uncertainSuffix, { uncertain }) : "",
          statuses: applied > 0 ? format(t.homeworkChecked.statusesUpdated, { count: applied }) : t.homeworkChecked.statusesUnchanged
        })
      };
    }
    case NOTIFICATION_TYPES.parentCall: {
      const name = str(params.name);

      return {
        title: params.state === "overdue" ? t.parentCall.titleOverdue : t.parentCall.titleDue,
        body: params.hasReachedCall
          ? format(t.parentCall.bodyReached, { name, days: num(params.days) })
          : format(t.parentCall.bodyNoCalls, { name })
      };
    }
    case NOTIFICATION_TYPES.devErrors:
      return { title: format(t.devErrors.title, { count: num(params.count) }), body: t.devErrors.body };
    case NOTIFICATION_TYPES.devBudgetOut:
      return {
        title: t.devBudgetOut.title,
        body: format(t.devBudgetOut.body, { used: num(params.used), limit: num(params.limit) })
      };
    case NOTIFICATION_TYPES.devBudgetWarn:
      return {
        title: t.devBudgetWarn.title,
        body: format(t.devBudgetWarn.body, { used: num(params.used), limit: num(params.limit) })
      };
    case NOTIFICATION_TYPES.devStaleChecks:
      return { title: format(t.devStaleChecks.title, { count: num(params.count) }), body: t.devStaleChecks.body };
    case NOTIFICATION_TYPES.devStorage:
      return { title: format(t.devStorage.title, { gb: str(params.gb) }), body: t.devStorage.body };
    default:
      return null;
  }
}

/** Заголовок старой записи без params: переводится, если совпал с шаблоном без подстановок. */
export function legacyNotificationTitle(title: string, locale: Locale = DEFAULT_LOCALE) {
  if (locale === DEFAULT_LOCALE) {
    return title;
  }

  const ru = getDictionary(DEFAULT_LOCALE).notifications;
  const target = getDictionary(locale).notifications;
  const trimmed = title.trim();

  for (const [group, entries] of Object.entries(ru)) {
    for (const [name, template] of Object.entries(entries)) {
      if (!template.includes("{") && template === trimmed) {
        const translated = (target as Record<string, Record<string, string>>)[group]?.[name];
        return translated ?? title;
      }
    }
  }

  return title;
}

/** Текст для показа: по params на языке интерфейса, иначе как записано (заголовок — через legacy-карту). */
export function notificationTextFor(
  row: { type: string; title: string; body: string | null; params: unknown },
  locale: Locale = DEFAULT_LOCALE
): NotificationText {
  const rendered = renderNotificationText(row.type, row.params, locale);

  if (rendered) {
    return rendered;
  }

  return { title: legacyNotificationTitle(row.title, locale), body: row.body };
}
