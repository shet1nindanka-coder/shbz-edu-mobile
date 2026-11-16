// Ported 1:1 from the site (lib/audit-text.ts) — only the imports differ. Re-port instead of hand-editing;
// anything the app changes on purpose is marked [MOBILE].
import { DEFAULT_LOCALE, format, type Locale } from "@/lib/i18n";
import { getDictionary } from "@/i18n/get-dictionary";
import type { auditRu } from "@/lib/i18n/dictionaries/records";
import { formatDateTime } from "@/domain/utils";

/*
 * Текст записи журнала на языке интерфейса. В AuditLog.summary лежит русский
 * снимок (как и раньше), а в AuditLog.meta.i18n — ключ шаблона и параметры;
 * по ним страница журнала собирает строку заново для текущего языка.
 * Старые записи без meta.i18n переводятся по точному совпадению summary
 * с шаблонами без параметров — остальные остаются как записаны.
 */

export type AuditTextKey = keyof typeof auditRu.templates;

export type AuditTextParams = Record<string, string | number | boolean | null>;

export type AuditText = {
  key: AuditTextKey;
  params?: AuditTextParams;
};

export const AUDIT_I18N_META_KEY = "i18n";

function isAuditTextKey(value: unknown, locale: Locale): value is AuditTextKey {
  return typeof value === "string" && value in getDictionary(locale).audit.templates;
}

function pick<T extends Record<string, string>>(table: T, code: unknown, fallback: string) {
  return typeof code === "string" && code in table ? table[code as keyof T] : fallback;
}

/** Собирает строку по ключу и параметрам. Коды статусов/вердиктов подписываются по словарю. */
export function renderAuditText(text: AuditText, locale: Locale = DEFAULT_LOCALE) {
  const dict = getDictionary(locale);
  const template = dict.audit.templates[text.key];
  const params: Record<string, string | number> = {};

  for (const [name, raw] of Object.entries(text.params ?? {})) {
    if (raw === null || raw === undefined) {
      params[name] = "";
    } else if (typeof raw === "boolean") {
      params[name] = raw ? "1" : "0";
    } else if (typeof raw === "string" && name.endsWith("At")) {
      params[name] = formatDateTime(raw, locale);
    } else {
      params[name] = raw;
    }
  }

  if (text.key === "lesson_item.check") {
    const verdict = text.params?.verdict;
    params.verdict = pick(dict.audit.verdicts, verdict, String(verdict ?? ""));
  }

  if (text.key === "account.created") {
    const role = text.params?.role;
    params.role = pick(dict.roles, role, String(role ?? ""));
  }

  if (text.key === "progress.status") {
    const statuses = dict.progress.statuses;
    const statusLabel = (code: unknown) => (typeof code === "string" && code in statuses ? statuses[code as keyof typeof statuses] : statuses.none);
    params.source = pick(dict.progress.sources, text.params?.source, String(text.params?.source ?? ""));
    params.decision = pick(dict.progress.decisions, text.params?.decision, String(text.params?.decision ?? ""));
    params.previousStatus = statusLabel(text.params?.previousStatus);
    params.status = statusLabel(text.params?.status);
  }

  return format(template, params);
}

/** Достаёт { key, params } из meta записи; чужие и битые значения игнорирует. */
export function resolveAuditText(meta: unknown): AuditText | null {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    return null;
  }

  const raw = (meta as Record<string, unknown>)[AUDIT_I18N_META_KEY];

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }

  const { key, params } = raw as { key?: unknown; params?: unknown };

  if (!isAuditTextKey(key, DEFAULT_LOCALE)) {
    return null;
  }

  const safeParams: AuditTextParams = {};

  if (params && typeof params === "object" && !Array.isArray(params)) {
    for (const [name, value] of Object.entries(params as Record<string, unknown>)) {
      if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        safeParams[name] = value;
      }
    }
  }

  return { key, params: safeParams };
}

/** Добавляет ключ и параметры в meta записи, не теряя то, что там уже лежит. */
export function withAuditText(meta: unknown, text: AuditText | null | undefined) {
  if (!text) {
    return meta;
  }

  const base =
    meta && typeof meta === "object" && !Array.isArray(meta)
      ? (meta as Record<string, unknown>)
      : meta === null || meta === undefined
        ? {}
        : { value: meta };

  return {
    ...base,
    [AUDIT_I18N_META_KEY]: text.params && Object.keys(text.params).length > 0 ? { key: text.key, params: text.params } : { key: text.key }
  };
}

function legacySummaryKey(summary: string): AuditTextKey | null {
  const templates = getDictionary(DEFAULT_LOCALE).audit.templates;
  const trimmed = summary.trim();

  for (const [key, template] of Object.entries(templates)) {
    if (!template.includes("{") && template === trimmed) {
      return key as AuditTextKey;
    }
  }

  return null;
}

/** Summary записи для показа: по meta.i18n, иначе по старому русскому тексту, иначе как записано. */
export function auditSummaryFor(entry: { summary: string | null; meta: unknown }, locale: Locale = DEFAULT_LOCALE) {
  const text = resolveAuditText(entry.meta);

  if (text) {
    return renderAuditText(text, locale);
  }

  if (!entry.summary) {
    return null;
  }

  const legacyKey = legacySummaryKey(entry.summary);

  return legacyKey ? renderAuditText({ key: legacyKey }, locale) : entry.summary;
}

/** Имя системного актора («Автопроверка») на языке интерфейса; людей не трогает. */
export function auditActorNameFor(actorName: string | null, locale: Locale = DEFAULT_LOCALE) {
  if (!actorName) {
    return actorName;
  }

  const ruActors = getDictionary(DEFAULT_LOCALE).audit.actors;
  const actors = getDictionary(locale).audit.actors;

  for (const [code, label] of Object.entries(ruActors)) {
    if (label === actorName) {
      return actors[code as keyof typeof actors];
    }
  }

  return actorName;
}
