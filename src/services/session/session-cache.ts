/**
 * The last known user, kept next to the secure token so a cold start WITHOUT a connection can still open
 * the role's tree on cached data (the token itself stays in secure storage; this holds no secret).
 * The cached user is re-validated with `GET /me` as soon as a request gets through.
 */
import { USER_ROLES, type AuthenticatedUser } from "@/api/types";

import type { KeyValueStorage } from "../preferences";

export const SESSION_USER_KEY = "shbz-session-user";

function isRole(value: unknown): value is AuthenticatedUser["role"] {
  return typeof value === "string" && (USER_ROLES as readonly string[]).includes(value);
}

/** Validates a stored snapshot field by field; anything unexpected reads as "no cached user". */
export function parseCachedUser(raw: string | null | undefined): AuthenticatedUser | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const { id, name, email, role, createdAt } = parsed as Record<string, unknown>;
  if (typeof id !== "string" || !id || typeof name !== "string" || typeof email !== "string") return null;
  if (!isRole(role) || typeof createdAt !== "string") return null;
  return { id, name, email, role, createdAt };
}

export function createSessionCache(storage: KeyValueStorage) {
  return {
    async read(): Promise<AuthenticatedUser | null> {
      try {
        return parseCachedUser(await storage.getItem(SESSION_USER_KEY));
      } catch {
        return null;
      }
    },
    async write(user: AuthenticatedUser): Promise<void> {
      try {
        await storage.setItem(SESSION_USER_KEY, JSON.stringify(user));
      } catch {
        // Only costs the offline cold start.
      }
    },
    async clear(): Promise<void> {
      try {
        await storage.removeItem(SESSION_USER_KEY);
      } catch {
        // Nothing to remove.
      }
    },
  };
}

export type SessionCache = ReturnType<typeof createSessionCache>;
