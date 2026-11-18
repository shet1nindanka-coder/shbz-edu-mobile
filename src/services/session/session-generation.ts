/**
 * The installed bearer token plus its generation: a counter bumped whenever the token changes (sign-in,
 * sign-out, expiry, a rotated token after a password change). Code that started work for one session and
 * finishes later — an API answer, `GET /me`, a file lookup — compares the generation it captured with the
 * current one and drops its session-level side effects when they differ: they belong to a session that is
 * gone, and acting on them would sign out (or re-read) the user who is signed in now.
 *
 * Pure: the slot calls `install` (e.g. `MockApiClient.setSessionToken`) and keeps nothing else.
 */
export interface SessionTokenSlot {
  /** Installs `token` (null = signed out); a different value starts a new generation. */
  set(token: string | null): void;
  /** The token installed now, or null. */
  token(): string | null;
  /** The generation now; starts at 0. */
  generation(): number;
}

export function createSessionTokenSlot(install: (token: string | null) => void): SessionTokenSlot {
  let current: string | null = null;
  let generation = 0;
  return {
    set(token) {
      const next = typeof token === 'string' && token ? token : null;
      if (next !== current) {
        current = next;
        generation += 1;
      }
      install(next);
    },
    token: () => current,
    generation: () => generation,
  };
}
