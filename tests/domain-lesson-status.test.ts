// Ported from the site (tests/lesson-status.test.ts): the same cases against the ported module.
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
import test from "node:test";
import assert from "node:assert/strict";
import {
  deriveLessonStatus,
  LESSON_START_CHECK_INTERVAL_MS,
  lessonStartRefreshDelay,
  MAX_TIMER_DELAY_MS,
  shouldRefreshForLessonStart,
  type LessonStartWatch
} from "@/domain/lesson-status";

const START = Date.parse("2026-08-20T15:00:00+03:00");
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

test("deriveLessonStatus: до начала — PLANNED, во время — ACTIVE, после — FINISHED", () => {
  const lesson = { startsAt: new Date(START), durationMinutes: 60, status: "PLANNED" };

  assert.equal(deriveLessonStatus(lesson, START - MINUTE), "PLANNED");
  assert.equal(deriveLessonStatus(lesson, START), "ACTIVE");
  assert.equal(deriveLessonStatus(lesson, START + 59 * MINUTE), "ACTIVE");
  assert.equal(deriveLessonStatus(lesson, START + 60 * MINUTE), "FINISHED");
  assert.equal(deriveLessonStatus(lesson, START + 24 * 60 * MINUTE), "FINISHED");
});

test("deriveLessonStatus: строковая дата из БД/JSON работает так же", () => {
  const lesson = { startsAt: "2026-08-20T15:00:00+03:00", durationMinutes: 90, status: "PLANNED" };

  assert.equal(deriveLessonStatus(lesson, START + 89 * MINUTE), "ACTIVE");
  assert.equal(deriveLessonStatus(lesson, START + 90 * MINUTE), "FINISHED");
});

test("deriveLessonStatus: без даты — статус из БД, мусорный статус → PLANNED", () => {
  assert.equal(deriveLessonStatus({ startsAt: null, durationMinutes: 60, status: "FINISHED" }, START), "FINISHED");
  assert.equal(deriveLessonStatus({ startsAt: null, durationMinutes: 60, status: "ACTIVE" }, START), "ACTIVE");
  assert.equal(deriveLessonStatus({ startsAt: null, durationMinutes: 60, status: "garbage" }, START), "PLANNED");
  assert.equal(deriveLessonStatus({ startsAt: "not-a-date", durationMinutes: 60, status: "ACTIVE" }, START), "ACTIVE");
});

test("deriveLessonStatus: нулевая длительность не даёт вечного ACTIVE", () => {
  const lesson = { startsAt: new Date(START), durationMinutes: 0, status: "PLANNED" };

  assert.equal(deriveLessonStatus(lesson, START), "FINISHED");
});

test("deriveLessonStatus: досрочное завершение (finishedAt) перекрывает расписание", () => {
  const lesson = {
    startsAt: new Date(START),
    durationMinutes: 60,
    status: "PLANNED",
    finishedAt: new Date(START + 30 * MINUTE)
  };

  // Урок завершили на 30-й минуте — с этого момента FINISHED, хотя по расписанию он ещё идёт.
  assert.equal(deriveLessonStatus(lesson, START + 31 * MINUTE), "FINISHED");
  // До момента завершения производная работает как раньше.
  assert.equal(deriveLessonStatus(lesson, START + 10 * MINUTE), "ACTIVE");
});

test("deriveLessonStatus: finishedAt работает и для урока без расписания", () => {
  const lesson = { startsAt: null, durationMinutes: 60, status: "PLANNED", finishedAt: new Date(START) };

  assert.equal(deriveLessonStatus(lesson, START + MINUTE), "FINISHED");
});

test("deriveLessonStatus: мусорный finishedAt игнорируется", () => {
  const lesson = { startsAt: new Date(START), durationMinutes: 60, status: "PLANNED", finishedAt: "not-a-date" };

  assert.equal(deriveLessonStatus(lesson, START + MINUTE), "ACTIVE");
});

test("lessonStartRefreshDelay: до начала урока плюс секунда запаса", () => {
  assert.equal(lessonStartRefreshDelay(new Date(START), START - 5 * MINUTE), 5 * MINUTE + 1000);
  assert.equal(lessonStartRefreshDelay("2026-08-20T15:00:00+03:00", START - MINUTE), MINUTE + 1000);
  // Запас гарантирует: к моменту refresh сервер уже считает урок идущим.
  assert.equal(deriveLessonStatus({ startsAt: new Date(START), durationMinutes: 60, status: "PLANNED" }, START + 1000), "ACTIVE");
});

