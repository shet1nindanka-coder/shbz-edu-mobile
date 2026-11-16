/**
 * `DeveloperApi` on the mock store — the developer panel (status, service actions, broadcast, settings) and
 * the audit journal (docs/spec/07-developer-content.md §1.9 – §1.10, §3.13 – §3.14, §4.5 – §4.6;
 * 00 §1.4.9, §2.12; 90-addendum-3 §5 – §6, §10.2).
 *
 * The five methods are developer-only (`403 developerRightsRequired` for a teacher or a student) and have
 * no rate limit on the site. A panel action that "fails" is a normal answer with `ok: false`: `ok` is data
 * here, and `message` is the audit template rendered for the request language.
 */
import type { DeveloperApi } from "@/api/client";
import type {
  AiBudgetScope,
  AiBudgetUsage,
  AuditCategory,
  AuditLog,
  BroadcastResult,
  DeveloperPanelStats,
  IsoDateTime,
  JournalEntry,
  Locale,
  PanelAction,
  PanelActionResult,
  ReasoningEffort,
  SiteSettings,
  UserRole,
} from "@/api/types";
import { AI_BUDGETS, AI_BUDGET_WINDOW_MS, AUDIT_CATEGORIES, LIMITS, PANEL_ACTIONS, REASONING_EFFORTS } from "@/api/types";
import { normalizeModelName } from "@/domain/ai-pricing";
import { auditActorNameFor, auditSummaryFor, renderAuditText, type AuditText } from "@/domain/audit-text";
import { formatDateTime } from "@/domain/dates";
import { formatFileSize } from "@/domain/files";
import { DAY_MS, MINUTE_MS } from "@/domain/moscow-time";

import type { MockContext } from "../context";
import { defaultSiteSettings } from "../fixtures/journal";
import { compareByName } from "../rules/queries";
import { AI_BUDGET_IDENTIFIER } from "../rules/rate-limit";

// ───────────────────────────── constants of the site ─────────────────────────────

/** `PAGE_SIZE` of the journal page. */
const JOURNAL_PAGE_SIZE = LIMITS.journalPageSize;
/** `AUDIT_LOG_RETENTION_DAYS` default — the mock has no environment, so the default always applies. */
export const AUDIT_RETENTION_DAYS = 90;
/** `STALE_CHECK_UNFREEZE_MS` of `unfreezeChecksAction`. */
export const STALE_CHECK_UNFREEZE_MS = 15 * MINUTE_MS;
/** Raw error stored on a check the developer cleared (Russian on purpose: it is stored data, 07 §3.13). */
export const UNFROZEN_CHECK_ERROR = "Проверка снята разработчиком как зависшая. Запустите её заново.";
/** The bucket `resetAiDailyBudgetAction` deletes — the homework-check budget only (90-addendum-3 §5). */
const HOMEWORK_CHECK_BUDGET: AiBudgetScope = "api:homework-checks:global";
/** Order of `DeveloperPanelData.aiBudgets` (90-addendum-3 §10.2: always three items, in this order). */
const AI_BUDGET_SCOPES: readonly AiBudgetScope[] = ["api:homework-checks:global", "api:lesson-checks:global", "api:ai-plans:global"];
/** Latency the mocked model reports for the connection test. Deterministic: no randomness in the mock. */
export const MOCK_AI_PING_MS = 640;

type Developer = { id: string; name: string; role: UserRole };

// ───────────────────────────── settings (07 §4.5) ─────────────────────────────

type SettingRule =
  | { kind: "bool" }
  | { kind: "int"; min: number; max: number }
  | { kind: "float"; min: number; max: number }
  | { kind: "text"; maxLength: number }
  | { kind: "effort" };

const int = (min: number, max: number): SettingRule => ({ kind: "int", min, max });

