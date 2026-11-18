import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import type { HintsMode, Locale, ThemeMode } from '@/api/types';
import { isLocale } from '@/lib/i18n/locale';
import {
  DEFAULT_APP_PREFERENCES,
  noteInterfaceSnapshot,
  type AppPreferences,
  type AppPreferencesStore,
  type ReminderCategory,
} from '@/services/preferences';

import { getQueryClient } from './query';
import { setRequestLocale } from './services';

export type PreferencesValue = {
  preferences: AppPreferences;
  /** False until the stored values have been read (the splash screen stays up meanwhile). */
  loaded: boolean;
  /** Locale being applied (the switch is disabled while it is set), else null. */
  localePending: Locale | null;
  setThemeMode: (mode: ThemeMode) => void;
  setHints: (hints: HintsMode) => void;
  /** No-op for the current locale or while a change is pending; an unknown value changes nothing. */
  setLocale: (locale: Locale) => void;
  setBiometricLock: (enabled: boolean) => void;
  setReminder: (category: ReminderCategory, enabled: boolean) => void;
};

const noop = () => undefined;

const PreferencesContext = createContext<PreferencesValue>({
  preferences: DEFAULT_APP_PREFERENCES,
  loaded: false,
  localePending: null,
  setThemeMode: noop,
  setHints: noop,
  setLocale: noop,
  setBiometricLock: noop,
  setReminder: noop,
});

export type PreferencesProviderProps = { store: AppPreferencesStore; children: ReactNode };

/**
 * Owns the device preferences (docs/spec/90-addendum-4.md §3.1): reads them once, applies every change
 * immediately in memory and persists it in the background. Language, theme and hints are per device and
 * survive logout.
 */
export function PreferencesProvider({ store, children }: PreferencesProviderProps) {
  const [preferences, setPreferences] = useState<AppPreferences>(DEFAULT_APP_PREFERENCES);
  const [loaded, setLoaded] = useState(false);
  const [localePending, setLocalePending] = useState<Locale | null>(null);
  const pendingRef = useRef<Locale | null>(null);
  const localeRef = useRef<Locale>(DEFAULT_APP_PREFERENCES.locale);

  useEffect(() => {
    let active = true;
    void store.loadAll().then((stored) => {
      if (!active) return;
      localeRef.current = stored.locale;
      setRequestLocale(stored.locale);
      // The root error shell renders without this provider: it reads the language and theme from here.
      noteInterfaceSnapshot({ locale: stored.locale, themeMode: stored.themeMode });
      setPreferences(stored);
      setLoaded(true);
    });
    return () => {
      active = false;
    };
  }, [store]);

  const setThemeMode = useCallback(
    (themeMode: ThemeMode) => {
      setPreferences((current) => ({ ...current, themeMode }));
      noteInterfaceSnapshot({ themeMode });
      void store.setThemeMode(themeMode);
    },
    [store],
  );

  const setHints = useCallback(
    (hints: HintsMode) => {
      setPreferences((current) => ({ ...current, hints }));
      void store.setHints(hints);
    },
    [store],
  );

  const setLocale = useCallback(
    (locale: Locale) => {
      // Site rule (LocaleSwitch): the current locale, or a change already in flight, does nothing.
      if (!isLocale(locale) || locale === localeRef.current || pendingRef.current !== null) return;
      pendingRef.current = locale;
      setLocalePending(locale);
      void store
        .setLocale(locale)
        .then((result) => {
          if (!result.ok) return;
          localeRef.current = result.locale;
          noteInterfaceSnapshot({ locale: result.locale });
          // Requests made from now on are answered in the new language.
          setRequestLocale(result.locale);
          // Cached responses carry texts the server wrote in the old language (journal summaries,
          // notifications, plan errors) and query keys hold no locale: refetch them, as the site's
          // LocaleSwitch reloads the page. Mounted screens refetch now, the rest when they open.
          void getQueryClient().invalidateQueries();
          setPreferences((current) => ({ ...current, locale: result.locale }));
        })
        .finally(() => {
          pendingRef.current = null;
          setLocalePending(null);
        });
    },
    [store],
  );

  const setBiometricLock = useCallback(
    (biometricLock: boolean) => {
      setPreferences((current) => ({ ...current, biometricLock }));
      void store.setBiometricLock(biometricLock);
    },
    [store],
  );

  const setReminder = useCallback(
    (category: ReminderCategory, enabled: boolean) => {
      setPreferences((current) => ({ ...current, reminders: { ...current.reminders, [category]: enabled } }));
      void store.setReminder(category, enabled);
    },
    [store],
  );

  const value = useMemo<PreferencesValue>(
    () => ({ preferences, loaded, localePending, setThemeMode, setHints, setLocale, setBiometricLock, setReminder }),
    [preferences, loaded, localePending, setThemeMode, setHints, setLocale, setBiometricLock, setReminder],
  );

  return <PreferencesContext value={value}>{children}</PreferencesContext>;
}

/** Device preferences and their setters. */
export function usePreferences(): PreferencesValue {
  return use(PreferencesContext);
}

/** True when hint texts should be rendered (`hints === "on"`; default off). */
export function useHintsEnabled(): boolean {
  return use(PreferencesContext).preferences.hints === 'on';
}

/**
 * Renders its children only when hints are switched on — the app-wide equivalent of the site's `.ui-hint`
 * class (docs/spec/01-shell-auth.md §1.5.1). Wrap every explanatory line in it.
 */
export function Hint({ children }: { children: ReactNode }) {
  return useHintsEnabled() ? <>{children}</> : null;
}
