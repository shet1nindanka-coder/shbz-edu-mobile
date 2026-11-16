// Ported from the site (tests/ai-output-language.test.ts): the same cases against the ported module.
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
import assert from "node:assert/strict";
import test from "node:test";
import { aiOutputLanguageInstruction } from "@/domain/ai-output-language";

test("aiOutputLanguageInstruction: язык и поля называются явно", () => {
  const en = aiOutputLanguageInstruction("en", ["comment", "summary"]);
  assert.match(en, /English/);
  assert.match(en, /comment, summary/);
  assert.match(en, /LaTeX не переводи/);

  const ru = aiOutputLanguageInstruction("ru", ["comment"]);
  assert.match(ru, /по-русски/);
  assert.doesNotMatch(ru, /English/);
});
