// Ported from the site (tests/ai-pricing.test.ts): the same cases against the ported module.
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
import test from "node:test";
import assert from "node:assert/strict";
import { estimateModelCostRub, parseModelPrices, resolveModelPrice } from "@/domain/ai-pricing";

test("resolveModelPrice uses the built-in table and ignores provider prefixes and case", () => {
  assert.deepEqual(resolveModelPrice("gpt-6.1-sol", {}), { input: 420, output: 2100 });
  assert.deepEqual(resolveModelPrice("openai/GPT-6-Luna", {}), { input: 30, output: 150 });
});

test("AI_MODEL_PRICES overrides the table; AI_PRICE_* covers unknown models only", () => {
  const env = {
    AI_MODEL_PRICES: "gpt-6.1-sol=400/2000; broken=abc/1, custom-model = 10 / 20",
    AI_PRICE_INPUT_RUB_PER_MTOK: "800",
    AI_PRICE_OUTPUT_RUB_PER_MTOK: "4700"
  };

  assert.deepEqual(resolveModelPrice("gpt-6.1-sol", env), { input: 400, output: 2000 });
  assert.deepEqual(resolveModelPrice("custom-model", env), { input: 10, output: 20 });
  assert.deepEqual(resolveModelPrice("gpt-6-luna", env), { input: 30, output: 150 });
  assert.deepEqual(resolveModelPrice("unknown-model", env), { input: 800, output: 4700 });
  assert.deepEqual(resolveModelPrice(null, {}), { input: 420, output: 2100 });
});

test("parseModelPrices skips malformed entries", () => {
  assert.deepEqual(parseModelPrices("a=1/2,b=,c=3/-1,=4/5"), { a: { input: 1, output: 2 } });
  assert.deepEqual(parseModelPrices(undefined), {});
});

test("estimateModelCostRub prices input and output separately", () => {
  assert.equal(estimateModelCostRub("gpt-6.1-sol", 1_000_000, 1_000_000, {}), 2520);
  assert.equal(estimateModelCostRub("gpt-6-luna", 10_000, null, {}), 0.3);
  assert.equal(estimateModelCostRub("gpt-6.1-sol", null, null, {}), null);
});
