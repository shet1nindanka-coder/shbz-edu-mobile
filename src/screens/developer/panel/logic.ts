// Pure decisions of the developer panel (docs/spec/07-developer-content.md §1.9, §4.5 "Derived UI rules";
// 90-addendum-3 §6, §10.2): header chips, status tiles, the real AI budgets, the service actions and the
// broadcast form. No React, no RN — covered by tests/developer-panel-logic.test.ts.
import type { AiBudgetScope, AiBudgetUsage, BroadcastRequest, DeveloperPanelStats, PanelAction, SiteSettings } from '@/api/types';
import type { Dictionary } from '@/lib/i18n/dictionary';
import { format } from '@/lib/i18n/format';

type DevPanelDict = Dictionary['planner']['devPanel'];

/** Above this the storage chip turns yellow (512 MiB). */
export const STORAGE_WARN_BYTES = 512 * 1024 * 1024;
/** Share of the daily limit from which the AI chip (and a budget row) warns. */
export const BUDGET_WARN_SHARE = 0.8;

/** `min(100, round(used / max(1, limit) × 100))` — the bar of the "runs in 24 hours" tile. */
export function budgetPercent(used: number, limit: number): number {
  return Math.min(100, Math.round((used / Math.max(1, limit)) * 100));
}

// ───────────────────────────── header chips ─────────────────────────────

export type PanelChip = { key: 'queue' | 'ai' | 'storage'; label: string; tone: 'green' | 'yellow' | 'muted' };

/** The three chips of the panel header: queue (always green), AI runs in 24 h, storage. */
export function panelChips(stats: DeveloperPanelStats, settings: SiteSettings, t: DevPanelDict): PanelChip[] {
  return [
    { key: 'queue', label: format(t.chipQueue, { n: stats.queueLength }), tone: 'green' },
    {
      key: 'ai',
      label: format(t.chipAi, { used: stats.checksLastDay, limit: settings.aiDailyLimit }),
      tone: stats.checksLastDay >= settings.aiDailyLimit * BUDGET_WARN_SHARE ? 'yellow' : 'green',
    },
    {
      key: 'storage',
      label: format(t.chipStorage, { size: stats.filesSizeLabel }),
      tone: stats.filesSizeBytes > STORAGE_WARN_BYTES ? 'yellow' : 'muted',
    },
  ];
}

// ───────────────────────────── status tiles ─────────────────────────────

export type StatTileKey = 'queue' | 'runs24h' | 'lessonQueue' | 'files' | 'students' | 'topics' | 'lastRetention';

export type StatTile = {
  key: StatTileKey;
  label: string;
  value: string;
  /** Muted continuation of the value («/ 300» of the runs tile). */
  valueSuffix?: string;
  hint?: string;
  /** Progress bar under the value (the 24-hour runs tile only). */
  percent?: number;
  /** Takes the whole row and uses the smaller value size: its value is a date-time, not a counter. */
  wide: boolean;
};

/**
 * The seven stat blocks of the Status tab, in the site's order. `mskMark` («МСК») follows the date-time of
 * the last retention run: the server prints it in Moscow time whatever the device zone is (07 §7 item 14).
 */
export function statTiles(stats: DeveloperPanelStats, settings: SiteSettings, t: DevPanelDict['status'], mskMark: string): StatTile[] {
  return [
    { key: 'queue', label: t.queue, value: String(stats.queueLength), hint: t.queueHint, wide: false },
    {
      key: 'runs24h',
      label: t.runs24h,
      value: String(stats.checksLastDay),
      valueSuffix: `/ ${settings.aiDailyLimit}`,
      hint: t.runsHint,
      percent: budgetPercent(stats.checksLastDay, settings.aiDailyLimit),
      wide: false,
    },
    { key: 'lessonQueue', label: t.lessonQueue, value: String(stats.lessonQueueLength), hint: t.lessonQueueHint, wide: false },
    { key: 'files', label: t.files, value: String(stats.filesCount), hint: stats.filesSizeLabel, wide: false },
    { key: 'students', label: t.students, value: String(stats.studentsCount), wide: false },
    { key: 'topics', label: t.topics, value: String(stats.topicsCount), wide: false },
    {
      key: 'lastRetention',
      label: t.lastRetention,
      value: stats.lastRetentionAt ? `${stats.lastRetentionLabel} ${mskMark}` : stats.lastRetentionLabel,
      wide: true,
    },
  ];
}