test("lessonStartRefreshDelay: по часам устройства начало прошло — обновиться сразу, через запас", () => {
  assert.equal(lessonStartRefreshDelay(new Date(START), START - MINUTE, START), 1000);
  assert.equal(lessonStartRefreshDelay(new Date(START), START - MINUTE, START + 10 * MINUTE), 1000);
});

test("lessonStartRefreshDelay: свежий рендер уже после начала — без таймера, чтобы не зациклиться", () => {
  assert.equal(lessonStartRefreshDelay(new Date(START), START), null);
  assert.equal(lessonStartRefreshDelay(new Date(START), START + 10 * MINUTE), null);
});

test("lessonStartRefreshDelay: первый показ берёт более позднее из часов сервера и устройства", () => {
  // Страница из кэша роутера («Назад»): serverNow старый, часы устройства верные — урок уже идёт.
  assert.equal(lessonStartRefreshDelay(new Date(START), START - 10 * MINUTE, START + MINUTE), 1000);
  // Часы устройства отстают на 3 часа — ждём по серверу, а не лишние 3 часа.
  assert.equal(lessonStartRefreshDelay(new Date(START), START - MINUTE, START - 180 * MINUTE), MINUTE + 1000);
});

test("lessonStartRefreshDelay: спешащие часы устройства дают не больше одного лишнего refresh", () => {
  // Устройство спешит на 5 минут: первый таймер срабатывает за 5 минут до начала по серверу.
  assert.equal(lessonStartRefreshDelay(new Date(START), START - 6 * MINUTE, START - MINUTE), MINUTE + 1000);
  // Свежий ответ на этот refresh (без clientNow) ждёт настоящего начала, а не дёргает refresh каждую секунду.
  assert.equal(lessonStartRefreshDelay(new Date(START), START - 5 * MINUTE + 1000), 5 * MINUTE);

  // Пока урок у сервера не начался, delay по серверу всегда доводит refresh до начала.
  for (const serverNow of [START - 1, START - 1000, START - 7 * MINUTE, START - 3 * 24 * 60 * MINUTE]) {
    const delay = lessonStartRefreshDelay(new Date(START), serverNow);

    assert.ok(delay !== null && serverNow + delay > START);
  }
});

test("lessonStartRefreshDelay: дальше предела setTimeout и битые данные — без таймера", () => {
  assert.equal(lessonStartRefreshDelay(new Date(START), START + 1000 - MAX_TIMER_DELAY_MS), MAX_TIMER_DELAY_MS);
  assert.equal(lessonStartRefreshDelay(new Date(START), START + 999 - MAX_TIMER_DELAY_MS), null);
  assert.equal(lessonStartRefreshDelay(new Date(START), START - 30 * 24 * 60 * MINUTE), null);
  assert.equal(lessonStartRefreshDelay("not-a-date", START), null);
  assert.equal(lessonStartRefreshDelay(new Date(START), Number.NaN), null);
  assert.equal(lessonStartRefreshDelay(new Date(START), START - MINUTE, Number.NaN), null);
});

// Ответ на refresh за 5 минут до начала, часы устройства совпадают с серверными.
const watchFrom = (overrides: Partial<LessonStartWatch> = {}): LessonStartWatch => ({
  startsAt: new Date(START),
  serverNow: START - 5 * MINUTE,
  mountedAt: START - 5 * MINUTE,
  firstRender: false,
  timerFired: false,
  refreshed: false,
  ...overrides
});

test("shouldRefreshForLessonStart: устройство проспало начало — сверка со стенными часами обновляет без таймера", () => {
  const watch = watchFrom();

  // Ноутбук уснул в 14:56 и проснулся в 15:03 с открытой вкладкой: таймеру осталось
  // ~4 минуты бодрствования, visibilitychange не пришёл, а по стенным часам срок прошёл.
  assert.equal(shouldRefreshForLessonStart(watch, START + 3 * MINUTE, false), true);
  // Проснулся до начала — рано.
  assert.equal(shouldRefreshForLessonStart(watch, START - MINUTE, false), false);
  // Срок тот же, что у таймера: начало плюс секунда запаса.
  assert.equal(shouldRefreshForLessonStart(watch, START + 999, false), false);
  assert.equal(shouldRefreshForLessonStart(watch, START + 1000, false), true);
});

