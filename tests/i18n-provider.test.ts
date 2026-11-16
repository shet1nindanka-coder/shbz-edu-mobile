// `I18nProvider` / `useI18n()`: rendered to static markup with react-dom (no React Native involved), to
// prove the hook hands out `{ locale, dict, m, setLocale }` for the locale the owner passes in.
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement, type ReactElement } from "react";

import { I18nProvider, useI18n, type I18nProviderProps, type I18nValue } from "@/i18n/i18n-provider";
import { getDictionary } from "@/i18n/get-dictionary";
import { getMobileDictionary } from "@/i18n/mobile";
import type { Locale } from "@/lib/i18n/locale";

// `react-dom` ships no type declarations in this project; only this one function is needed.
declare const require: (id: string) => unknown;
const { renderToStaticMarkup } = require("react-dom/server") as {
  renderToStaticMarkup: (element: ReactElement) => string;
};

/** Renders a probe inside (or outside) the provider and returns what `useI18n()` gave it. */
function capture(wrap: (probe: ReactElement) => ReactElement): { value: I18nValue; markup: string } {
  let seen: I18nValue | null = null;

  function Probe() {
    const value = useI18n();

    seen = value;

    return createElement("span", null, `${value.dict.login.submit}|${value.m.common.actions.retry}`);
  }

  const markup = renderToStaticMarkup(wrap(createElement(Probe)));

  assert.ok(seen, "the probe did not render");

  return { value: seen as I18nValue, markup };
}

function withProvider(locale: Locale, onChangeLocale: (next: Locale) => void = () => undefined) {
  return function wrapInProvider(probe: ReactElement) {
    // `children` is passed as the third argument (the JSX way); the props type still lists it as required.
    const props = { locale, onChangeLocale } as I18nProviderProps;

    return createElement(I18nProvider, props, probe);
  };
}

describe("I18nProvider / useI18n", () => {
  it("serves the Russian dictionaries for ru", () => {
    const { value, markup } = capture(withProvider("ru"));

    assert.equal(value.locale, "ru");
    assert.equal(value.dict, getDictionary("ru"));
    assert.equal(value.m, getMobileDictionary("ru"));
    assert.equal(markup, "<span>Войти|Повторить</span>");
  });

  it("serves the English dictionaries for en", () => {
    const { value, markup } = capture(withProvider("en"));

    assert.equal(value.locale, "en");
    assert.equal(value.dict, getDictionary("en"));
    assert.equal(value.m, getMobileDictionary("en"));
    assert.equal(markup, `<span>${getDictionary("en").login.submit}|Retry</span>`);
  });

  it("setLocale hands the choice to the owner of the preference", () => {
    const requested: Locale[] = [];
    const { value } = capture(withProvider("ru", (next) => requested.push(next)));

    value.setLocale("en");
    value.setLocale("ru");

    assert.deepEqual(requested, ["en", "ru"]);
    // The provider is controlled: nothing changes until the owner passes the new locale back in.
    assert.equal(value.locale, "ru");
  });

  it("renders the default language for a corrupted locale value", () => {
    const { value } = capture(withProvider("xx" as Locale));

    assert.equal(value.locale, "ru");
    assert.equal(value.dict, getDictionary("ru"));
  });

  it("works without a provider: default language, setLocale is a no-op", () => {
    const { value, markup } = capture((probe) => probe);

    assert.equal(value.locale, "ru");
    assert.equal(markup, "<span>Войти|Повторить</span>");
    assert.doesNotThrow(() => value.setLocale("en"));
  });

  it("exposes the same API through the public entry", async () => {
    const entry = await import("@/i18n");

    assert.equal(entry.useI18n, useI18n);
    assert.equal(entry.I18nProvider, I18nProvider);
    assert.equal(entry.getDictionary, getDictionary);
    assert.equal(entry.getMobileDictionary, getMobileDictionary);
    assert.equal(entry.format("{a}", { a: 1 }), "1");
    assert.equal(entry.plural("en", 2, ["{n} day", "{n} days"]), "2 days");
    assert.equal(entry.intlLocaleOf("en"), "en-GB");
    assert.equal(entry.DEFAULT_LOCALE, "ru");
    assert.deepEqual([...entry.LOCALES], ["ru", "en"]);
    assert.equal(entry.LOCALE_STORAGE_KEY, "shbz-lang");
    assert.equal(entry.isLocale("en"), true);
    assert.equal(entry.parseLocale("zz"), "ru");
  });
});
