// Web fallback of the token storage: the browser has no secure enclave, so the token is kept in
// `localStorage` (the web export exists for verification, not as a product surface).
import type { TokenStorage } from './token-storage.types';

const TOKEN_KEY = 'shbz.session.token';

function storage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    // Storage can be blocked (private mode, embedded frames).
    return null;
  }
}

export const tokenStorage: TokenStorage = {
  async read() {
    try {
      return storage()?.getItem(TOKEN_KEY) || null;
    } catch {
      return null;
    }
  },
  async write(token) {
    try {
      const target = storage();
      if (!target) return false;
      target.setItem(TOKEN_KEY, token);
      return true;
    } catch {
      return false;
    }
  },
  async clear() {
    try {
      storage()?.removeItem(TOKEN_KEY);
    } catch {
      // Nothing to remove.
    }
  },
};
