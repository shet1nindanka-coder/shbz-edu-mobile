// The provider-free copy of the language and theme the root error shell reads (#410): ru / system until the
// preferences load (the app never follows the device language), then the user's choice.
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getInterfaceSnapshot, noteInterfaceSnapshot } from "@/services/preferences/interface-snapshot";

describe("interface snapshot", () => {
  it("starts at ru / system and follows partial changes", () => {
    assert.deepEqual(getInterfaceSnapshot(), { locale: "ru", themeMode: "system" });
    noteInterfaceSnapshot({ locale: "en", themeMode: "dark" });
    assert.deepEqual(getInterfaceSnapshot(), { locale: "en", themeMode: "dark" });
    noteInterfaceSnapshot({ themeMode: "light" });
    assert.deepEqual(getInterfaceSnapshot(), { locale: "en", themeMode: "light" });
  });
});
