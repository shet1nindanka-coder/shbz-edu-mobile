// i18n: the copied site dictionaries (the site's own tests/i18n.test.ts checks, plus structural parity),
// the mobile overlay `m` (ru/en key parity, placeholder parity, plural form counts, no Cyrillic in en),
// `getDictionary` / `getMobileDictionary`, and the `format` / `plural` helpers.
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { SERVER_ONLY_SECTIONS, getClientDictionary, getDictionary } from "@/i18n/get-dictionary";
import { MOBILE_AREAS, getMobileDictionary, type MobileDictionary } from "@/i18n/mobile";
import { calls } from "@/i18n/mobile/calls";
import { common } from "@/i18n/mobile/common";
import { content } from "@/i18n/mobile/content";
import { developer } from "@/i18n/mobile/developer";
import { groups } from "@/i18n/mobile/groups";
import { planner } from "@/i18n/mobile/planner";
import { shell } from "@/i18n/mobile/shell";
import { stats } from "@/i18n/mobile/stats";
import { student } from "@/i18n/mobile/student";
import { teacher } from "@/i18n/mobile/teacher";
import { en } from "@/lib/i18n/dictionaries/en";
import { ru } from "@/lib/i18n/dictionaries/ru";
import { format, plural } from "@/lib/i18n/format";
import { DEFAULT_LOCALE, LOCALES, intlLocaleOf, isLocale, parseLocale, type Locale } from "@/lib/i18n/locale";

type Leaf = { path: string; value: string };

function collectLeaves(node: unknown, prefix = ""): Leaf[] {
  if (typeof node === "string") {
    return [{ path: prefix, value: node }];
  }

  if (Array.isArray(node)) {
    return node.flatMap((item, index) => collectLeaves(item, `${prefix}[${index}]`));
  }

  if (node && typeof node === "object") {
    return Object.entries(node).flatMap(([key, value]) => collectLeaves(value, prefix ? `${prefix}.${key}` : key));
  }

  return [];
}