// ───────────────────────────── real AI budgets (90-addendum-3 §10.2) ─────────────────────────────

export type BudgetKey = 'homework' | 'lesson' | 'plans';

const BUDGET_KEYS: Record<AiBudgetScope, BudgetKey> = {
  'api:homework-checks:global': 'homework',
  'api:lesson-checks:global': 'lesson',
  'api:ai-plans:global': 'plans',
};

export type BudgetRow = {
  key: BudgetKey;
  used: number;
  limit: number;
  percent: number;
  /** `out` — the next request is refused; `warn` — 80 % and more is spent. */
  state: 'ok' | 'warn' | 'out';
  resetAt: string;
};

/**
 * Rows of the "budgets today" block: the bucket counters that really decide a refusal. They are NOT the
 * trailing-24-hour number of the tile above and never share its label. An absent list (the field is
 * optional) gives no rows.
 */
export function budgetRows(budgets: readonly AiBudgetUsage[] | undefined): BudgetRow[] {
  return (budgets ?? []).flatMap((budget) => {
    const key = BUDGET_KEYS[budget.scope];
    if (!key) return [];
    const state = budget.used >= budget.limit ? 'out' : budget.used >= budget.limit * BUDGET_WARN_SHARE ? 'warn' : 'ok';
    return [{ key, used: budget.used, limit: budget.limit, percent: budgetPercent(budget.used, budget.limit), state, resetAt: budget.resetAt }];
  });
}

// ───────────────────────────── service actions ─────────────────────────────

type ActionsDict = DevPanelDict['actions'];

/**
 * Which actions ask before running. The site asks for none; the spec proposes a confirmation for exactly
 * these two (07 §1.9 phone mapping, §7 item 12) — see the SPEC-GAP note in actions-tab.tsx.
 */
export type ActionConfirm = 'resetBudget' | 'unfreeze';

export type PanelActionRow = {
  action: PanelAction;
  label: keyof ActionsDict;
  hint: keyof ActionsDict;
  confirm: ActionConfirm | null;
};

/** The five service buttons in the site's order. */
export const PANEL_ACTION_ROWS: readonly PanelActionRow[] = [
  { action: 'test-ai', label: 'testAi', hint: 'testAiHint', confirm: null },
  { action: 'run-retention', label: 'retention', hint: 'retentionHint', confirm: null },
  { action: 'reset-ai-budget', label: 'resetBudget', hint: 'resetBudgetHint', confirm: 'resetBudget' },
  { action: 'unfreeze-checks', label: 'unfreeze', hint: 'unfreezeHint', confirm: 'unfreeze' },
  { action: 'flush-caches', label: 'flush', hint: 'flushHint', confirm: null },
];

// ───────────────────────────── broadcast ─────────────────────────────

export const BROADCAST_TITLE_MAX = 120;
export const BROADCAST_BODY_MAX = 300;

export type BroadcastMode = 'all' | 'selected';
export type BroadcastStudent = { id: string; name: string };

/** Students whose name contains the query (case-insensitive); a blank query keeps everyone. */
export function filterRecipients<T extends BroadcastStudent>(students: readonly T[], query: string): T[] {
  const needle = query.trim().toLowerCase();
  return needle ? students.filter((student) => student.name.toLowerCase().includes(needle)) : [...students];
}

/** Picked students in the order of the full list (by name), dropping ids that left the list. */
export function pickedStudents<T extends BroadcastStudent>(students: readonly T[], pickedIds: readonly string[]): T[] {
  const picked = new Set(pickedIds);
  return students.filter((student) => picked.has(student.id));
}

export function toggleRecipient(pickedIds: readonly string[], id: string): string[] {
  return pickedIds.includes(id) ? pickedIds.filter((picked) => picked !== id) : [...pickedIds, id];
}

/**
 * The site's title field is `required`: an empty title never leaves the form. Everything else (a blank
 * title made of spaces, "selected" with nobody picked) is answered by the server with `ok: false`.
 */
export function canSubmitBroadcast(title: string): boolean {
  return title.length > 0;
}

/** Body of `POST /developer/broadcast`; the server trims and cuts the texts itself. */
export function broadcastRequest(input: { title: string; body: string; mode: BroadcastMode; pickedIds: readonly string[] }): BroadcastRequest {
  const request: BroadcastRequest = { title: input.title, toAll: input.mode === 'all' };
  if (input.body.trim()) request.body = input.body;
  if (input.mode === 'selected') request.recipientIds = [...input.pickedIds];
  return request;
}
