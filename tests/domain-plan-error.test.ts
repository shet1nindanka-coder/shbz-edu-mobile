// Ported from the site (tests/plan-error.test.ts): the same cases against the ported module.
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
import assert from "node:assert/strict";
import test from "node:test";
import { getDictionary } from "@/i18n/get-dictionary";
import { planErrorText, planErrorValue } from "@/domain/plan-error";

const en = getDictionary("en").planner.planErrors;
const ru = getDictionary("ru").planner.planErrors;

test("planErrorText: код переводится на язык интерфейса", () => {
  assert.equal(planErrorText(planErrorValue("noCandidates"), en), en.noCandidates);
  assert.equal(planErrorText(planErrorValue("failed"), ru), ru.failed);
});

test("planErrorText: старые русские строки узнаются по точному совпадению", () => {
  assert.equal(planErrorText("Ученик не найден или удалён.", en), en.studentMissing);
  assert.equal(
    planErrorText("Подбор не удался: модель не ответила. Нажмите «Повторить» или добавьте номера вручную.", en),
    en.failed
  );
});

test("planErrorText: неизвестная строка и неизвестный код остаются как есть", () => {
  assert.equal(planErrorText("Что-то своё", en), "Что-то своё");
  assert.equal(planErrorText("plan-error:unknown", en), "plan-error:unknown");
});
