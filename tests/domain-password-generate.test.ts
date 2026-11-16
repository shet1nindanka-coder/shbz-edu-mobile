// Ported from the site (tests/password-generate.test.ts): the same cases against the ported module.
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
import test from "node:test";
import assert from "node:assert/strict";
import { generatePasswordFromName, generateReadablePassword, transliterateRuToLatin } from "@/domain/password-generate";
import { validatePasswordStrength } from "@/domain/password-policy";

const READABLE_FORMAT = /^[A-Z][a-z]{5}-\d{4}$/;

test("генерирует пароль формата «Слоги-цифры» без символов-двойников", () => {
  let counter = 0;
  const rng = (max: number) => counter++ % max;
  const password = generateReadablePassword(rng);

  assert.match(password, READABLE_FORMAT);
  assert.equal(/[lio01ILO]/.test(password), false);
});

test("сгенерированный пароль проходит парольную политику", () => {
  for (let seed = 0; seed < 20; seed += 1) {
    let counter = seed;
    const rng = (max: number) => (counter += 7) % max;

    assert.equal(validatePasswordStrength(generateReadablePassword(rng)), null);
  }
});

test("криптоисточник по умолчанию тоже даёт валидный формат", () => {
  assert.match(generateReadablePassword(), READABLE_FORMAT);
});

test("транслит кириллицы: сложные буквы, NFD-«й», отбрасывание прочего", () => {
  assert.equal(transliterateRuToLatin("Щедрин"), "shchedrin");
  assert.equal(transliterateRuToLatin("Ёлкина-Юрьева"), "yolkinayureva");
  // «й» в NFD (и + U+0306) — как приходит с macOS.
  assert.equal(transliterateRuToLatin("За\u0438\u0306цев"), "zaytsev");
  assert.equal(transliterateRuToLatin("O'Brien 3-й"), "obrieny");
});

test("пароль из фамилии: транслит последнего слова + случайные слоги и 4 цифры", () => {
  let counter = 0;
  const rng = (max: number) => counter++ % max;
  const password = generatePasswordFromName("Мария Смирнова", rng);

  assert.match(password, /^Smirnova-[a-z]{4}[2-9]{4}$/);
  assert.equal(validatePasswordStrength(password), null);
});

test("пароль из короткой фамилии тоже со случайным хвостом и проходит политику", () => {
  let counter = 0;
  const rng = (max: number) => counter++ % max;
  const password = generatePasswordFromName("Анна Ким", rng);

  assert.match(password, /^Kim-[a-z]{4}[2-9]{4}$/);
  assert.equal(validatePasswordStrength(password), null);
});

test("случайный хвост у фамилии — около 12,8 млн вариантов, а не 512", () => {
  // 14 согласных × 4 гласных = 56 слогов; 2 слога × 4 цифры из 8.
  assert.equal(56 ** 2 * 8 ** 4, 12_845_056);
  const seen = new Set(Array.from({ length: 200 }, () => generatePasswordFromName("Мария Смирнова")));
  assert.ok(seen.size > 195);
});

test("если из фамилии не собрать латиницу — запасной случайный формат", () => {
  let counter = 0;
  const rng = (max: number) => counter++ % max;

  assert.match(generatePasswordFromName("Ли У", rng), READABLE_FORMAT);
  assert.match(generatePasswordFromName("", rng), READABLE_FORMAT);
  assert.match(generatePasswordFromName("№ 42 —", rng), READABLE_FORMAT);
});
