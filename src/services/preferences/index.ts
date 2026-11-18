// Device preferences: `createPreferencesStore(AsyncStorage)` implements the contract's `PreferencesStore`
// and adds the app-only switches. The React binding (`usePreferences`) lives in `@/providers`.
export {
  DEFAULT_APP_PREFERENCES,
  DEFAULT_DEVICE_PREFERENCES,
  PREFERENCE_KEYS,
  REMINDER_CATEGORIES,
  createPreferencesStore,
  parseDevicePreferences,
  parseHintsMode,
  parseStoredLocale,
  parseThemeMode,
  type AppPreferences,
  type AppPreferencesStore,
  type DevicePreferences,
  type KeyValueStorage,
  type ReminderCategory,
} from "./preferences-store";
export { getInterfaceSnapshot, noteInterfaceSnapshot, type InterfaceSnapshot } from "./interface-snapshot";
