// Node's test runner and assert are typed by referencing only their declaration files: the project does not
// load `@types/node` globally (it would change DOM / React Native globals such as the timer return types).
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { advanceWaitClock, startWaitClock, waitClockSeconds } from '../src/components/retry-wait/wait-clock';
import { accessibilityLabelOf, shouldAnnounce, withErrorHint } from '../src/ui/a11y';
import { effectiveFontScale, MAX_FONT_SCALE, minimumFontScaleFor, widthForText } from '../src/ui/font-scale';
import {
  dateToParts,
  formatDateTimeValue,
  parseDateTimeValue,
  partsToDate,
  partsToPickerDate,
  pickerDateToParts,
  withPickedDate,
  withPickedTime,
} from '../src/ui/internal/date-time';

describe('spoken names and announcements (#233, #237)', () => {
  it('builds a label from the visible parts, skipping empty ones', () => {
    assert.equal(accessibilityLabelOf(['Выбрать № 118', 'Нужна помощь преподавателя', null, '', '  ', false, 'Уже в ДЗ']), 'Выбрать № 118, Нужна помощь преподавателя, Уже в ДЗ');
    assert.equal(accessibilityLabelOf([undefined, null]), '');
    assert.equal(accessibilityLabelOf(['Ошибка', 'Повторите'], '. '), 'Ошибка. Повторите');
  });

  it('puts an inline error in front of the input hint', () => {
    assert.equal(withErrorHint('Введите логин', undefined), 'Введите логин');
    assert.equal(withErrorHint('Введите логин', 'Логин выдал учитель'), 'Введите логин. Логин выдал учитель');
    assert.equal(withErrorHint(null, 'Подсказка'), 'Подсказка');
    assert.equal(withErrorHint('  ', undefined), undefined);
  });

  it('announces only on iOS, and only a message that appeared or changed', () => {
    assert.equal(shouldAnnounce('ios', null, 'Неверный пароль'), true);
    assert.equal(shouldAnnounce('ios', 'Неверный пароль', 'Неверный пароль'), false);
    assert.equal(shouldAnnounce('ios', 'Неверный пароль', 'Слишком много попыток'), true);
    assert.equal(shouldAnnounce('ios', null, ''), false);
    assert.equal(shouldAnnounce('ios', null, null), false);
    // Android reads the live region itself; announcing as well would double it.
    assert.equal(shouldAnnounce('android', null, 'Неверный пароль'), false);
    assert.equal(shouldAnnounce('web', null, 'Неверный пароль'), false);
  });
});

describe('font scale (#239)', () => {
  it('clamps the OS scale to the range text is drawn at', () => {
    assert.equal(effectiveFontScale(0.85), 1);
    assert.equal(effectiveFontScale(1.2), 1.2);
    assert.equal(effectiveFontScale(2), MAX_FONT_SCALE);
    assert.equal(effectiveFontScale(Number.NaN), 1);
  });

  it('grows a width threshold with the text: the theme control goes compact at 390 pt from 1.1 on', () => {
    const NARROW_WIDTH = 360;
    assert.equal(390 < widthForText(NARROW_WIDTH, 1), false);
    assert.equal(390 < widthForText(NARROW_WIDTH, 1.15), true);
    assert.equal(390 < widthForText(NARROW_WIDTH, 1.2), true);
    assert.equal(390 < widthForText(NARROW_WIDTH, 1.3), true);
    assert.equal(widthForText(NARROW_WIDTH, 3), NARROW_WIDTH * MAX_FONT_SCALE);
  });

  it('lets a one-line label shrink back to the default size, never below 0.77 of it', () => {
    assert.equal(minimumFontScaleFor(1), 0.9);
    assert.ok(Math.abs(minimumFontScaleFor(1.3) * 1.3 - 1) < 1e-9);
    assert.ok(Math.abs(minimumFontScaleFor(5) - 1 / MAX_FONT_SCALE) < 1e-9);
  });
});

