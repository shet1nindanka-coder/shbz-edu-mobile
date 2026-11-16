// Mobile-only dictionary `m`: one file per area, each exporting `{ ru, en }` with identical keys
// (`en: typeof ru`). An area owns its file; this index only composes them, so adding a key never touches it.
// Adding an AREA = one import + one line in `areas`.
//
// Pure module (no React): the mock API and unit tests import it directly.
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locale";

import { calls } from "./calls";
import { common } from "./common";
import { content } from "./content";
import { developer } from "./developer";
import { groups } from "./groups";
import { planner } from "./planner";
import { shell } from "./shell";
import { stats } from "./stats";
import { student } from "./student";
import { teacher } from "./teacher";

const areas = { common, shell, student, teacher, planner, groups, calls, stats, content, developer };

type Areas = typeof areas;

export type MobileArea = keyof Areas;

/** `m.<area>.<key>` — the Russian object of every area is the structural reference. */
export type MobileDictionary = { [Area in MobileArea]: Areas[Area]["ru"] };

export const MOBILE_AREAS = Object.keys(areas) as MobileArea[];

function compose(locale: Locale): MobileDictionary {
  const entries = MOBILE_AREAS.map((area) => [area, areas[area][locale]] as const);

  return Object.fromEntries(entries) as MobileDictionary;
}

const mobileDictionaries: Record<Locale, MobileDictionary> = { ru: compose("ru"), en: compose("en") };

/** Mobile-only strings of one language; an unknown locale falls back to Russian, like `getDictionary`. */
export function getMobileDictionary(locale: Locale = DEFAULT_LOCALE): MobileDictionary {
  return mobileDictionaries[locale] ?? mobileDictionaries[DEFAULT_LOCALE];
}
