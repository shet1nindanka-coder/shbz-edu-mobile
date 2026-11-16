// Problem numbers are STRINGS: leading zeros are significant («010203»), so numbers are compared and
// de-duplicated by their normalised form and stored as typed.
// Ported 1:1 from the site (lib/utils.ts).

/** `MAX_NUMBERS` of `parseNumbersInput` (exported for forms and the mock validators). */
export const MAX_NUMBERS_PER_INPUT = 2000;

/**
 * Нормализованный вид номера: без ведущих нулей («010203» → «10203», «000» → «0»).
 * По нему номера сравниваются и дедуплицируются; записанный вид хранится как набран.
 */
export function normalizeHomeworkNumber(value: string) {
  return value.trim().replace(/^0+(?=.)/, "");
}

/**
 * Численное сравнение номеров-строк: «2» < «10», ведущие нули не влияют.
 * Без Number(): сравнение по длине нормализованного вида и лексикографике
 * корректно для цифровых строк любой длины.
 */
export function compareHomeworkNumbers(left: string, right: string) {
  const a = normalizeHomeworkNumber(left);
  const b = normalizeHomeworkNumber(right);

  if (a.length !== b.length) {
    return a.length - b.length;
  }

  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Близнецы: номер из нового списка совпадает с уже сохранённым с точностью до
 * ведущих нулей, но записан иначе («010203» при существующем «10203»). Формально
 * для @@unique это разные строки, по смыслу — один номер; сохранение отклоняется.
 */
export function findHomeworkNumberTwins(existingNumbers: string[], nextNumbers: string[]) {
  const byNormalized = new Map<string, string>();

  for (const existing of existingNumbers) {
    byNormalized.set(normalizeHomeworkNumber(existing), existing);
  }

  const twins: { existing: string; typed: string }[] = [];

  for (const typed of nextNumbers) {
    const existing = byNormalized.get(normalizeHomeworkNumber(typed));

    if (existing !== undefined && existing !== typed) {
      twins.push({ existing, typed });
    }
  }

  return twins;
}

export function parseNumbersInput(input: string) {
  const normalizedInput = input.replace(/[‐‑‒–—―−﹘﹣－]/g, "-");
  const matches = Array.from(
    normalizedInput.matchAll(/(^|[\s,;]+)(\d+\s*-\s*\d+|\d+)(?=$|[\s,;]+)/g),
    (match) => match[2] ?? ""
  );

  if (!matches.length) {
    return [];
  }

  // Ограничение размера защищает от опечаток вроде «1-100000000», которые иначе
  // синхронно развернут гигантский Set и попытаются вставить миллионы строк,
  // заблокировав единственный инстанс.
  const MAX_NUMBERS = MAX_NUMBERS_PER_INPUT;
  // Ключ — нормализованный вид, значение — как набрано: «01, 1» — один номер,
  // выигрывает первый набранный вариант.
  const numbers = new Map<string, string>();

  const addNumber = (recorded: string) => {
    const normalized = normalizeHomeworkNumber(recorded);

    if (normalized === "0" || numbers.has(normalized)) {
      return;
    }

    numbers.set(normalized, recorded);
  };

  for (const match of matches) {
    if (numbers.size >= MAX_NUMBERS) {
      break;
    }

    if (match.includes("-")) {
      const [rawStart = "", rawEnd = ""] = match.split("-").map((value) => value.trim());

      // Границы длиннее 15 цифр не влезают в точные целые — почти наверняка опечатка.
      if (!rawStart || !rawEnd || rawStart.length > 15 || rawEnd.length > 15) {
        continue;
      }

      const startValue = Number(rawStart);
      const endValue = Number(rawEnd);

      if (startValue <= 0 || endValue <= 0) {
        continue;
      }

      const start = Math.min(startValue, endValue);
      const end = Math.max(startValue, endValue);

      // Гигантский диапазон — почти наверняка опечатка: пропускаем его целиком.
      if (end - start >= MAX_NUMBERS) {
        continue;
      }

      // Ширина берётся у границ: «000001-000005» разворачивается в шестизначные
      // номера. При границах разной ширины действует большая.
      const width = Math.max(rawStart.length, rawEnd.length);

      for (let current = start; current <= end && numbers.size < MAX_NUMBERS; current += 1) {
        addNumber(String(current).padStart(width, "0"));
      }

      continue;
    }

    addNumber(match.trim());
  }

  return Array.from(numbers.values()).sort(compareHomeworkNumbers);
}
