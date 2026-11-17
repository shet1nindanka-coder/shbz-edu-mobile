// The rules of the token storage shared by the native (`token-storage.ts`, Keychain / Keystore) and the web
// (`token-storage.web.ts`, localStorage) variants. Pure: the two stores are injected, so the rules are
// unit-tested exactly as the app uses them.
//
// WHY the marker: a sign-out that cannot remove the token (the secure store refuses the deletion) must not
// leave a usable session behind — if the server never heard the logout (offline sign-out), the next start
// would sign the same user back in without a password. Removal falls back to overwriting the value with ""
// (read as "no token"), and if that fails too, a marker naming the token that was signed out is kept in the
// app's other store; start-up then refuses exactly that token. The marker holds a short fingerprint, never
// the token, and matches only the token that was signed out: a later sign-in (a new token) is never locked
// out by it.
import type { TokenStorage } from './token-storage.types';

/** One value in a store. Any method may reject. */
export type StoredValue = {
  get(): Promise<string | null>;
  set(value: string): Promise<void>;
  remove(): Promise<void>;
};

/** A short, non-reversible fingerprint of a token (two FNV-1a hashes; not a secret, only an identity). */
export function tokenFingerprint(token: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ token.length;
  for (let index = 0; index < token.length; index += 1) {
    const code = token.charCodeAt(index);
    a = Math.imul(a ^ code, 0x01000193) >>> 0;
    b = Math.imul(b ^ code ^ (index & 0xff), 0x01000193) >>> 0;
  }
  return `${a.toString(16).padStart(8, '0')}${b.toString(16).padStart(8, '0')}`;
}

async function attempt<T>(run: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false }> {
  try {
    return { ok: true, value: await run() };
  } catch {
    return { ok: false };
  }
}

export function createTokenStorage(secret: StoredValue, signedOutMarker: StoredValue): TokenStorage {
  const forgetMarker = async () => {
    await attempt(() => signedOutMarker.remove());
  };
  return {
    async read() {
      const stored = await attempt(() => secret.get());
      // An unreadable store (restored backup, changed lock screen) reads as "signed out".
      const token = stored.ok && stored.value ? stored.value : null;
      if (!token) return null;
      const marker = await attempt(() => signedOutMarker.get());
      if (marker.ok && marker.value) {
        if (marker.value === tokenFingerprint(token)) {
          // Signed out on this device, but the token could not be removed then: try again, never restore it.
          const removed = await attempt(() => secret.remove());
          if (removed.ok) await forgetMarker();
          return null;
        }
        // A marker of an older token: the stored one is a newer sign-in.
        await forgetMarker();
      }
      return token;
    },
    async write(token) {
      const written = await attempt(() => secret.set(token));
      if (!written.ok) return false;
      await forgetMarker();
      return true;
    },
    async clear() {
      const stored = await attempt(() => secret.get());
      const token = stored.ok && stored.value ? stored.value : null;
      if ((await attempt(() => secret.remove())).ok) {
        await forgetMarker();
        return true;
      }
      // The deletion failed: an empty value reads as "no token".
      if ((await attempt(() => secret.set(''))).ok) return true;
      if (token === null) return stored.ok;
      // Nothing could be changed in the secure store: start-up must refuse this token.
      return (await attempt(() => signedOutMarker.set(tokenFingerprint(token)))).ok;
    },
  };
}
