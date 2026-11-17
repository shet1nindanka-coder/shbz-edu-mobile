/**
 * Composition root, non-React half: the one place that knows which `ApiClient` implementation the app
 * runs on. Everything else receives `AppServices` through providers and hooks.
 *
 * Today: `MockApiClient` persisted in AsyncStorage, the mock `FileService`, and the device preferences.
 * Later: swap `createMockApiClient` for `createHttpApiClient` here — screens do not change.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { AppServices } from '@/api/client';
import { DEFAULT_LOCALE, type Locale } from '@/lib/i18n/locale';
import { createMockApiClient, type MockApiClient } from '@/mock';
import { createMockFileService, forgetLocalFile, importLocalFile, materialiseMockSample, readLocalFileBytes } from '@/services/files';
import { isOnline } from '@/services/network';
import { createPreferencesStore, type AppPreferencesStore, type KeyValueStorage } from '@/services/preferences';
import { createSessionCache, guardApiClient, type SessionCache, type SessionErrorHandlers } from '@/services/session';

/** Language sent with every request (`Accept-Language`); the preferences provider keeps it current. */
let requestLocale: Locale = DEFAULT_LOCALE;

export function setRequestLocale(locale: Locale): void {
  requestLocale = locale;
}

export function getRequestLocale(): Locale {
  return requestLocale;
}

/**
 * Who reacts to `sessionExpired` and to role refusals. The API client is created before React renders,
 * so the session provider registers itself here once it is mounted.
 */
let sessionErrorHandlers: SessionErrorHandlers | null = null;

export function setSessionErrorHandlers(handlers: SessionErrorHandlers | null): void {
  sessionErrorHandlers = handlers;
}

export type AppRuntime = AppServices & {
  preferences: AppPreferencesStore;
  /** Device key-value storage (non-secret): query cache, pending writes, cached user. */
  storage: KeyValueStorage;
  sessionCache: SessionCache;
  /** Installs the bearer token used by every following call; null = signed out. */
  setSessionToken(token: string | null): void;
  /** The mock backend with its controls — present only in mock builds (the "Demo data" screen). */
  mock: MockApiClient | null;
};

let runtime: AppRuntime | null = null;

/** The app's services, created on first use and shared for the lifetime of the JS runtime. */
export function getAppRuntime(): AppRuntime {
  if (runtime) return runtime;

  const storage: KeyValueStorage = AsyncStorage;
  const mock = createMockApiClient({
    storage,
    getLocale: getRequestLocale,
    isOnline,
    // A generated document (report, attendance sheet) becomes a real file in the app cache.
    materializeDocument: (request) =>
      materialiseMockSample(request.sample, { id: `generated-${request.kind}-${request.fileName}`, originalName: request.fileName, mimeType: request.mimeType }),
    // A picked photo / topic file is kept on the device under the id of its new row, so viewers show it.
    onFileUploaded: (file) => {
      void importLocalFile(file.id, { uri: file.uri, mimeType: file.mimeType, originalName: file.originalName, size: file.size }).catch(
        () => undefined,
      );
    },
    onFileRemoved: (fileId) => forgetLocalFile(fileId),
    // The content of a picked file (file:// / content:// on a phone, blob: on web), so the mock refuses a
    // mislabelled upload like the site's `validateUploadedBytes`.
    readUploadBytes: readLocalFileBytes,
  });

  runtime = {
    // Every call is observed for the two session-level errors (90-addendum-1 A.3 rules 1 – 2).
    api: guardApiClient(mock, {
      onSessionExpired: (error) => sessionErrorHandlers?.onSessionExpired(error),
      onRoleRefused: (error) => sessionErrorHandlers?.onRoleRefused?.(error),
    }),
    files: createMockFileService({ lookup: (fileId) => mock.backend.files.lookup(fileId), locale: getRequestLocale }),
    preferences: createPreferencesStore(storage),
    storage,
    sessionCache: createSessionCache(storage),
    setSessionToken: (token) => mock.setSessionToken(token),
    mock,
  };
  return runtime;
}
