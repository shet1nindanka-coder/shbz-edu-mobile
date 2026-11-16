// Ported from the site (tests/solution-check-error-text.test.ts): the same cases against the ported module.
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
import test from "node:test";
import assert from "node:assert/strict";
import { getDictionary } from "@/i18n/get-dictionary";
import { humanizeSolutionCheckError } from "@/domain/solution-check-error-text";

const ru = getDictionary("ru").student.checkErrors;
const en = getDictionary("en").student.checkErrors;
const h = (raw: string | null, messages = ru) => humanizeSolutionCheckError(raw, messages);

test("humanizeSolutionCheckError переводит классы отказов в русский текст с следующим шагом", () => {
  assert.match(h("The operation was aborted"), /остановлена/);
  assert.match(h("Request timed out after 120000ms"), /остановлена/);
  assert.match(h("You exceeded your current quota, please check your plan"), /Лимит/);
  assert.match(h("Модель вернула статус 503: upstream error"), /недоступен или перегружен/);
  assert.match(h("Rate limit reached for requests"), /недоступен или перегружен/);
  assert.match(h("Очередь проверок переполнена"), /слишком много проверок/);
  assert.match(h("Invalid image format in message content"), /фото решения/);
});

test("humanizeSolutionCheckError не пропускает сырой текст провайдера наружу", () => {
  const raw = "Model API error 500: internal server error at upstream";
  const message = h(raw);

  assert.ok(!message.includes("500"));
  assert.ok(!/[a-z]{3,}/i.test(message.replace(/[А-Яа-яЁё\s.,—«»-]/g, "")));
});

test("humanizeSolutionCheckError возвращает запасной текст для пустых и неизвестных ошибок", () => {
  assert.match(h(null), /на нашей стороне/);
  assert.match(h(""), /на нашей стороне/);
  assert.match(h("weird unknown failure xyz"), /на нашей стороне/);
});

test("humanizeSolutionCheckError: прерванная и выключенная проверка, английский", () => {
  assert.match(h("Проверка прервалась (перезапуск сервера). Сдайте номер заново."), /прервалась/);
  assert.match(h("Проверка снята разработчиком как зависшая. Запустите её заново.", en), /interrupted/);
  assert.match(h("Проверка классной работы отключена разработчиком."), /выключена/);
  assert.match(h("Автопроверка не настроена: нет AI_CHECK_API_KEY или модели."), /выключена/);
  assert.match(h("Нет фото решения.", en), /photos/);
  assert.match(h("Модель вернула статус 500: <html>upstream</html>", en), /unavailable/);
  assert.doesNotMatch(h("Модель вернула статус 500: <html>upstream</html>", en), /upstream/);
});
