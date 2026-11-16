// The app's replacement for the site's `lib/i18n/get-dictionary.ts`. Both locales are bundled statically
// (no lazy loading → instant language switch, works offline) and — unlike the site's browser bundle — ALL
// sections are kept, including the six "server-only" ones (`apiCommon`, `apiStudent`, `apiContent`,
// `apiPlanner`, `audit`, `notifications`): the in-app mock API renders the same error texts, notifications
// and journal rows as the server (docs/spec/09-data-i18n-math.md §3.2).
//
// Pure module (no React / React Native): `src/domain`, `src/mock` and unit tests import it directly.
import { en } from "@/lib/i18n/dictionaries/en";
import { ru } from "@/lib/i18n/dictionaries/ru";
import type { ClientDictionary, Dictionary, ServerOnlySection } from "@/lib/i18n/dictionary";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locale";

const dictionaries: Record<Locale, Dictionary> = { ru, en };

/** The full site dictionary of one language; an unknown locale falls back to Russian, like the site. */
export function getDictionary(locale: Locale = DEFAULT_LOCALE): Dictionary {
  return dictionaries[locale] ?? dictionaries[DEFAULT_LOCALE];
}

export const SERVER_ONLY_SECTIONS: readonly ServerOnlySection[] = [
  "apiCommon",
  "apiStudent",
  "apiContent",
  "apiPlanner",
  "audit",
  "notifications"
];

/**
 * The dictionary without the server-only sections — what a browser of the site receives. The app does not
 * need it at runtime (screens get the full dictionary); it exists so tests and a future `HttpApiClient`
 * build can reason about the client subset with the site's own type.
 */
export function getClientDictionary(locale: Locale = DEFAULT_LOCALE): ClientDictionary {
  const serverOnly: readonly string[] = SERVER_ONLY_SECTIONS;
  const entries = Object.entries(getDictionary(locale)).filter(([key]) => !serverOnly.includes(key));

  return Object.fromEntries(entries) as ClientDictionary;
}
