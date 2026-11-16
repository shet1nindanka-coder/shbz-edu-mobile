/**
 * Developer panel and journal (owner spec 07; AI budgets: 90-addendum-3).
 * Source: docs/spec/00-unified-contract.md §1.4.9.
 */
import type { SiteSettings } from "./entities";
import type { AuditCategory, IsoDateTime, UserRole } from "./primitives";

export type DeveloperPanelStats = {
  /** Waiting homework checks. */
  queueLength: number;
  /** Trailing 24 h, homework checks only — NOT the budget bucket. */
  checksLastDay: number;
  studentsCount: number;
  topicsCount: number;
  filesCount: number;
  filesSizeBytes: number;
  /** Localized, ready to show. */
  filesSizeLabel: string;
  lastRetentionAt: IsoDateTime | null;
  /** Localized, ready to show. */
  lastRetentionLabel: string;
  lessonQueueLength: number;
};

/** The three school-wide daily AI budgets (identifier is always "global"). */
export type AiBudgetScope =
  /** limit: `SiteSettings.aiDailyLimit` */
  | "api:homework-checks:global"
  /** limit: `SiteSettings.lessonCheckDailyLimit` */
  | "api:lesson-checks:global"
  /** limit: `SiteSettings.aiPlanDailyLimit` */
  | "api:ai-plans:global";

/** Real bucket state of one budget; fixed 24-hour window aligned to 00:00 UTC. */
export type AiBudgetUsage = { scope: AiBudgetScope; limit: number; used: number; resetAt: IsoDateTime };

/** `GET /developer/panel`. `aiBudgets` is optional (90-addendum-3 §10.2). */
export type DeveloperPanelData = {
  stats: DeveloperPanelStats;
  settings: SiteSettings;
  /** Recipients offered by the broadcast tab. */
  students: { id: string; name: string }[];
  aiBudgets?: AiBudgetUsage[];
};

export const PANEL_ACTIONS = ["test-ai", "run-retention", "reset-ai-budget", "unfreeze-checks", "flush-caches"] as const;
/** `{action}` of `POST /developer/actions/{action}` (path values). `reset-ai-budget` clears the homework-check budget only. */
export type PanelAction = (typeof PANEL_ACTIONS)[number];

/** `ok` is DATA here: a failed panel action is a normal 200 with `ok: false`. `message` is localized. */
export type PanelActionResult = { ok: boolean; message: string };

/** `PUT /developer/settings` result (the server clamps the values it stores). */
export type SaveSettingsResult = PanelActionResult & { settings: SiteSettings };

/** `POST /developer/broadcast`. `title` 1..120, `body` ≤ 300; `recipientIds` is used when `toAll` is false. */
export type BroadcastRequest = { title: string; body?: string; toAll: boolean; recipientIds?: string[] };
/** `count` = recipients notified. */
export type BroadcastResult = PanelActionResult & { count?: number };

export type JournalEntry = {
  id: string;
  createdAt: IsoDateTime;
  category: AuditCategory;
  /** Dotted event name, e.g. "auth.login.failed", "progress.status". */
  action: string;
  /** Localized label of `action`, or null when the action has no template. */
  actionLabel: string | null;
  outcome: "ok" | "failed";
  actorName: string | null;
  actorRole: UserRole | null;
  /** "{student} · № {number} · {topic}" for `progress.status` rows, else null. */
  progressTarget: string | null;
  /** Rendered for `Accept-Language`. */
  summary: string | null;
  /** Present on `progress.status` rows — opens the progress-history widget. */
  progressRef: { studentId: string; homeworkNumberId: string } | null;
  meta: Record<string, unknown> | null;
  error: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  /** Decimal as a string. */
  costRub: string | null;
};

/** Query of `GET /developer/journal`. */
export type JournalQuery = {
  category?: AuditCategory;
  /** Actor id. */
  actor?: string;
  action?: string;
  outcome?: "failed";
  /** 0..365, default 7; 0 = all time. */
  days?: number;
  /** ≥ 1, default 1. */
  page?: number;
};

export type JournalPage = {
  entries: JournalEntry[];
  total: number;
  page: number;
  pageSize: 50;
  pageCount: number;
  /** Actors offered by the filter. */
  actors: { id: string; name: string; role: UserRole }[];
  retentionDays: number;
};
