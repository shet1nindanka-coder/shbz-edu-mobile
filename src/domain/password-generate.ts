// Ported from the site (lib/password-generate.ts). [MOBILE] The default random source tolerates a runtime
// without `globalThis.crypto` (see `cryptoRandomInt`).
/*
 * Генератор читаемых паролей для аккаунтов учеников и учителей.
 *
 * Два режима:
 * — generatePasswordFromName: транслит фамилии + случайный хвост
 *   («Smirnova-beku4725») — основной сценарий в формах создания, пароль легко
 *   связать с учеником;
 * — generateReadablePassword: случайное слово из слогов («Bekuma-4725») —
 *   запасной вариант, когда из имени не собрать латинское слово.
 * Оба проходят validatePasswordStrength: ≥8 символов, есть буквы и цифры.
 *
 * Фамилию знает весь класс, поэтому стойкость держит только случайный хвост:
 * 2 слога × 4 цифры ≈ 12,8 млн вариантов (раньше 3 цифры — 512, перебор
 * за ~6 часов при лимите входа 20 попыток / 15 мин).
 */

const CONSONANTS = "bdfghkmnprstvz";
const VOWELS = "aeou";
// Без символов-двойников (l/I/O/0/1): пароль диктуют вслух и переписывают с листка.
const DIGITS = "23456789";
const TAIL_DIGITS = 4;

export type RandomIntSource = (maxExclusive: number) => number;

type RandomValuesSource = { getRandomValues?: (array: Uint32Array) => Uint32Array };

/**
 * Криптослучайный индекс. Смещение от modulo на алфавитах ≤14 пренебрежимо.
 * [MOBILE] `globalThis.crypto` exists on the web and in Node but not in every React Native runtime, and
 * this folder must not import a native module. A caller that generates a REAL password passes its own
 * `randomInt` built on `expo-crypto`; the fallback below only keeps demo data flowing.
 */
function cryptoRandomInt(maxExclusive: number): number {
  const source = (globalThis as { crypto?: RandomValuesSource }).crypto;

  if (source?.getRandomValues) {
    const buffer = new Uint32Array(1);
    source.getRandomValues(buffer);
    return buffer[0]! % maxExclusive;
  }

  return Math.floor(Math.random() * maxExclusive);
}

function randomDigits(count: number, randomInt: RandomIntSource): string {
  return Array.from({ length: count }, () => DIGITS[randomInt(DIGITS.length)]!).join("");
}

function randomSyllables(count: number, randomInt: RandomIntSource): string {
  let word = "";

  for (let index = 0; index < count; index += 1) {
    word += CONSONANTS[randomInt(CONSONANTS.length)]! + VOWELS[randomInt(VOWELS.length)]!;
  }

  return word;
}

export function generateReadablePassword(randomInt: RandomIntSource = cryptoRandomInt): string {
  const word = randomSyllables(3, randomInt);

  return `${word.charAt(0).toUpperCase()}${word.slice(1)}-${randomDigits(TAIL_DIGITS, randomInt)}`;
}

const RU_TRANSLIT: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "yo",
  ж: "zh",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "h",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "shch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya"
};

/** Кириллица → латиница; латинские буквы остаются, всё прочее отбрасывается. */
export function transliterateRuToLatin(text: string): string {
  let result = "";

  // NFC: macOS может прислать «й» как «и» + комбинируемый знак — склеиваем обратно.
  for (const char of text.normalize("NFC").toLowerCase()) {
    if (char >= "a" && char <= "z") {
      result += char;
    } else {
      result += RU_TRANSLIT[char] ?? "";
    }
  }

  return result;
}

/*
 * Пароль из фамилии: «Мария Смирнова» → «Smirnova-beku4725». Фамилией считаем
 * последнее слово — так подсказывает и плейсхолдер формы («Имя Фамилия»).
 * Если из слова не собрать хотя бы 3 латинские буквы, отдаём случайное слово.
 */
export function generatePasswordFromName(fullName: string, randomInt: RandomIntSource = cryptoRandomInt): string {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  const surname = words.length > 0 ? words[words.length - 1]! : "";
  const latin = transliterateRuToLatin(surname).slice(0, 16);

  if (latin.length < 3) {
    return generateReadablePassword(randomInt);
  }

  const capitalized = latin.charAt(0).toUpperCase() + latin.slice(1);

  return `${capitalized}-${randomSyllables(2, randomInt)}${randomDigits(TAIL_DIGITS, randomInt)}`;
}