describe('cool-down measured as a duration (#213)', () => {
  const T0 = Date.UTC(2026, 10, 17, 12, 0, 0);

  it('counts down with the clock', () => {
    let clock = startWaitClock(60, T0);
    assert.equal(waitClockSeconds(clock), 60);
    clock = advanceWaitClock(clock, T0 + 1_500);
    assert.equal(waitClockSeconds(clock), 59);
    clock = advanceWaitClock(clock, T0 + 60_000);
    assert.equal(waitClockSeconds(clock), 0);
    assert.equal(waitClockSeconds(null), 0);
  });

  it('a clock set back an hour does not lengthen the wait', () => {
    let clock = startWaitClock(60, T0);
    clock = advanceWaitClock(clock, T0 + 10_000);
    assert.equal(waitClockSeconds(clock), 50);
    // The device clock jumps back by an hour: a deadline would now say 3 650 s.
    clock = advanceWaitClock(clock, T0 + 10_000 - 3_600_000);
    assert.equal(waitClockSeconds(clock), 50);
    // And then keeps counting from the new reading.
    clock = advanceWaitClock(clock, T0 + 10_000 - 3_600_000 + 20_000);
    assert.equal(waitClockSeconds(clock), 30);
  });

  it('time spent in the background (no ticks) counts', () => {
    let clock = startWaitClock(600, T0);
    clock = advanceWaitClock(clock, T0 + 9 * 60_000);
    assert.equal(waitClockSeconds(clock), 60);
  });

  it('a wait that started in the past (a failure noticed later) is measured from its start', () => {
    const clock = advanceWaitClock(startWaitClock(30, T0), T0 + 12_000);
    assert.equal(waitClockSeconds(clock), 18);
    // A start "in the future" (the clock went back after the failure) never adds time.
    assert.equal(waitClockSeconds(advanceWaitClock(startWaitClock(30, T0), T0 - 3_600_000)), 30);
  });

  it('ignores a meaningless wait', () => {
    assert.equal(waitClockSeconds(startWaitClock(0, T0)), 0);
    assert.equal(waitClockSeconds(startWaitClock(-5, T0)), 0);
    assert.equal(waitClockSeconds(startWaitClock(Number.NaN, T0)), 0);
  });
});

describe('native date-time picker in Moscow time whatever the device zone (#211)', () => {
  // Node re-reads `TZ` when it is assigned: each case runs as if the device were in that zone.
  const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;
  const originalTz = env.TZ;
  afterEach(() => {
    if (originalTz === undefined) delete env.TZ;
    else env.TZ = originalTz;
  });

  // Moscow wall clocks that do not exist in the device zone: its spring-forward gap.
  const GAPS: readonly { zone: string; value: string }[] = [
    { zone: 'Europe/Berlin', value: '2026-03-29T02:30' },
    { zone: 'Europe/Berlin', value: '2027-03-28T02:15' },
    { zone: 'Africa/Cairo', value: '2026-04-24T00:30' },
    { zone: 'Asia/Beirut', value: '2026-03-29T00:10' },
    { zone: 'America/Santiago', value: '2026-09-06T00:20' },
    { zone: 'America/New_York', value: '2026-03-08T02:45' },
  ];

  for (const { zone, value } of GAPS) {
    it(`${zone}: ${value} survives the picker round trip`, () => {
      env.TZ = zone;
      const parts = parseDateTimeValue(value);
      assert.ok(parts);
      // The old device-zone path really is in a gap here (the test would prove nothing otherwise).
      const legacy = formatDateTimeValue(dateToParts(partsToDate(parts)));
      if (new Intl.DateTimeFormat('en', { timeZone: zone }).resolvedOptions().timeZone === zone) {
        assert.notEqual(legacy, value, `expected ${value} to be in the DST gap of ${zone}`);
      }

      const shown = partsToPickerDate(parts);
      // iOS inline picker untouched / Android dialog confirmed unchanged: the same wall clock comes back.
      assert.equal(formatDateTimeValue(pickerDateToParts(shown)), value);
      // Android time dialog: the hour read back is the shown one.
      const picked = pickerDateToParts(shown);
      assert.equal(withPickedTime(value, picked.hour, picked.minute, new Date()), value);
      // Picking the next day keeps the time (iOS writes the whole instant back; Android the date only).
      const nextDay = pickerDateToParts(new Date(shown.getTime() + 24 * 3_600_000));
      assert.equal(formatDateTimeValue(nextDay).slice(11), value.slice(11));
      assert.equal(withPickedDate(value, nextDay.year, nextDay.month, nextDay.day).slice(11), value.slice(11));
    });
  }

  it('a date far from UTC+3 keeps its day', () => {
    for (const zone of ['Pacific/Kiritimati', 'Pacific/Pago_Pago', 'Asia/Tokyo', 'America/Los_Angeles']) {
      env.TZ = zone;
      for (const value of ['2026-11-20T00:00', '2026-11-20T23:59', '2026-12-31T23:30']) {
        assert.equal(formatDateTimeValue(pickerDateToParts(partsToPickerDate(parseDateTimeValue(value)!))), value, `${zone} ${value}`);
      }
    }
  });
});