/** The 25 keys with the site's ranges (`applySettingRows`). */
const SETTING_RULES: { [K in keyof SiteSettings]: SettingRule } = {
  aiEnabled: { kind: "bool" },
  aiModel: { kind: "text", maxLength: 100 },
  aiShortlistModel: { kind: "text", maxLength: 100 },
  aiReasoningEffort: { kind: "effort" },
  aiMinConfidence: { kind: "float", min: 0, max: 1 },
  aiDailyLimit: int(1, 100_000),
  aiPerStudentHourlyLimit: int(1, 1000),
  aiCheckConcurrency: int(1, 8),
  photoRetentionDays: int(0, 3650),
  maxPhotosPerAssignment: int(LIMITS.maxPhotosPerAssignment.min, LIMITS.maxPhotosPerAssignment.max),
  completedChecksKept: int(1, 500),
  lessonPlanEnabled: { kind: "bool" },
  lessonPlanShortlistSize: int(20, 150),
  lessonPlanMaxItems: int(5, 60),
  lessonPlanConcurrency: int(1, 10),
  aiPlanDailyLimit: int(1, 100_000),
  homeworkPlanEnabled: { kind: "bool" },
  homeworkPlanMaxItems: int(3, 60),
  homeworkPlanShortlistSize: int(20, 150),
  lessonCheckEnabled: { kind: "bool" },
  lessonCheckDailyLimit: int(1, 100_000),
  lessonCheckPerStudentHourlyLimit: int(1, 1000),
  lessonIdleWarnMinutes: int(1, 120),
  lessonIdleAlertMinutes: int(1, 240),
  loginHelpContact: { kind: "text", maxLength: 200 },
};

const SETTING_KEYS = Object.keys(SETTING_RULES) as (keyof SiteSettings)[];

