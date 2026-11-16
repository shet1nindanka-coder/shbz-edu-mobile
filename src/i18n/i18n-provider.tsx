// React binding of the dictionaries: `useI18n()` → `{ locale, dict, m, setLocale }`.
//
// The provider is controlled: whoever owns the preference (the preferences service persists the choice
// under the site's name `shbz-lang`) passes the current `locale` and receives the user's choice through
// `onChangeLocale`. Both languages are bundled, so a switch re-renders immediately with no loading state.
import { createContext, useContext, useMemo, type ReactNode } from "react";

import type { Dictionary } from "@/lib/i18n/dictionary";
import { DEFAULT_LOCALE, parseLocale, type Locale } from "@/lib/i18n/locale";

import { getDictionary } from "./get-dictionary";
import { getMobileDictionary, type MobileDictionary } from "./mobile";

export type I18nValue = {
  locale: Locale;
  /** Site dictionary (same keys as on the site, all sections). */
  dict: Dictionary;
  /** Mobile-only strings: `m.<area>.<key>`. */
  m: MobileDictionary;
  /** Asks the owner of the preference to switch the language. */
  setLocale: (locale: Locale) => void;
};

function buildValue(locale: Locale, setLocale: (locale: Locale) => void): I18nValue {
  return { locale, dict: getDictionary(locale), m: getMobileDictionary(locale), setLocale };
}

// Without a provider the app still renders in the default language (useful for isolated component tests);
// `setLocale` is then a no-op because nobody owns the preference.
const I18nContext = createContext<I18nValue>(buildValue(DEFAULT_LOCALE, () => undefined));

export type I18nProviderProps = {
  locale: Locale;
  onChangeLocale: (locale: Locale) => void;
  children: ReactNode;
};

export function I18nProvider({ locale, onChangeLocale, children }: I18nProviderProps) {
  // A corrupted stored value must not blank the UI: anything unknown renders as the default language.
  const safeLocale = parseLocale(locale);
  const value = useMemo(() => buildValue(safeLocale, onChangeLocale), [safeLocale, onChangeLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  return useContext(I18nContext);
}
