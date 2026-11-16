// Text normalisers and account limits. Ported 1:1 from the site (lib/utils.ts).
 

const singleLineControlChars = /[\u0000-\u001F\u007F]+/g;
const multilineControlChars = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]+/g;
const repeatedWhitespace = /\s+/g;
export const MAX_USER_NAME_LENGTH = 120;
export const MAX_LOGIN_LENGTH = 254;

export function normalizeSingleLineText(value: string) {
  return value.replace(singleLineControlChars, " ").replace(repeatedWhitespace, " ").trim();
}

export function normalizeMultilineText(value: string) {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(multilineControlChars, "")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

export function normalizeLoginInput(value: string) {
  return normalizeSingleLineText(value).toLowerCase();
}

/*
 * Поиск по спискам аккаунтов (вкладка «Аккаунты» разработчика): запрос
 * разбивается на слова, каждое слово должно встретиться хотя бы в одном из
 * полей (имя, логин) без учёта регистра. Пустой запрос совпадает со всеми.
 */
export function matchesAccountSearch(query: string, ...fields: (string | null | undefined)[]) {
  const words = normalizeSingleLineText(query).toLowerCase().split(" ").filter(Boolean);

  if (words.length === 0) {
    return true;
  }

  const haystack = fields
    .filter((field): field is string => Boolean(field))
    .join(" ")
    .toLowerCase();

  return words.every((word) => haystack.includes(word));
}
