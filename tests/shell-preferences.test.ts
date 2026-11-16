// Device preferences (src/services/preferences): defaults, per-field validation on every read, the site's
// storage names, and that a broken storage never breaks the app.
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DEFAULT_INTERFACE_PREFERENCES, type Locale, type ThemeMode } from "@/api/types";
import {
  DEFAULT_APP_PREFERENCES,
  DEFAULT_DEVICE_PREFERENCES,
  PREFERENCE_KEYS,
  REMINDER_CATEGORIES,
  createPreferencesStore,
  parseDevicePreferences,
  parseHintsMode,
  parseStoredLocale,
  parseThemeMode,
  type KeyValueStorage,
} from "@/services/preferences/preferences-store";

function memoryStorage(initial: Record<string, string> = {}): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: async (key) => data.get(key) ?? null,
    setItem: async (key, value) => {
      data.set(key, value);
    },
    removeItem: async (key) => {
      data.delete(key);
    },
  };
}

const brokenStorage: KeyValueStorage = {
  getItem: async () => {
    throw new Error("storage is gone");
  },
  setItem: async () => {
    throw new Error("storage is gone");
  },
  removeItem: async () => {
    throw new Error("storage is gone");
  },
};

describe("preferences defaults (01 §4.9, 90-addendum-4 §3.1)", () => {
  it("starts with ru / system / hints off and every app switch off", async () => {
    const store = createPreferencesStore(memoryStorage());
    assert.deepEqual(await store.load(), { locale: "ru", themeMode: "system", hints: "off" });
    assert.deepEqual(await store.load(), DEFAULT_INTERFACE_PREFERENCES);
    assert.deepEqual(await store.loadAll(), DEFAULT_APP_PREFERENCES);
    assert.equal(DEFAULT_DEVICE_PREFERENCES.biometricLock, false);
    for (const category of REMINDER_CATEGORIES) assert.equal(DEFAULT_DEVICE_PREFERENCES.reminders[category], false);
  });

  it("stores under the site's names", () => {
    assert.equal(PREFERENCE_KEYS.locale, "shbz-lang");
    assert.equal(PREFERENCE_KEYS.themeMode, "shbz-theme");
    assert.equal(PREFERENCE_KEYS.hints, "shbz-hints");
  });

  it("falls back to the defaults when the storage fails, and still accepts changes", async () => {
    const store = createPreferencesStore(brokenStorage);
    assert.deepEqual(await store.loadAll(), DEFAULT_APP_PREFERENCES);
    await store.setThemeMode("dark");
    await store.setHints("on");
    await store.setBiometricLock(true);
    assert.deepEqual(await store.setLocale("en"), { ok: true, locale: "en" });
  });
});

describe("preferences validation", () => {
  it("treats any theme other than light / dark / system as system", () => {
    assert.equal(parseThemeMode("light"), "light");
    assert.equal(parseThemeMode("dark"), "dark");
    assert.equal(parseThemeMode("system"), "system");
    assert.equal(parseThemeMode("auto"), "system");
    assert.equal(parseThemeMode(""), "system");
    assert.equal(parseThemeMode(null), "system");
  });

  it("enables hints only for the exact string on", () => {
    assert.equal(parseHintsMode("on"), "on");
    assert.equal(parseHintsMode("ON"), "off");
    assert.equal(parseHintsMode("true"), "off");
    assert.equal(parseHintsMode(undefined), "off");
  });

  it("accepts only known locales", () => {
    assert.equal(parseStoredLocale("en"), "en");
    assert.equal(parseStoredLocale("ru"), "ru");
    assert.equal(parseStoredLocale("de"), "ru");
    assert.equal(parseStoredLocale(null), "ru");
  });

  it("reads the app switches field by field", () => {
    assert.deepEqual(parseDevicePreferences(null), DEFAULT_DEVICE_PREFERENCES);
    assert.deepEqual(parseDevicePreferences("not json"), DEFAULT_DEVICE_PREFERENCES);
    assert.deepEqual(parseDevicePreferences("[1,2]"), DEFAULT_DEVICE_PREFERENCES);
    assert.deepEqual(parseDevicePreferences('{"biometricLock":"yes","reminders":{"lessonStart":true,"homeworkDeadlines":1,"other":true}}'), {
      biometricLock: false,
      reminders: { homeworkDeadlines: false, lessonStart: true, parentCalls: false },
    });
    // A parsed result never aliases the defaults.
    const parsed = parseDevicePreferences(null);
    parsed.reminders.lessonStart = true;
    assert.equal(DEFAULT_DEVICE_PREFERENCES.reminders.lessonStart, false);
  });

  it("validates stored values on every read", async () => {
    const storage = memoryStorage({ "shbz-lang": "fr", "shbz-theme": "sepia", "shbz-hints": "yes", "shbz-app-device": "{" });
    assert.deepEqual(await createPreferencesStore(storage).loadAll(), DEFAULT_APP_PREFERENCES);
  });
});

describe("preferences store", () => {
  it("persists each interface preference under its own key", async () => {
    const storage = memoryStorage();
    const store = createPreferencesStore(storage);
    await store.setThemeMode("dark");
    await store.setHints("on");
    assert.deepEqual(await store.setLocale("en"), { ok: true, locale: "en" });
    assert.equal(storage.data.get("shbz-theme"), "dark");
    assert.equal(storage.data.get("shbz-hints"), "on");
    assert.equal(storage.data.get("shbz-lang"), "en");
    assert.deepEqual(await createPreferencesStore(storage).load(), { locale: "en", themeMode: "dark", hints: "on" });
  });

  it("refuses an unknown locale and stores nothing", async () => {
    const storage = memoryStorage({ "shbz-lang": "en" });
    const store = createPreferencesStore(storage);
    assert.deepEqual(await store.setLocale("de" as Locale), { ok: false });
    assert.equal(storage.data.get("shbz-lang"), "en");
  });

  it("never writes an invalid theme", async () => {
    const storage = memoryStorage();
    await createPreferencesStore(storage).setThemeMode("neon" as ThemeMode);
    assert.equal(storage.data.get("shbz-theme"), "system");
  });

  it("keeps the app switches independent, even when toggled together", async () => {
    const storage = memoryStorage();
    const store = createPreferencesStore(storage);
    await Promise.all([store.setBiometricLock(true), store.setReminder("lessonStart", true), store.setReminder("parentCalls", true)]);
    await store.setReminder("parentCalls", false);
    const all = await store.loadAll();
    assert.equal(all.biometricLock, true);
    assert.deepEqual(all.reminders, { homeworkDeadlines: false, lessonStart: true, parentCalls: false });
    // Interface preferences are untouched by app switches.
    assert.deepEqual(await store.load(), DEFAULT_INTERFACE_PREFERENCES);
  });
});
