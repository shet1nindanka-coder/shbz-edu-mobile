/**
 * The part of the mock context every rule module is built on: the store, the clock, the request language
 * and the error factory. `MockContext` (../context.ts) extends it with the rules themselves.
 */
import type { IsoDateTime, Locale } from "@/api/types";
import { getDictionary } from "@/i18n/get-dictionary";
import { getMobileDictionary, type MobileDictionary } from "@/i18n/mobile";
import type { Dictionary } from "@/lib/i18n/dictionary";

import type { MockClock } from "../clock";
import type { MockStore } from "../store/store";
import { createErrors, type MockErrors } from "./errors";

export interface MockCore {
  /** The shared store (tables, settings, controls). */
  readonly store: MockStore;
  /** The single source of time. */
  readonly clock: MockClock;
  /** "Now" as epoch milliseconds — `clock.now()`. Never call `Date.now()` in mock code. */
  now(): number;
  /** "Now" as an `IsoDateTime` (what goes into rows and into `serverNow`). */
  nowIso(): IsoDateTime;
  /** "Now" as a `Date` (what the ported domain helpers take). */
  nowDate(): Date;
  /** Language of the current request (`Accept-Language`): decides error texts, notification texts, AI comments. */
  locale(): Locale;
  /** The site dictionary of the request language — same keys as on the site. */
  dict(): Dictionary;
  /** The mobile-only dictionary of the request language. */
  m(): MobileDictionary;
  /** Builds / throws `ApiError`s with localised messages. */
  readonly errors: MockErrors;
}

export function createCore(store: MockStore, clock: MockClock, getLocale: () => Locale): MockCore {
  const locale = (): Locale => (getLocale() === "en" ? "en" : "ru");
  return {
    store,
    clock,
    now: () => clock.now(),
    nowIso: () => new Date(clock.now()).toISOString(),
    nowDate: () => new Date(clock.now()),
    locale,
    dict: () => getDictionary(locale()),
    m: () => getMobileDictionary(locale()),
    errors: createErrors(locale),
  };
}
