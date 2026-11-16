/**
 * Device preferences (docs/spec/90-addendum-4.md §3.1, 01 §1.5.1, §4.9): interface language, theme mode and
 * hints — stored under the site's own names so the two clients read alike — plus the app-only switches
 * (biometric lock, local reminder categories). Per device, never sent to a server, survive logout.
 *
 * Pure: the storage is injected, so the rules below are unit-tested without React Native.
 *
 * Rules: every field is validated on every read; a missing or invalid value, or a storage failure, yields
 * the default. A failed write is swallowed — the choice still applies for this run of the app.
 */
import type { PreferencesStore } from "@/api/client";
import {
  DEFAULT_INTERFACE_PREFERENCES,
  type HintsMode,
  type InterfacePreferences,
  type Locale,
  type ThemeMode,
} from "@/api/types";
import { LOCALE_COOKIE, isLocale } from "@/lib/i18n/locale";

/** The minimal async key-value contract (AsyncStorage satisfies it as is). */
export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/** Local reminder categories the user can switch on (the app has no remote push in v1). */
export const REMINDER_CATEGORIES = ["homeworkDeadlines", "lessonStart", "parentCalls"] as const;
export type ReminderCategory = (typeof REMINDER_CATEGORIES)[number];

/** App-only device switches. */
export type DevicePreferences = {
  /** Ask for the fingerprint / face when the app opens or returns from the background. */
  biometricLock: boolean;
  /** Local reminders per category; all off until the user opts in (the OS prompt appears then). */
  reminders: Record<ReminderCategory, boolean>;
};

export type AppPreferences = InterfacePreferences & DevicePreferences;

export const DEFAULT_DEVICE_PREFERENCES: DevicePreferences = {
  biometricLock: false,
  reminders: { homeworkDeadlines: false, lessonStart: false, parentCalls: false },
};

export const DEFAULT_APP_PREFERENCES: AppPreferences = {
  ...DEFAULT_INTERFACE_PREFERENCES,
  ...DEFAULT_DEVICE_PREFERENCES,
};

/** Storage keys. The first three are the site's names (cookie `shbz-lang`, localStorage `shbz-theme` / `shbz-hints`). */
export const PREFERENCE_KEYS = {
  locale: LOCALE_COOKIE,
  themeMode: "shbz-theme",
  hints: "shbz-hints",
  device: "shbz-app-device",
} as const;

/** Any stored value other than `light` / `dark` / `system` is `system`. */
export function parseThemeMode(raw: string | null | undefined): ThemeMode {
  return raw === "light" || raw === "dark" || raw === "system" ? raw : DEFAULT_INTERFACE_PREFERENCES.themeMode;
}

/** Only the exact string `on` enables hints. */
export function parseHintsMode(raw: string | null | undefined): HintsMode {
  return raw === "on" ? "on" : "off";
}

export function parseStoredLocale(raw: string | null | undefined): Locale {
  return typeof raw === "string" && isLocale(raw) ? raw : DEFAULT_INTERFACE_PREFERENCES.locale;
}

/** Reads the JSON blob of the app-only switches; anything malformed falls back field by field. */
export function parseDevicePreferences(raw: string | null | undefined): DevicePreferences {
  const result: DevicePreferences = {
    biometricLock: DEFAULT_DEVICE_PREFERENCES.biometricLock,
    reminders: { ...DEFAULT_DEVICE_PREFERENCES.reminders },
  };
  if (!raw) return result;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return result;
  }
  if (typeof parsed !== "object" || parsed === null) return result;

  const record = parsed as Record<string, unknown>;
  if (typeof record.biometricLock === "boolean") result.biometricLock = record.biometricLock;
  const reminders = record.reminders;
  if (typeof reminders === "object" && reminders !== null) {
    for (const category of REMINDER_CATEGORIES) {
      const value = (reminders as Record<string, unknown>)[category];
      if (typeof value === "boolean") result.reminders[category] = value;
    }
  }
  return result;
}

/** `PreferencesStore` of the contract plus the app-only switches. */
export interface AppPreferencesStore extends PreferencesStore {
  /** Interface preferences and the app-only switches in one read. */
  loadAll(): Promise<AppPreferences>;
  setBiometricLock(enabled: boolean): Promise<void>;
  setReminder(category: ReminderCategory, enabled: boolean): Promise<void>;
}

export function createPreferencesStore(storage: KeyValueStorage): AppPreferencesStore {
  const read = async (key: string): Promise<string | null> => {
    try {
      return await storage.getItem(key);
    } catch {
      return null;
    }
  };
  const write = async (key: string, value: string): Promise<void> => {
    try {
      await storage.setItem(key, value);
    } catch {
      // The preference still applies in memory; it is simply not remembered.
    }
  };

  const loadInterface = async (): Promise<InterfacePreferences> => {
    const [locale, themeMode, hints] = await Promise.all([
      read(PREFERENCE_KEYS.locale),
      read(PREFERENCE_KEYS.themeMode),
      read(PREFERENCE_KEYS.hints),
    ]);
    return { locale: parseStoredLocale(locale), themeMode: parseThemeMode(themeMode), hints: parseHintsMode(hints) };
  };
  const loadDevice = async (): Promise<DevicePreferences> => parseDevicePreferences(await read(PREFERENCE_KEYS.device));

  // Device switches live in one JSON value, so two quick toggles must not overwrite each other.
  let deviceChain: Promise<void> = Promise.resolve();
  const updateDevice = (change: (current: DevicePreferences) => DevicePreferences): Promise<void> => {
    deviceChain = deviceChain.then(async () => {
      await write(PREFERENCE_KEYS.device, JSON.stringify(change(await loadDevice())));
    });
    return deviceChain;
  };

  return {
    load: loadInterface,
    async loadAll() {
      const [ui, device] = await Promise.all([loadInterface(), loadDevice()]);
      return { ...ui, ...device };
    },
    setThemeMode: (mode) => write(PREFERENCE_KEYS.themeMode, parseThemeMode(mode)),
    setHints: (hints) => write(PREFERENCE_KEYS.hints, parseHintsMode(hints)),
    async setLocale(locale) {
      if (typeof locale !== "string" || !isLocale(locale)) return { ok: false };
      await write(PREFERENCE_KEYS.locale, locale);
      return { ok: true, locale };
    },
    setBiometricLock: (enabled) => updateDevice((current) => ({ ...current, biometricLock: enabled })),
    setReminder: (category, enabled) =>
      updateDevice((current) => ({ ...current, reminders: { ...current.reminders, [category]: enabled } })),
  };
}