test("shouldRefreshForLessonStart: срок совпадает с таймером lessonStartRefreshDelay", () => {
  // Часы устройства верные, отстают на час, спешат на минуту; первый показ и ответ на refresh.
  for (const skew of [0, -HOUR, MINUTE]) {
    for (const firstRender of [true, false]) {
      const serverNow = START - 5 * MINUTE;
      const mountedAt = serverNow + skew;
      const delay = lessonStartRefreshDelay(new Date(START), serverNow, firstRender ? mountedAt : undefined);
      const watch = watchFrom({ serverNow, mountedAt, firstRender });

      assert.ok(delay !== null);
      assert.equal(shouldRefreshForLessonStart(watch, mountedAt + delay - 1, false), false);
      assert.equal(shouldRefreshForLessonStart(watch, mountedAt + delay, false), true);
    }
  }
});

test("shouldRefreshForLessonStart: спешащие часы устройства не гоняют refresh до начала", () => {
  // Ответ на refresh, часы устройства спешат на час: Date.now() давно позже startsAt,
  // но по серверу до начала 5 минут — сверка ждёт их, а не обновляет каждые полминуты.
  const mountedAt = START - 5 * MINUTE + HOUR;
  const watch = watchFrom({ mountedAt });

  for (let elapsed = 0; elapsed < 5 * MINUTE + 1000; elapsed += LESSON_START_CHECK_INTERVAL_MS) {
    assert.equal(shouldRefreshForLessonStart(watch, mountedAt + elapsed, false), false);
  }

  assert.equal(shouldRefreshForLessonStart(watch, mountedAt + 5 * MINUTE + 1000, false), true);
});

test("shouldRefreshForLessonStart: первый показ из кэша роутера сверяется и с часами устройства", () => {
  // «Назад» через 11 минут: serverNow из кэша старый, часы устройства верные — урок уже идёт.
  const watch = watchFrom({ serverNow: START - 10 * MINUTE, mountedAt: START + MINUTE, firstRender: true });

  assert.equal(shouldRefreshForLessonStart(watch, START + MINUTE + 1000, false), true);
  // Ответу на refresh так не верим: по нему до начала ещё 10 минут.
  assert.equal(shouldRefreshForLessonStart({ ...watch, firstRender: false }, START + MINUTE + 1000, false), false);
});

test("shouldRefreshForLessonStart: один refresh на рендер, скрытая вкладка ждёт показа", () => {
  const watch = watchFrom();
  const late = START + 3 * MINUTE;

  // Таймер или сверка уже обновили этот рендер — второго refresh нет.
  assert.equal(shouldRefreshForLessonStart({ ...watch, refreshed: true }, late, false), false);
  assert.equal(shouldRefreshForLessonStart({ ...watch, timerFired: true, refreshed: true }, late, false), false);
  // Сработавший таймер обновляет и без сверки (часы устройства могли перевести назад).
  assert.equal(shouldRefreshForLessonStart({ ...watch, timerFired: true }, watch.mountedAt - HOUR, false), true);
  // Скрытую вкладку не обновляем ни по таймеру, ни по сверке — только при показе.
  assert.equal(shouldRefreshForLessonStart({ ...watch, timerFired: true }, late, true), false);
  assert.equal(shouldRefreshForLessonStart(watch, late, true), false);
});

test("shouldRefreshForLessonStart: рендер уже после начала, часы назад и битые данные — без refresh", () => {
  // Свежий рендер после начала: refresh ничего не изменит, а повтор зациклился бы.
  const started = watchFrom({ serverNow: START + MINUTE, mountedAt: START + MINUTE });

  assert.equal(shouldRefreshForLessonStart(started, START + HOUR, false), false);
  // Часы устройства перевели назад — ждём таймер.
  assert.equal(shouldRefreshForLessonStart(watchFrom(), START - HOUR, false), false);
  assert.equal(shouldRefreshForLessonStart(watchFrom({ startsAt: "not-a-date" }), START + HOUR, false), false);
  assert.equal(shouldRefreshForLessonStart(watchFrom(), Number.NaN, false), false);
});

test("shouldRefreshForLessonStart: урок дальше предела setTimeout — таймера нет, сверка ловит начало", () => {
  const serverNow = START - 30 * 24 * 60 * MINUTE;
  const watch = watchFrom({ serverNow, mountedAt: serverNow });

  assert.equal(lessonStartRefreshDelay(new Date(START), serverNow), null);
  assert.equal(shouldRefreshForLessonStart(watch, START - MINUTE, false), false);
  assert.equal(shouldRefreshForLessonStart(watch, START + 1000, false), true);
});
