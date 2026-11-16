// Ported from the site (lib/developer-alerts.ts). [MOBILE] Only the pure decision `resolveDeveloperAlerts`
// (and its thresholds); gathering the facts and writing notifications belongs to the data owner.
import { renderNotificationText, type NotificationParams } from "@/domain/notification-text";

/*
 * Служебные уведомления разработчика: колокольчик сообщает о том, что требует
 * взгляда — ошибки на платформе, тающий дневной бюджет ИИ, зависшие проверки,
 * распухшее хранилище. Генерация ленивая (GET /api/notifications), по образцу
 * напоминаний о звонках у учителя: in-memory троттлинг — корректно на одном
 * инстансе, при горизонтальном масштабировании нужен внешний стор.
 */

export const DEVELOPER_ALERT_TYPES = {
  errors: "dev_errors",
  budgetWarn: "dev_ai_budget_warn",
  budgetOut: "dev_ai_budget_out",
  staleChecks: "dev_stale_checks",
  storage: "dev_storage"
} as const;

/** How often the bell re-evaluates the alerts for one developer. */
export const DEVELOPER_ALERTS_THROTTLE_MS = 10 * 60_000;
const DAY_MS = 24 * 60 * 60_000;
/** A check that is still PENDING / CHECKING after this long counts as stale. */
export const STALE_CHECK_AGE_MS = 30 * 60_000;
const STORAGE_WARN_BYTES = 512 * 1024 * 1024;
const BUDGET_WARN_RATIO = 0.8;

/** Кулдауны повторной отправки: чаще — шум, реже — можно пропустить проблему. */
const COOLDOWN_MS: Record<string, number> = {
  [DEVELOPER_ALERT_TYPES.errors]: 6 * 60 * 60_000,
  [DEVELOPER_ALERT_TYPES.budgetWarn]: DAY_MS,
  [DEVELOPER_ALERT_TYPES.budgetOut]: DAY_MS,
  [DEVELOPER_ALERT_TYPES.staleChecks]: 6 * 60 * 60_000,
  [DEVELOPER_ALERT_TYPES.storage]: 7 * DAY_MS
};

export type DeveloperAlertFacts = {
  /** Ошибок в журнале за сутки. */
  failedCount: number;
  /** Из них — после последнего уведомления об ошибках (новых). */
  failedSinceLastAlert: number;
  checksLastDay: number;
  aiDailyLimit: number;
  staleCheckCount: number;
  storageBytes: number;
  /** type → когда отправляли в прошлый раз. */
  lastSentAt: Partial<Record<string, Date>>;
  now: Date;
};

export type DeveloperAlert = {
  type: string;
  /** Русский снимок — для тестов и хранения; на экране текст собирается из params. */
  title: string;
  body: string;
  params: NotificationParams;
  href: string;
};

function alertOf(type: string, params: NotificationParams, href: string): DeveloperAlert {
  const text = renderNotificationText(type, params, "ru");

  return { type, title: text?.title ?? type, body: text?.body ?? "", params, href };
}

function cooledDown(facts: DeveloperAlertFacts, type: string) {
  const last = facts.lastSentAt[type];
  return !last || facts.now.getTime() - last.getTime() >= (COOLDOWN_MS[type] ?? DAY_MS);
}

/**
 * Чистое решение «какие уведомления создать» — покрыто тестами.
 * Бюджет: при исчерпании уходит только эскалация, без дублирующего «почти».
 */
export function resolveDeveloperAlerts(facts: DeveloperAlertFacts): DeveloperAlert[] {
  const alerts: DeveloperAlert[] = [];

  if (facts.failedCount > 0 && facts.failedSinceLastAlert > 0 && cooledDown(facts, DEVELOPER_ALERT_TYPES.errors)) {
    alerts.push(alertOf(DEVELOPER_ALERT_TYPES.errors, { count: facts.failedCount }, "/developer/panel/journal?outcome=failed&days=1"));
  }

  const limit = Math.max(1, facts.aiDailyLimit);

  if (facts.checksLastDay >= limit && cooledDown(facts, DEVELOPER_ALERT_TYPES.budgetOut)) {
    alerts.push(alertOf(DEVELOPER_ALERT_TYPES.budgetOut, { used: facts.checksLastDay, limit }, "/developer/panel"));
  } else if (facts.checksLastDay >= limit * BUDGET_WARN_RATIO && facts.checksLastDay < limit && cooledDown(facts, DEVELOPER_ALERT_TYPES.budgetWarn)) {
    alerts.push(alertOf(DEVELOPER_ALERT_TYPES.budgetWarn, { used: facts.checksLastDay, limit }, "/developer/panel"));
  }

  if (facts.staleCheckCount > 0 && cooledDown(facts, DEVELOPER_ALERT_TYPES.staleChecks)) {
    alerts.push(alertOf(DEVELOPER_ALERT_TYPES.staleChecks, { count: facts.staleCheckCount }, "/developer/panel?tab=actions"));
  }

  if (facts.storageBytes > STORAGE_WARN_BYTES && cooledDown(facts, DEVELOPER_ALERT_TYPES.storage)) {
    const gb = (facts.storageBytes / (1024 * 1024 * 1024)).toFixed(1);
    alerts.push(alertOf(DEVELOPER_ALERT_TYPES.storage, { gb }, "/developer/panel?tab=actions"));
  }

  return alerts;
}