/** The site's `toFiniteNumber`: a blank string (and anything that is not a number) means "no value", not zero. */
function toFiniteNumber(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

/** One value of the request, validated like `applySettingRows`; `fallback` is the default of the key. */
function parseSetting(rule: SettingRule, raw: unknown, fallback: SiteSettings[keyof SiteSettings]): SiteSettings[keyof SiteSettings] {
  switch (rule.kind) {
    case "bool":
      // The form sends "on" for a checked switch; the JSON body sends a real boolean.
      return raw === true || raw === "true" || raw === "on";
    case "int": {
      const value = toFiniteNumber(raw);
      return value === null ? fallback : Math.min(rule.max, Math.max(rule.min, Math.floor(value)));
    }
    case "float": {
      const value = toFiniteNumber(raw);
      return value === null ? fallback : Math.min(rule.max, Math.max(rule.min, value));
    }
    case "text":
      return typeof raw === "string" ? raw.trim().slice(0, rule.maxLength) : "";
    case "effort":
      return typeof raw === "string" && (REASONING_EFFORTS as readonly string[]).includes(raw) ? (raw as ReasoningEffort) : fallback;
  }
}

/**
 * The values the server stores for a `PUT /developer/settings` body. A key that is present is validated
 * with the site's rules — a blank or non-numeric number falls back to the DEFAULT of the key (not to the
 * value saved before), out-of-range numbers are clamped, texts are trimmed and cut.
 */
export function applySettingsPatch(current: SiteSettings, defaults: SiteSettings, values: unknown): SiteSettings {
  const input = values && typeof values === "object" && !Array.isArray(values) ? (values as Record<string, unknown>) : {};
  const next: Record<string, unknown> = { ...current };
  for (const key of SETTING_KEYS) {
    const raw = input[key];
    // SPEC-GAP: the site's form always posts all 25 fields; the mobile body is `Partial<SiteSettings>`
    // (00 §2.12), so a key that is absent keeps its stored value instead of being reset.
    if (raw === undefined) continue;
    next[key] = parseSetting(SETTING_RULES[key], raw, defaults[key]);
  }
  return next as unknown as SiteSettings;
}

// ───────────────────────────── journal query (07 §1.10, §3.14) ─────────────────────────────

/** `parseDays` of the journal page: any finite number in 0..365 (floored), anything else → 7. 0 = all time. */
function parseJournalDays(raw: unknown): number {
  const value = toFiniteNumber(raw);
  const { min, max, default: fallback } = LIMITS.journalDays;
  return value !== null && value >= min && value <= max ? Math.floor(value) : fallback;
}

/** `Math.max(1, Math.floor(Number(page) || 1))`. */
function parseJournalPage(raw: unknown): number {
  return Math.max(1, Math.floor(toFiniteNumber(raw) || 1));
}

const cloneMeta = (meta: Record<string, unknown> | null): Record<string, unknown> | null =>
  meta ? (JSON.parse(JSON.stringify(meta)) as Record<string, unknown>) : null;

/**
 * The mocked provider of the connection test: it serves the model families the site prices (`gpt-…`,
 * o-series) and answers 404 for any other name, so a mistyped model in Settings shows the failed result.
 */
const providerKnowsModel = (model: string): boolean => /^(gpt-|o\d)/.test(normalizeModelName(model));

/** `isReasoningModel` of the site's `lib/ai-chat.ts` — the parameter mode the ping reports in `meta`. */
function chatParamMode(model: string): "reasoning" | "classic" {
  const name = normalizeModelName(model);
  if (/^o\d/.test(name)) return "reasoning";
  const gpt = /^gpt-(\d+)/.exec(name);
  if (!gpt || Number(gpt[1]) < 5) return "classic";
  return /-chat(-|$)/.test(name) ? "classic" : "reasoning";
}

// ───────────────────────────── the member ─────────────────────────────

export function createDeveloper(ctx: MockContext): DeveloperApi {
  const { store, auth, q } = ctx;

  /** Result without a journal row: the template in the developer's language (`panelResult`). */
  const panelResult = (ok: boolean, text: AuditText): PanelActionResult => ({ ok, message: renderAuditText(text, ctx.locale()) });

  /** Writes the journal row and answers with the same template (`auditReturn`). */
  const auditReturn = (
    developer: Developer,
    action: string,
    ok: boolean,
    text: AuditText,
    options: { category?: AuditCategory; meta?: Record<string, unknown> } = {},
  ): PanelActionResult => {
    ctx.audit.write({
      category: options.category ?? "DATA",
      action,
      outcome: ok ? "ok" : "failed",
      actor: developer,
      text,
      meta: options.meta ?? null,
    });
    return panelResult(ok, text);
  };

  // ── status tab ──

  /**
   * `internal.retentionLastRunAt`. The mock store has no internal settings, so the moment is read from the
   * journal: the newest successful `developer.retention_run` row (the action writes both at the same time).
   */
  const lastRetentionAt = (): IsoDateTime | null => {
    let latest: IsoDateTime | null = null;
    for (const row of store.auditLogs.filter((entry) => entry.action === "developer.retention_run" && entry.outcome === "ok")) {
      if (latest === null || row.createdAt > latest) latest = row.createdAt;
    }
    return latest;
  };

  const panelStats = (): DeveloperPanelStats => {
    const locale = ctx.locale();
    const dayAgo = new Date(ctx.now() - DAY_MS).toISOString();
    const files = store.files.all();
    const filesSizeBytes = files.reduce((total, file) => total + file.size, 0);
    const retentionAt = lastRetentionAt();
    // SPEC-GAP: both queues are in-memory on the site and have no stored counterpart. The mock counts the
    // rows whose deferred job is still queued: waiting (PENDING) checks of both kinds — the site's check
    // queue is shared by homework checks and lesson submissions — and every plan generation not finished yet.
    const isQueued = (row: { id: string; status: string }) => row.status === "PENDING" && ctx.jobs.pending(row.id).length > 0;
    return {
      queueLength: store.homeworkChecks.count(isQueued) + store.submissions.count(isQueued),
      // Trailing 24 hours of rows — NOT the budget bucket (90-addendum-3 §6): the reset action never changes it.
      checksLastDay: store.homeworkChecks.count((check) => check.createdAt >= dayAgo),
      studentsCount: store.users.by("role", "STUDENT").length,
      topicsCount: store.topics.count(),
      filesCount: files.length,
      filesSizeBytes,
      filesSizeLabel: formatFileSize(filesSizeBytes, locale),
      lastRetentionAt: retentionAt,
      lastRetentionLabel: retentionAt ? formatDateTime(retentionAt, locale) : ctx.dict().planner.devPanel.retentionNever,
      lessonQueueLength: store.jobs.count((job) => job.kind === "planGeneration" && store.participants.has(job.refId)),
    };
  };

  /** The real buckets that decide a refusal (90-addendum-3 §10.2): `used` is 0 once the window has passed. */
  const aiBudgets = (): AiBudgetUsage[] => {
    const buckets = ctx.limits.list();
    const resetAt = new Date(Math.floor(ctx.now() / AI_BUDGET_WINDOW_MS) * AI_BUDGET_WINDOW_MS + AI_BUDGET_WINDOW_MS).toISOString();
    return AI_BUDGET_SCOPES.map((scope) => {
      const bucket = buckets.find((row) => row.scope === scope && row.identifier === AI_BUDGET_IDENTIFIER && row.kind === "fixed");
      return { scope, limit: ctx.settings()[AI_BUDGETS[scope]], used: bucket?.hits ?? 0, resetAt };
    });
  };

  // ── service actions (07 §3.13) ──

  const testAi = (developer: Developer): PanelActionResult => {
    const settings = ctx.settings();
    const model = settings.aiModel.trim();
    // The API key is not a setting; in the mock it counts as configured, so the switch and the model decide.
    // No journal row for this refusal.
    if (!settings.aiEnabled || !model) return panelResult(false, { key: "developer.ai_disabled" });

    if (!providerKnowsModel(model)) {
      const status = 404;
      const rawBody = `{"error":{"message":"The model \`${model}\` does not exist"}}`;
      const reason = `HTTP ${status} ${rawBody.slice(0, 140)}`.trim();
      return auditReturn(developer, "developer.ai_ping", false, { key: "developer.ai_ping_failed", params: { reason } }, { category: "AI", meta: { model, status } });
    }
    return auditReturn(
      developer,
      "developer.ai_ping",
      true,
      { key: "developer.ai_ping", params: { model, elapsedMs: MOCK_AI_PING_MS } },
      { category: "AI", meta: { model, elapsedMs: MOCK_AI_PING_MS, mode: chatParamMode(model) } },
    );
  };

  /** `pruneExpiredHomeworkPhotos`: photo links older than `photoRetentionDays` go, then the files nothing uses. */
  const pruneExpiredPhotos = (): { submissionPhotos: number; checkPhotos: number; lessonPhotos: number; files: number } => {
    const total = { submissionPhotos: 0, checkPhotos: 0, lessonPhotos: 0, files: 0 };
    const retentionDays = ctx.settings().photoRetentionDays;
    // 0 = auto-delete is off.
    if (!(retentionDays > 0)) return total;
    const cutoff = new Date(ctx.now() - retentionDays * DAY_MS).toISOString();

    store.transaction(() => {
      const attached = store.homeworkPhotos.deleteWhere((photo) => photo.createdAt < cutoff);
      const snapshots = store.homeworkCheckPhotos.deleteWhere((photo) => {
        const check = store.homeworkChecks.get(photo.checkId);
        return check !== undefined && check.createdAt < cutoff;
      });
      const lesson = store.submissionPhotos.deleteWhere((photo) => {
        const submission = store.submissions.get(photo.submissionId);
        return submission !== undefined && submission.submittedAt < cutoff;
      });
      total.submissionPhotos = attached.length;
      total.checkPhotos = snapshots.length;
      total.lessonPhotos = lesson.length;
      const fileIds = new Set([...attached, ...snapshots, ...lesson].map((photo) => photo.fileId));
      for (const fileId of fileIds) {
        if (ctx.files.removeIfUnreferenced(fileId)) total.files += 1;
      }
    });
    return total;
  };

  const runRetention = (developer: Developer): PanelActionResult => {
    const result = pruneExpiredPhotos();
    // The message counts homework photos only (attached + snapshots); lesson photos are in `meta`.
    return auditReturn(
      developer,
      "developer.retention_run",
      true,
      { key: "developer.retention_run", params: { photos: result.submissionPhotos + result.checkPhotos, files: result.files } },
      { meta: { ...result } },
    );
  };

  const resetAiBudget = (developer: Developer): PanelActionResult => {
    // Only this one bucket: the lesson-check and the plan budgets, the per-student hourly buckets and the
    // "runs in 24 hours" tile stay exactly as they were (90-addendum-3 §5).
    ctx.limits.reset(HOMEWORK_CHECK_BUDGET, AI_BUDGET_IDENTIFIER);
    return auditReturn(developer, "developer.ai_budget_reset", true, { key: "developer.ai_budget_reset" });
  };

  const unfreezeChecks = (developer: Developer): PanelActionResult => {
    const threshold = new Date(ctx.now() - STALE_CHECK_UNFREEZE_MS).toISOString();
    const checkedAt = ctx.nowIso();
    const count = store.transaction(() => {
      const stale = store.homeworkChecks.filter((check) => (check.status === "PENDING" || check.status === "CHECKING") && check.createdAt < threshold);
      for (const check of stale) {
        store.homeworkChecks.update(check.id, { status: "FAILED", activeSlot: null, error: UNFROZEN_CHECK_ERROR, checkedAt });
        // The check is terminal now: its deferred transitions must not run later. No budget slot is given
        // back — only the per-student stale sweep of the student routes refunds (90-addendum-3 §3).
        ctx.jobs.cancel(check.id);
        store.rowScripts.delete(check.id);
      }
      return stale.length;
    });
    return auditReturn(developer, "developer.checks_unfrozen", true, { key: "developer.checks_unfrozen", params: { count } }, { meta: { count } });
  };

  const flushCaches = (developer: Developer): PanelActionResult =>
    // The mock has no caches: every read is computed from the store. Only the journal row remains.
    auditReturn(developer, "developer.caches_flushed", true, { key: "developer.caches_flushed" });

  const ACTIONS: Record<PanelAction, (developer: Developer) => PanelActionResult> = {
    "test-ai": testAi,
    "run-retention": runRetention,
    "reset-ai-budget": resetAiBudget,
    "unfreeze-checks": unfreezeChecks,
    "flush-caches": flushCaches,
  };

  // ── journal ──

  const toJournalEntry = (row: AuditLog, locale: Locale, actionLabels: Record<string, string>): JournalEntry => {
    const isProgress = row.action === "progress.status";
    // The bold line of a `progress.status` row exists only while its history event still does.
    const event = isProgress && row.targetId ? store.progressEvents.get(row.targetId) : undefined;
    const student = event ? q.user(event.studentId) : undefined;
    const number = event ? q.number(event.homeworkNumberId) : undefined;
    const topic = number ? q.topic(number.topicId) : undefined;
    const progressTarget = student && number && topic ? `${student.name} · № ${number.number} · ${topic.title}` : null;

    let progressRef: JournalEntry["progressRef"] = null;
    if (isProgress) {
      const studentId = row.meta?.studentId;
      const homeworkNumberId = row.meta?.homeworkNumberId;
      if (typeof studentId === "string" && typeof homeworkNumberId === "string") {
        progressRef = { studentId, homeworkNumberId };
      } else if (event) {
        // SPEC-GAP: the site reads the pair from `meta` only. A row whose meta lacks it (written before
        // the ids were stored there) but whose history event still exists opens the same widget here.
        progressRef = { studentId: event.studentId, homeworkNumberId: event.homeworkNumberId };
      }
    }

    return {
      id: row.id,
      createdAt: row.createdAt,
      category: row.category,
      action: row.action,
      actionLabel: Object.prototype.hasOwnProperty.call(actionLabels, row.action) ? (actionLabels[row.action] ?? null) : null,
      outcome: row.outcome,
      // System actors («Автопроверка») are stored as a Russian snapshot and shown in the UI language.
      actorName: auditActorNameFor(row.actorName, locale),
      actorRole: row.actorRole,
      progressTarget,
      summary: auditSummaryFor(row, locale) ?? row.targetLabel ?? null,
      progressRef,
      meta: cloneMeta(row.meta),
      error: row.error,
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      // `clientIp`, `durationMs` and `model` are stored but are not part of the journal row (07 §7 item 8).
      costRub: row.costRub,
    };
  };

  return {
    async getPanel() {
      auth.requireDeveloper();
      return {
        stats: panelStats(),
        settings: { ...ctx.settings() },
        // Recipients of the broadcast tab: every student, by name.
        students: q.allStudents().map((student) => ({ id: student.id, name: student.name })),
        aiBudgets: aiBudgets(),
      };
    },

    async saveSettings(values) {
      const developer = auth.requireDeveloper();
      // "The default of the key" is the env default on the site; the mock's environment is the seeded defaults.
      const next = applySettingsPatch(ctx.settings(), defaultSiteSettings(), values);
      // Saving always writes all 25 keys. `500 saveFailed` (a missing `SiteSetting` table) cannot happen here.
      store.patchSettings(next);
      const result = auditReturn(developer, "developer.settings_saved", true, { key: "developer.settings_saved" });
      // The clamped values, so the form can show what was really stored.
      return { ...result, settings: { ...ctx.settings() } };
    },

    async runAction(action) {
      const developer = auth.requireDeveloper();
      // SPEC-GAP: the contract lists no error for an unknown `{action}` path value; the generic 400 is used.
      if (!ctx.validate.oneOf(action, PANEL_ACTIONS)) throw ctx.errors.invalidData();
      return ACTIONS[action](developer);
    },

    async broadcast(input) {
      const developer = auth.requireDeveloper();
      const title = ctx.validate.clip(input?.title, LIMITS.broadcast.titleMaxLength);
      const body = ctx.validate.clip(input?.body, LIMITS.broadcast.bodyMaxLength);
      const toAll = input?.toAll === true;
      const selectedIds = ctx.validate.ids(input?.recipientIds);

      // No journal row for a refused form.
      if (title.length < LIMITS.broadcast.titleMinLength || (!toAll && selectedIds.length === 0)) {
        return panelResult(false, { key: "developer.broadcast_invalid" });
      }

      // Students only: ids of teachers, developers and unknown ids are dropped silently.
      const selected = new Set(selectedIds);
      const recipients = q.allStudents().filter((student) => toAll || selected.has(student.id));
      for (const student of recipients) {
        // Free text, stored and shown as typed (no params → never translated); no link, no realtime push.
        ctx.notify.create({ userId: student.id, type: "broadcast", title, body: body || null, href: null });
      }

      const count = recipients.length;
      const sent = auditReturn(
        developer,
        "developer.broadcast_sent",
        true,
        { key: "developer.broadcast_sent", params: { count } },
        { meta: { recipients: count, toAll, title } },
      );
      const result: BroadcastResult = { ...sent, count };
      return result;
    },

    async getJournal(query) {
      auth.requireDeveloper();
      const locale = ctx.locale();

      // Server parsing of the filters: an unknown category is "no filter", blank strings are absent.
      const rawCategory: unknown = query?.category;
      const category = ctx.validate.oneOf(rawCategory, AUDIT_CATEGORIES) ? rawCategory : null;
      const actorId = ctx.validate.text(query?.actor);
      const actionQuery = ctx.validate.text(query?.action);
      const onlyFailed = query?.outcome === "failed";
      const days = parseJournalDays(query?.days);
      const page = parseJournalPage(query?.page);
      const since = days > 0 ? new Date(ctx.now() - days * DAY_MS).toISOString() : null;

      const rows = store.auditLogs
        .all()
        .map((row, index) => ({ row, index }))
        .filter(
          ({ row }) =>
            (category === null || row.category === category) &&
            (actorId === null || row.actorId === actorId) &&
            // Case-sensitive substring of the system name (action names are lowercase).
            (actionQuery === null || row.action.includes(actionQuery)) &&
            (!onlyFailed || row.outcome === "failed") &&
            (since === null || row.createdAt >= since),
        )
        // Newest first; rows of the same instant in reverse order of writing.
        .sort((left, right) => right.row.createdAt.localeCompare(left.row.createdAt) || right.index - left.index);

      const total = rows.length;
      const actionLabels = ctx.dict().planner.journal.actions;
      const entries = rows.slice((page - 1) * JOURNAL_PAGE_SIZE, page * JOURNAL_PAGE_SIZE).map(({ row }) => toJournalEntry(row, locale, actionLabels));

      // The filter offers every user that has at least one journal row (current names, by name).
      const actorIds = new Set<string>();
      for (const row of store.auditLogs.all()) {
        if (row.actorId) actorIds.add(row.actorId);
      }
      const actors = Array.from(actorIds)
        .flatMap((id) => {
          const user = q.user(id);
          return user ? [{ id: user.id, name: user.name, role: user.role }] : [];
        })
        .sort(compareByName);

      return {
        entries,
        total,
        // A page past the end is answered as asked, with no entries (the site does not redirect).
        page,
        pageSize: JOURNAL_PAGE_SIZE,
        pageCount: Math.max(1, Math.ceil(total / JOURNAL_PAGE_SIZE)),
        actors,
        retentionDays: AUDIT_RETENTION_DAYS,
      };
    },
  };
}
