// Pure decisions of the developer journal (docs/spec/07-developer-content.md §1.10): filter state ⇄ query,
// the texts of a row and paging. No React, no RN — covered by tests/developer-panel-journal.test.ts.
import type { AuditCategory, JournalEntry, JournalPage, JournalQuery, Locale, UserRole } from '@/api/types';
import type { Dictionary } from '@/lib/i18n/dictionary';

import { shortDateTime } from './logic';

type JournalDict = Dictionary['planner']['journal'];

/** Default period of the journal page (a week). */
export const JOURNAL_DEFAULT_DAYS = 7;
/** The site debounces the "action" text filter by this much. */
export const JOURNAL_ACTION_DEBOUNCE_MS = 450;
export const JOURNAL_ACTION_MAX_LENGTH = 60;

/** Values of the period select, in the site's order; 0 = all time. */
export const JOURNAL_PERIODS = [1, 7, 30, 90, 0] as const;
export const JOURNAL_CATEGORIES: readonly AuditCategory[] = ['AI', 'DATA', 'AUTH'];

export type JournalFilters = {
  category: AuditCategory | null;
  /** Actor id. */
  actor: string | null;
  /** Substring of the system action name. */
  action: string;
  days: number;
  onlyFailed: boolean;
};

/** Filters a screen opens with: the route's `outcome` / `days` (a `dev_errors` notification), else the defaults. */
export function initialJournalFilters(params: { outcome?: 'failed'; days?: number }): JournalFilters {
  return {
    category: null,
    actor: null,
    action: '',
    days: params.days ?? JOURNAL_DEFAULT_DAYS,
    onlyFailed: params.outcome === 'failed',
  };
}

/** Query of `GET /developer/journal` without the page; unset filters are left out. */
export function toJournalQuery(filters: JournalFilters): JournalQuery {
  const query: JournalQuery = { days: filters.days };
  if (filters.category) query.category = filters.category;
  if (filters.actor) query.actor = filters.actor;
  const action = filters.action.trim();
  if (action) query.action = action;
  if (filters.onlyFailed) query.outcome = 'failed';
  return query;
}

/** How many filters differ from the defaults (the number on the "Filters" button). */
export function activeFilterCount(filters: JournalFilters): number {
  return (
    Number(filters.category !== null) +
    Number(filters.actor !== null) +
    Number(filters.action.trim() !== '') +
    Number(filters.days !== JOURNAL_DEFAULT_DAYS) +
    Number(filters.onlyFailed)
  );
}

const PERIOD_KEYS: Record<number, 'day' | 'week' | 'month' | 'threeMonths' | 'allTime'> = {
  1: 'day',
  7: 'week',
  30: 'month',
  90: 'threeMonths',
  0: 'allTime',
};

/** Label of a period value, or null for a value the select does not offer (a hand-made link). */
export function periodLabel(days: number, t: JournalDict['filters']): string | null {
  const key = PERIOD_KEYS[days];
  return key ? t[key] : null;
}

const CATEGORY_FILTER_KEYS: Record<AuditCategory, 'catAi' | 'catData' | 'catAuth'> = { AI: 'catAi', DATA: 'catData', AUTH: 'catAuth' };

export function categoryFilterLabel(category: AuditCategory, t: JournalDict['filters']): string {
  return t[CATEGORY_FILTER_KEYS[category]];
}

/** Option of the "who" select: «Имя — роль». */
export function actorOptionLabel(actor: { name: string; role: UserRole }, roles: JournalDict['roles']): string {
  return `${actor.name} — ${roles[actor.role]}`;
}

/**
 * The one caption of a journal row: «Анна Петрова · 17:32» — the name snapshot and a short "when" (the time
 * alone today, «23 нояб., 19:33» before). A row without an actor is the "when" alone. The role, the year
 * and the zone mark are in the entry's detail.
 */
export function entryCaption(entry: Pick<JournalEntry, 'actorName' | 'createdAt'>, now: number, locale: Locale): string {
  const when = shortDateTime(entry.createdAt, now, locale, true);
  return entry.actorName ? `${entry.actorName} · ${when}` : when;
}

/** The "who" field of the detail: the name snapshot (or a dash), then ` · role` when the role is known. */
export function whoText(entry: Pick<JournalEntry, 'actorName' | 'actorRole'>, roles: JournalDict['roles']): string {
  const name = entry.actorName ?? '—';
  return entry.actorRole ? `${name} · ${roles[entry.actorRole]}` : name;
}

/** `{input ?? 0} → {output ?? 0}`, or null when the row has no token counts at all. */
export function tokensText(entry: Pick<JournalEntry, 'inputTokens' | 'outputTokens'>): string | null {
  if (entry.inputTokens === null && entry.outputTokens === null) return null;
  return `${entry.inputTokens ?? 0} → ${entry.outputTokens ?? 0}`;
}

/** `costRub.toFixed(2) + " ₽"`, or null when the row has no cost. */
export function costText(costRub: string | null): string | null {
  if (costRub === null) return null;
  const value = Number(costRub);
  return Number.isFinite(value) ? `${value.toFixed(2)} ₽` : null;
}

/** `meta` pretty-printed for the detail sheet. */
export function metaJson(meta: Record<string, unknown>): string {
  return JSON.stringify(meta, null, 2);
}

/**
 * Entries of the loaded pages, newest first, without repeats: a row written between two page requests
 * shifts the following page by one, so its first row is the previous page's last one.
 */
export function mergeJournalPages(pages: readonly Pick<JournalPage, 'entries'>[]): JournalEntry[] {
  const seen = new Set<string>();
  const entries: JournalEntry[] = [];
  for (const page of pages) {
    for (const entry of page.entries) {
      if (seen.has(entry.id)) continue;
      seen.add(entry.id);
      entries.push(entry);
    }
  }
  return entries;
}

/** Number of the page to request after `last`, or undefined on the last page. */
export function nextJournalPage(last: Pick<JournalPage, 'page' | 'pageCount'>): number | undefined {
  return last.page < last.pageCount ? last.page + 1 : undefined;
}
