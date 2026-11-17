// Where the opaque session token lives on the device: the Keychain / Keystore through expo-secure-store.
// The token never touches AsyncStorage, logs or the query cache (only the signed-out marker does, which is a
// fingerprint — see token-storage.shared.ts). Metro picks `token-storage.web.ts` on web.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

import { createTokenStorage } from './token-storage.shared';
import type { TokenStorage } from './token-storage.types';

// SecureStore keys may only contain alphanumerics, ".", "-" and "_".
const TOKEN_KEY = 'shbz.session.token';
const SIGNED_OUT_KEY = 'shbz-signed-out-token';
const OPTIONS: SecureStore.SecureStoreOptions = {
  // Readable after the first unlock, so a reminder tap or a background refresh can still restore the session.
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

export const tokenStorage: TokenStorage = createTokenStorage(
  {
    get: () => SecureStore.getItemAsync(TOKEN_KEY, OPTIONS),
    set: (value) => SecureStore.setItemAsync(TOKEN_KEY, value, OPTIONS),
    remove: () => SecureStore.deleteItemAsync(TOKEN_KEY, OPTIONS),
  },
  {
    get: () => AsyncStorage.getItem(SIGNED_OUT_KEY),
    set: (value) => AsyncStorage.setItem(SIGNED_OUT_KEY, value),
    remove: () => AsyncStorage.removeItem(SIGNED_OUT_KEY),
  },
);
