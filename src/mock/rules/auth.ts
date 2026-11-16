/**
 * Sessions and role checks of the mock backend (docs/spec/01-shell-auth.md §4.1 – §4.2,
 * 90-addendum-1 A.1 rule 3, 90-addendum-5 B.6 rule 4):
 * - no valid session → `401 sessionExpired` (the only error that signs the user out);
 * - valid session, wrong role → `403 unauthorized` (`403 developerRightsRequired` on developer-only endpoints);
 * - a foreign resource is a `404`, never a 403 — see `guards.ts`.
 */
import type { AuthenticatedUser, IsoDateTime, Session, UserRole } from "@/api/types";
import { LIMITS } from "@/api/types";
import { DAY_MS } from "@/domain/moscow-time";

import type { MockUser } from "../store/schema";
import type { MockCore } from "./core";

export type SessionInfo = { session: Session; user: MockUser };

export interface MockAuth {
  /** The bearer token the client currently sends (set by `MockApiClient.setSessionToken`). */
  token(): string | null;
  /**
   * Resolves the current token to its session and user. An unknown token → null; an expired session is
   * deleted and → null. Never throws.
   */
  session(): SessionInfo | null;
  /** The signed-in user, or null (no error). */
  currentUser(): MockUser | null;
  /**
   * The signed-in user, or `401 sessionExpired`. With `roles`, a user of another role → `403 unauthorized`.
   * This is the first line of almost every mock method.
   */
  requireUser(roles?: UserRole | readonly UserRole[]): MockUser;
  /** `requireUser("STUDENT")`. */
  requireStudent(): MockUser;
  /** `requireUser("TEACHER")` — endpoints a developer may not call (e.g. recording a parent call). */
  requireTeacher(): MockUser;
  /** `requireUser(["TEACHER", "DEVELOPER"])`. */
  requireStaff(): MockUser;
  /** A DEVELOPER, else `403 developerRightsRequired` (developer-only endpoints). */
  requireDeveloper(): MockUser;
  /** Creates a session for the user: a new opaque token, `expiresAt = now + 30 days` (absolute, no sliding renewal). */
  createSession(userId: string): Session;
  /** Deletes the session of this token (logout). */
  deleteSession(token: string): void;
  /** Deletes every session of the user (password change / reset, account deletion). Returns the number removed. */
  deleteSessionsOfUser(userId: string): number;
  /** Deletes expired sessions of all users (the site does it on every successful sign-in). */
  purgeExpiredSessions(): void;
  /** The wire projection of a user (`AuthenticatedUser`) — never carries the password. */
  toAuthenticatedUser(user: MockUser): AuthenticatedUser;
}

const TOKEN_BYTES = 32;

/** 64 hex characters, like the site's session token. Random on purpose: a token is a secret, not fixture data. */
function generateToken(): string {
  const bytes = new Uint8Array(TOKEN_BYTES);
  const source = (globalThis as { crypto?: { getRandomValues?: (array: Uint8Array) => Uint8Array } }).crypto;
  if (source?.getRandomValues) {
    source.getRandomValues(bytes);
  } else {
    // Demo data only: the mock never leaves the device, so a non-cryptographic fallback is acceptable.
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  }
  let token = "";
  for (const byte of bytes) token += byte.toString(16).padStart(2, "0");
  return token;
}

export function createAuth(core: MockCore, getToken: () => string | null): MockAuth {
  const { store, errors } = core;

  const session = (): SessionInfo | null => {
    const token = getToken();
    if (!token) return null;
    const row = store.sessions.findUnique("token", token);
    if (!row) return null;
    if (new Date(row.expiresAt).getTime() <= core.now()) {
      store.sessions.delete(row.id);
      return null;
    }
    const user = store.users.get(row.userId);
    if (!user) {
      store.sessions.delete(row.id);
      return null;
    }
    return { session: row, user };
  };

  const requireUser = (roles?: UserRole | readonly UserRole[]): MockUser => {
    const info = session();
    if (!info) throw errors.sessionExpired();
    if (roles !== undefined) {
      const allowed: readonly UserRole[] = typeof roles === "string" ? [roles] : roles;
      if (!allowed.includes(info.user.role)) throw errors.unauthorized();
    }
    return info.user;
  };

  return {
    token: getToken,
    session,
    currentUser: () => session()?.user ?? null,
    requireUser,
    requireStudent: () => requireUser("STUDENT"),
    requireTeacher: () => requireUser("TEACHER"),
    requireStaff: () => requireUser(["TEACHER", "DEVELOPER"]),
    requireDeveloper() {
      const info = session();
      if (!info) throw errors.sessionExpired();
      if (info.user.role !== "DEVELOPER") throw errors.developerRightsRequired();
      return info.user;
    },
    createSession(userId) {
      const createdAt: IsoDateTime = core.nowIso();
      return store.sessions.insert({
        id: store.nextId("ses"),
        token: generateToken(),
        userId,
        expiresAt: new Date(core.now() + LIMITS.sessionTtlDays * DAY_MS).toISOString(),
        createdAt,
      });
    },
    deleteSession(token) {
      const row = store.sessions.findUnique("token", token);
      if (row) store.sessions.delete(row.id);
    },
    deleteSessionsOfUser(userId) {
      const rows = store.sessions.by("userId", userId);
      for (const row of rows) store.sessions.delete(row.id);
      return rows.length;
    },
    purgeExpiredSessions() {
      const now = core.now();
      store.sessions.deleteWhere((row) => new Date(row.expiresAt).getTime() <= now);
    },
    toAuthenticatedUser: (user) => ({ id: user.id, name: user.name, email: user.email, role: user.role, createdAt: user.createdAt }),
  };
}
