// Where the opaque session token lives on the device: the Keychain / Keystore through expo-secure-store.
// The token never touches AsyncStorage, logs or the query cache. Metro picks `token-storage.web.ts` on web.
import * as SecureStore from 'expo-secure-store';

import type { TokenStorage } from './token-storage.types';

// SecureStore keys may only contain alphanumerics, ".", "-" and "_".
const TOKEN_KEY = 'shbz.session.token';
const OPTIONS: SecureStore.SecureStoreOptions = {
  // Readable after the first unlock, so a reminder tap or a background refresh can still restore the session.
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

export const tokenStorage: TokenStorage = {
  async read() {
    try {
      const token = await SecureStore.getItemAsync(TOKEN_KEY, OPTIONS);
      return token ? token : null;
    } catch {
      // A wiped keystore (restored backup, changed lock screen) reads as "signed out".
      return null;
    }
  },
  async write(token) {
    try {
      await SecureStore.setItemAsync(TOKEN_KEY, token, OPTIONS);
      return true;
    } catch {
      return false;
    }
  },
  async clear() {
    try {
      await SecureStore.deleteItemAsync(TOKEN_KEY, OPTIONS);
    } catch {
      // Nothing to remove.
    }
  },
};
