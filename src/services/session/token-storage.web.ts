// Web fallback of the token storage: the browser has no secure enclave, so the token is kept in
// `localStorage` (the web export exists for verification, not as a product surface). The rules (removal
// fallbacks, the signed-out marker) are the native ones: token-storage.shared.ts.
import { createTokenStorage, type StoredValue } from './token-storage.shared';
import type { TokenStorage } from './token-storage.types';

const TOKEN_KEY = 'shbz.session.token';
const SIGNED_OUT_KEY = 'shbz-signed-out-token';

function storage(): Storage {
  // Storage can be blocked (private mode, embedded frames): the access throws, and the shared rules treat a
  // throw as a failed operation.
  if (typeof window === 'undefined') throw new Error('No window.');
  return window.localStorage;
}

function localValue(key: string): StoredValue {
  return {
    get: async () => storage().getItem(key),
    set: async (value) => storage().setItem(key, value),
    remove: async () => storage().removeItem(key),
  };
}

export const tokenStorage: TokenStorage = createTokenStorage(localValue(TOKEN_KEY), localValue(SIGNED_OUT_KEY));
