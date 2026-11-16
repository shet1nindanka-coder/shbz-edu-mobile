// Ported from the site (tests/exam-scores.test.ts): the same cases against the ported module.
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
import test from "node:test";
import assert from "node:assert/strict";
import {
  EGE_PROFILE_MAX_PRIMARY,
  EGE_PROFILE_MIN_PRIMARY,
  EGE_PROFILE_SCALE,
  getOgeGrades,
  OGE_MAX_PRIMARY
} from "@/domain/exam-scores";
import { getDictionary } from "@/i18n/get-dictionary";

test("ЕГЭ профиль: шкала покрывает все первичные баллы и монотонна", () => {
  assert.equal(EGE_PROFILE_SCALE.length, EGE_PROFILE_MAX_PRIMARY);
  EGE_PROFILE_SCALE.forEach((row, index) => {
    assert.equal(row.primary, index + 1);
    if (index > 0) assert.ok(row.secondary >= EGE_PROFILE_SCALE[index - 1].secondary);
  });
  assert.equal(EGE_PROFILE_SCALE[EGE_PROFILE_MAX_PRIMARY - 1].secondary, 100);
  assert.equal(EGE_PROFILE_SCALE[EGE_PROFILE_MIN_PRIMARY - 1].secondary, 27);
});

test("разбалловка ЕГЭ профиль складывается в максимум", () => {
  // № 1–12 ×1, № 13/15/16 ×2, № 14/17 ×3, № 18/19 ×4
  assert.equal(12 * 1 + 3 * 2 + 2 * 3 + 2 * 4, EGE_PROFILE_MAX_PRIMARY);
});

test("ОГЭ: разбалловка и диапазоны оценок покрывают 0–31 без дыр", () => {
  assert.equal(19 * 1 + 6 * 2, OGE_MAX_PRIMARY);
  const bounds = getOgeGrades(getDictionary("ru").student.examInfo).map((row) => row.range.split("–").map(Number)).sort((a, b) => a[0] - b[0]);
  assert.equal(bounds[0][0], 0);
  assert.equal(bounds[bounds.length - 1][1], OGE_MAX_PRIMARY);
  bounds.slice(1).forEach((b, i) => assert.equal(b[0], bounds[i][1] + 1));
});

