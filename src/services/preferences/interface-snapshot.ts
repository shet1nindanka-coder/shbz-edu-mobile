import { DEFAULT_INTERFACE_PREFERENCES, type Locale, type ThemeMode } from "@/api/types";

/**
 * The language and theme mode the app is showing, readable without any provider. The root error shell
 * renders in place of the whole provider tree — possibly because a provider threw — so it cannot read the
 * preferences context; it reads this module-level copy instead. The preferences provider updates it
 * whenever the stored values load and on every change. Until then it holds the defaults (ru, system): the
 * app never follows the device language.
 */
export type InterfaceSnapshot = { locale: Locale; themeMode: ThemeMode };

let snapshot: InterfaceSnapshot = {
  locale: DEFAULT_INTERFACE_PREFERENCES.locale,
  themeMode: DEFAULT_INTERFACE_PREFERENCES.themeMode,
};

export function getInterfaceSnapshot(): InterfaceSnapshot {
  return snapshot;
}

export function noteInterfaceSnapshot(change: Partial<InterfaceSnapshot>): void {
  snapshot = { ...snapshot, ...change };
}
