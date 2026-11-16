/**
 * Audit journal writer — the mock `writeAuditLog` (docs/spec/09-data-i18n-math.md §1.4, §2.12). A row keeps
 * a Russian snapshot in `summary` and `{ key, params }` in `meta.i18n`, so the journal renders in the UI
 * language. Never pass personal data (parent-call comments, notes, solution content) into a journal row.
 */
import type { AuditCategory, AuditLog, UserRole } from "@/api/types";
import { renderAuditText, withAuditText, type AuditText } from "@/domain/audit-text";

import { MOCK_CLIENT_IP } from "../controls";
import type { MockUser } from "../store/schema";
import type { MockCore } from "./core";

export type AuditInput = {
  category: AuditCategory;
  /** Dotted action name = key of `dict.audit.templates` (e.g. `"auth.login"`, `"student.created"`). */
  action: string;
  outcome?: "ok" | "failed";
  /** The acting user; omit for a system action and pass `actorName` (a Russian snapshot such as «Автопроверка»). */
  actor?: Pick<MockUser, "id" | "name" | "role"> | null;
  actorName?: string | null;
  actorRole?: UserRole | null;
  targetType?: string | null;
  targetId?: string | null;
  targetLabel?: string | null;
  /** Template key + params: produces the Russian `summary` and `meta.i18n`. */
  text?: AuditText;
  /** A ready Russian summary, when there is no template. */
  summary?: string | null;
  model?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  costRub?: string | null;
  durationMs?: number | null;
  /** Raw error text (≤ 500 chars are kept). */
  error?: string | null;
  meta?: Record<string, unknown> | null;
};

export interface MockAudit {
  /** Appends a journal row and returns it. Best effort on the site; in the mock it always succeeds. */
  write(input: AuditInput): AuditLog;
}

export function createAudit(core: MockCore): MockAudit {
  const { store } = core;
  return {
    write(input) {
      const meta = input.text ? (withAuditText(input.meta ?? null, input.text) as Record<string, unknown>) : (input.meta ?? null);
      return store.auditLogs.insert({
        id: store.nextId("aud"),
        createdAt: core.nowIso(),
        category: input.category,
        action: input.action,
        outcome: input.outcome ?? "ok",
        actorId: input.actor?.id ?? null,
        actorName: input.actor?.name ?? input.actorName ?? null,
        actorRole: input.actor?.role ?? input.actorRole ?? null,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        targetLabel: input.targetLabel ?? null,
        summary: input.summary ?? (input.text ? renderAuditText(input.text, "ru") : null),
        model: input.model ?? null,
        inputTokens: input.inputTokens ?? null,
        outputTokens: input.outputTokens ?? null,
        costRub: input.costRub ?? null,
        durationMs: input.durationMs ?? null,
        error: input.error ? input.error.slice(0, 500) : null,
        meta,
        clientIp: MOCK_CLIENT_IP,
      });
    },
  };
}