function placeholders(value: string) {
  return [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
}

/** English text with Cyrillic in it, ignoring the brand name «ШБЗ Школа» in any case form. */
function cyrillicOffenders(dictionary: unknown, allowedPaths: ReadonlySet<string> = new Set()) {
  return collectLeaves(dictionary)
    .filter((leaf) => !allowedPaths.has(leaf.path))
    .filter((leaf) => /[А-Яа-яЁё]/.test(leaf.value.replace(/ШБЗ ?Школ[а-яё]*/gi, "")))
    .map((leaf) => `${leaf.path}: ${leaf.value}`);
}

/** Placeholders must be the same set in ru and en (plural forms compared as a group). */
function placeholderMismatches(ruDictionary: unknown, enDictionary: unknown) {
  const enByPath = new Map(collectLeaves(enDictionary).map((leaf) => [leaf.path.replace(/\[\d+\]$/, "[]"), leaf.value]));
  const mismatches: string[] = [];

  for (const leaf of collectLeaves(ruDictionary)) {
    const key = leaf.path.replace(/\[\d+\]$/, "[]");
    const enValue = enByPath.get(key);

    if (enValue === undefined) {
      continue;
    }

    if (placeholders(leaf.value).join() !== placeholders(enValue).join()) {
      mismatches.push(`${leaf.path}: ru {${placeholders(leaf.value)}} / en {${placeholders(enValue)}}`);
    }
  }

  return mismatches;
}

/**
 * `*Forms` arrays: exactly 3 in ru, exactly 2 in en. `requireCount` also demands {n} in every form — the
 * rule for the mobile overlay; a few site arrays are word-only forms («номеру / номерам»), so the site's own
 * test checks only the counts.
 */
function pluralFormProblems(ruDictionary: unknown, enDictionary: unknown, requireCount = false) {
  const problems: string[] = [];

  function walk(ruNode: unknown, enNode: unknown, at: string) {
    if (!ruNode || typeof ruNode !== "object" || Array.isArray(ruNode)) {
      return;
    }

    for (const [key, value] of Object.entries(ruNode)) {
      const enValue = (enNode as Record<string, unknown> | undefined)?.[key];

      if (/Forms$/.test(key) && Array.isArray(value)) {
        if (value.length !== 3) problems.push(`${at}${key}: ru ${value.length}`);
        if (!Array.isArray(enValue) || enValue.length !== 2) {
          problems.push(`${at}${key}: en ${Array.isArray(enValue) ? enValue.length : "—"}`);
        }

        for (const form of requireCount ? [...value, ...(Array.isArray(enValue) ? enValue : [])] : []) {
          if (typeof form !== "string" || !form.includes("{n}")) problems.push(`${at}${key}: form without {n}: ${String(form)}`);
        }
      } else {
        walk(value, enValue, `${at}${key}.`);
      }
    }
  }

  walk(ruDictionary, enDictionary, "");
  return problems;
}

/**
 * Structural differences between two dictionaries: a key present on one side only, or a different kind of
 * value (string / array / object). Arrays must have equal length unless they are plural forms: a `*Forms`
 * key, or — in the site dictionaries, where one such array is named differently — the 3-vs-2 shape itself.
 */
function structureMismatches(ruNode: unknown, enNode: unknown, at = ""): string[] {
  const kind = (node: unknown) => (Array.isArray(node) ? "array" : node === null ? "null" : typeof node);

  if (kind(ruNode) !== kind(enNode)) {
    return [`${at || "<root>"}: ru ${kind(ruNode)} / en ${kind(enNode)}`];
  }

  if (Array.isArray(ruNode) && Array.isArray(enNode)) {
    if (/Forms$/.test(at) || (ruNode.length === 3 && enNode.length === 2)) {
      return [];
    }

    if (ruNode.length !== enNode.length) {
      return [`${at}: ru has ${ruNode.length} items / en has ${enNode.length}`];
    }

    return ruNode.flatMap((item, index) => structureMismatches(item, enNode[index], `${at}[${index}]`));
  }

  if (ruNode && typeof ruNode === "object" && enNode && typeof enNode === "object") {
    const ruRecord = ruNode as Record<string, unknown>;
    const enRecord = enNode as Record<string, unknown>;
    const keys = new Set([...Object.keys(ruRecord), ...Object.keys(enRecord)]);

    return [...keys].flatMap((key) => {
      const path = at ? `${at}.${key}` : key;

      if (!(key in ruRecord)) return [`${path}: missing in ru`];
      if (!(key in enRecord)) return [`${path}: missing in en`];

      return structureMismatches(ruRecord[key], enRecord[key], path);
    });
  }

  return [];
}

function emptyLeaves(dictionary: unknown) {
  return collectLeaves(dictionary)
    .filter((leaf) => leaf.value.trim() === "")
    .map((leaf) => leaf.path);
}

// ───────────────────────────── site dictionaries (copied verbatim) ─────────────────────────────

// Название языка в переключателе пишется на самом языке.
const CYRILLIC_ALLOWED_IN_EN = new Set(["interface.language.ru"]);

describe("site dictionaries", () => {
  it("английский словарь без кириллицы (кроме бренда и названия языка)", () => {
    assert.deepEqual(cyrillicOffenders(en, CYRILLIC_ALLOWED_IN_EN), []);
  });

  it("плейсхолдеры {…} совпадают в ru и en", () => {
    assert.deepEqual(placeholderMismatches(ru, en), []);
  });

  it("формы по числу: в ru три, в en две", () => {
    assert.deepEqual(pluralFormProblems(ru, en), []);
  });

  it("ru and en have the same keys and value kinds", () => {
    assert.deepEqual(structureMismatches(ru, en), []);
  });

  it("carry every section the app and the mock API read", () => {
    for (const section of [
      "apiCommon", "apiStudent", "apiContent", "apiPlanner", "audit", "notifications",
      "student", "topics", "students", "planner",
      "meta", "common", "roles", "status", "fileSize", "passwordPolicy", "progress", "nav", "login",
      "numberSearch", "shells", "settings", "interface", "studentHome", "teacherHome"
    ]) {
      assert.ok(section in ru, `ru.${section}`);
      assert.ok(section in en, `en.${section}`);
    }

    // Size guard: a truncated copy would still type-check section by section (the spec counts 1 882 leaves).
    assert.ok(collectLeaves(ru).length > 1800, `ru leaves: ${collectLeaves(ru).length}`);
    assert.ok(collectLeaves(en).length > 1800, `en leaves: ${collectLeaves(en).length}`);
  });
});

// ───────────────────────────── getDictionary ─────────────────────────────

describe("getDictionary", () => {
  it("returns the bundled dictionary of each locale, Russian by default", () => {
    assert.equal(getDictionary("ru"), ru);
    assert.equal(getDictionary("en"), en);
    assert.equal(getDictionary(), ru);
    assert.equal(getDictionary("de" as Locale), ru);
    assert.equal(getDictionary("ru").login.title, "Вход");
    assert.equal(getDictionary("en").login.title, en.login.title);
    assert.notEqual(getDictionary("en").login.title, getDictionary("ru").login.title);
  });

  it("keeps the server-only sections (the mock API renders them) and can drop them on request", () => {
    assert.deepEqual([...SERVER_ONLY_SECTIONS].sort(), ["apiCommon", "apiContent", "apiPlanner", "apiStudent", "audit", "notifications"]);

    for (const locale of LOCALES) {
      const full = getDictionary(locale);
      const client = getClientDictionary(locale) as Record<string, unknown>;

      for (const section of SERVER_ONLY_SECTIONS) {
        assert.ok(section in full, `${locale}.${section}`);
        assert.equal(section in client, false, `${locale} client has ${section}`);
      }

      assert.equal(Object.keys(client).length, Object.keys(full).length - SERVER_ONLY_SECTIONS.length);
      assert.equal(client.student, full.student);
    }
  });
});

// ───────────────────────────── locale helpers ─────────────────────────────

describe("locale helpers", () => {
  it("know the two locales and their Intl tags", () => {
    assert.deepEqual([...LOCALES], ["ru", "en"]);
    assert.equal(DEFAULT_LOCALE, "ru");
    assert.equal(intlLocaleOf("ru"), "ru-RU");
    assert.equal(intlLocaleOf("en"), "en-GB");
    assert.equal(isLocale("en"), true);
    assert.equal(isLocale("EN"), false);
    assert.equal(isLocale(null), false);
    assert.equal(parseLocale("en"), "en");
    assert.equal(parseLocale("fr"), "ru");
    assert.equal(parseLocale(undefined), "ru");
  });
});

// ───────────────────────────── format / plural ─────────────────────────────

describe("format and plural", () => {
  it("format substitutes known placeholders and keeps unknown ones", () => {
    assert.equal(format("ДЗ {n}", { n: 3 }), "ДЗ 3");
    assert.equal(format(ru.common.homeworkN, { n: 12 }), "ДЗ 12");
    assert.equal(format(en.common.homeworkN, { n: 12 }), "Homework 12");
    assert.equal(format("{a} и {b} и {a}", { a: "x", b: 0 }), "x и 0 и x");
    assert.equal(format("{known} {unknown}", { known: "ok" }), "ok {unknown}");
    assert.equal(format("без подстановок", {}), "без подстановок");
  });

  it("plural picks the Russian form: 1 / 2–4 / 5+, with the 11–14 exception", () => {
    const forms = ru.login.minuteForms;
    const expected: [number, string][] = [
      [0, "0 минут"], [1, "1 минуту"], [2, "2 минуты"], [4, "4 минуты"], [5, "5 минут"],
      [11, "11 минут"], [12, "12 минут"], [14, "14 минут"], [21, "21 минуту"], [22, "22 минуты"],
      [25, "25 минут"], [101, "101 минуту"], [111, "111 минут"], [112, "112 минут"], [1001, "1001 минуту"]
    ];

    for (const [count, text] of expected) {
      assert.equal(plural("ru", count, forms), text);
    }
  });

  it("plural picks the English form: one / other", () => {
    const forms = en.login.minuteForms;

    assert.equal(plural("en", 1, forms), "1 minute");
    assert.equal(plural("en", 0, forms), "0 minutes");
    assert.equal(plural("en", 2, forms), "2 minutes");
    assert.equal(plural("en", 21, forms), "21 minutes");
  });

  it("plural tolerates short form lists and odd counts", () => {
    assert.equal(plural("ru", 5, ["{n} фото", "{n} фото"]), "5 фото");
    assert.equal(plural("en", 3, ["{n} item"]), "3 item");
    assert.equal(plural("ru", 1, []), "");
    assert.equal(plural("ru", -1, ru.login.minuteForms), "-1 минуту");
    assert.equal(plural("ru", 2.9, ru.login.minuteForms), "2.9 минуты");
  });
});

// ───────────────────────────── mobile overlay ─────────────────────────────

const mobileAreas = { common, shell, student, teacher, planner, groups, calls, stats, content, developer };
const EXPECTED_AREAS = ["common", "shell", "student", "teacher", "planner", "groups", "calls", "stats", "content", "developer"];

describe("mobile overlay `m`", () => {
  it("has exactly the ten areas, each with ru and en", () => {
    assert.deepEqual([...MOBILE_AREAS].sort(), [...EXPECTED_AREAS].sort());
    assert.deepEqual(Object.keys(mobileAreas).sort(), [...EXPECTED_AREAS].sort());

    for (const [area, pair] of Object.entries(mobileAreas)) {
      assert.deepEqual(Object.keys(pair).sort(), ["en", "ru"], area);
      assert.ok(collectLeaves(pair.ru).length > 0, `${area}: empty area`);
    }
  });

  it("ru and en have identical keys in every area", () => {
    for (const [area, pair] of Object.entries(mobileAreas)) {
      assert.deepEqual(structureMismatches(pair.ru, pair.en), [], area);
    }
  });

  it("placeholders match between ru and en", () => {
    for (const [area, pair] of Object.entries(mobileAreas)) {
      assert.deepEqual(placeholderMismatches(pair.ru, pair.en), [], area);
    }
  });

  it("plural forms: three in ru, two in en, each with {n}", () => {
    for (const [area, pair] of Object.entries(mobileAreas)) {
      assert.deepEqual(pluralFormProblems(pair.ru, pair.en, true), [], area);
    }
  });

  it("English texts contain no Cyrillic and nothing is left empty", () => {
    for (const [area, pair] of Object.entries(mobileAreas)) {
      assert.deepEqual(cyrillicOffenders(pair.en), [], area);
      assert.deepEqual(emptyLeaves(pair.ru), [], `${area} ru`);
      assert.deepEqual(emptyLeaves(pair.en), [], `${area} en`);
    }
  });

  it("is composed per locale and falls back to Russian", () => {
    const mRu: MobileDictionary = getMobileDictionary("ru");
    const mEn: MobileDictionary = getMobileDictionary("en");

    for (const area of MOBILE_AREAS) {
      assert.equal(mRu[area], mobileAreas[area].ru, area);
      assert.equal(mEn[area], mobileAreas[area].en, area);
    }

    assert.equal(getMobileDictionary(), mRu);
    assert.equal(getMobileDictionary("de" as Locale), mRu);
    assert.equal(getMobileDictionary("ru"), mRu); // stable identity: safe as a hook dependency
  });

  it("carries the starter strings other areas rely on", () => {
    const mRu = getMobileDictionary("ru");
    const mEn = getMobileDictionary("en");

    assert.equal(mRu.common.actions.retry, "Повторить");
    assert.equal(mEn.common.actions.retry, "Retry");
    assert.equal(mEn.common.actions.cancel, "Cancel");
    assert.equal(mEn.common.actions.close, "Close");
    assert.equal(mEn.common.actions.back, "Back");
    assert.equal(mEn.common.actions.save, "Save");
    assert.equal(mEn.common.actions.delete, "Delete");
    assert.equal(mEn.common.actions.share, "Share");
    assert.equal(mEn.common.states.loading, "Loading…");
    assert.equal(mEn.common.offline.banner, "No internet connection");
    assert.equal(mEn.common.files.openInAnotherApp, "Open in another app");
    assert.equal(mEn.common.photos.takePhoto, "Take photo");
    assert.equal(mEn.common.photos.chooseFromGallery, "Choose from gallery");
    assert.equal(mRu.shell.demo.resetData, "Сбросить демо-данные");
    assert.equal(plural("ru", 3, mRu.common.errors.secondForms), "3 секунды");
    assert.equal(plural("en", 1, mEn.common.errors.minuteForms), "1 minute");
    assert.equal(format(mEn.common.files.pageOf, { page: 2, total: 9 }), "Page 2 of 9");
  });
});
