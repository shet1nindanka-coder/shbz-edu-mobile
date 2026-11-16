// Ported from the site (lib/ai-pricing.ts). [MOBILE] There is no `process.env` in the app: without an
// explicit `env` argument the built-in price table (and the default price) applies.
/*
 * Цены моделей в рублях за миллион токенов — по ним журнал считает costRub
 * в момент записи. Основная модель и модель разметки стоят по-разному (у
 * gpt-6-luna вывод в 14 раз дешевле gpt-6.1-sol), поэтому цена ищется по
 * имени модели, а не одна на всё.
 *
 * Порядок: AI_MODEL_PRICES из env → встроенная таблица → AI_PRICE_*_RUB_PER_MTOK
 * (для моделей, которых нет в таблице) → дефолт.
 */

export type ModelPrice = { input: number; output: number };

type PriceEnv = Partial<Record<string, string | undefined>>;

// Тарифы ProxyAPI с НДС, октябрь 2026. Устарели — переопредели через AI_MODEL_PRICES.
const KNOWN_MODEL_PRICES: Record<string, ModelPrice> = {
  "gpt-6.1-sol": { input: 420, output: 2100 },
  "gpt-6-sol": { input: 420, output: 2100 },
  "gpt-6-luna": { input: 30, output: 150 },
  "gpt-6-astra": { input: 1580, output: 7900 },
  "gpt-5.6-sol": { input: 800, output: 4700 },
  "gpt-5.6-terra": { input: 400, output: 2560 }
};

const DEFAULT_PRICE: ModelPrice = { input: 420, output: 2100 };

export function normalizeModelName(model: string) {
  // "openai/gpt-6.1-sol" → "gpt-6.1-sol".
  return model.trim().toLowerCase().split("/").pop() ?? "";
}

function toPrice(raw: unknown) {
  if (typeof raw === "string" && raw.trim() === "") {
    return null;
  }

  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

/** Разбирает "gpt-6.1-sol=420/2100, gpt-6-luna=30/150"; кривые записи пропускаются. */
export function parseModelPrices(raw: string | undefined): Record<string, ModelPrice> {
  const result: Record<string, ModelPrice> = {};

  for (const entry of (raw ?? "").split(/[,;]/)) {
    const match = /^\s*([^=\s]+)\s*=\s*([^/\s]+)\s*\/\s*([^/\s]+)\s*$/.exec(entry);

    if (!match) {
      continue;
    }

    const input = toPrice(match[2]);
    const output = toPrice(match[3]);

    if (input !== null && output !== null) {
      result[normalizeModelName(match[1])] = { input, output };
    }
  }

  return result;
}

export function resolveModelPrice(model: string | null | undefined, env: PriceEnv = {}): ModelPrice {
  const name = model ? normalizeModelName(model) : "";
  const overrides = parseModelPrices(env.AI_MODEL_PRICES);

  if (name && overrides[name]) {
    return overrides[name];
  }

  if (name && KNOWN_MODEL_PRICES[name]) {
    return KNOWN_MODEL_PRICES[name];
  }

  return {
    input: toPrice(env.AI_PRICE_INPUT_RUB_PER_MTOK) ?? DEFAULT_PRICE.input,
    output: toPrice(env.AI_PRICE_OUTPUT_RUB_PER_MTOK) ?? DEFAULT_PRICE.output
  };
}

/** Стоимость вызова в рублях (число). null, если токены неизвестны. */
export function estimateModelCostRub(
  model: string | null | undefined,
  inputTokens: number | null,
  outputTokens: number | null,
  env: PriceEnv = {}
) {
  if (inputTokens === null && outputTokens === null) {
    return null;
  }

  const price = resolveModelPrice(model, env);
  return ((inputTokens ?? 0) * price.input + (outputTokens ?? 0) * price.output) / 1_000_000;
}
