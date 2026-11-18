// Node's test runner and assert are typed by referencing only their declaration files: the project does not
// load `@types/node` globally (it would change DOM / React Native globals such as the timer return types).
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  currentToday,
  dateToParts,
  formatDateTimeDisplay,
  formatDateTimeValue,
  parseDateTimeValue,
  partsToDate,
  todayDateTimeValue,
  withPickedDate,
  withPickedTime,
} from '../src/ui/internal/date-time';

describe('date-time field value', () => {
  it('parses the wall-clock format and rejects everything else', () => {
    assert.deepEqual(parseDateTimeValue('2026-11-20T23:59'), { year: 2026, month: 11, day: 20, hour: 23, minute: 59 });
    assert.deepEqual(parseDateTimeValue('2026-01-05T07:03:00.000'), { year: 2026, month: 1, day: 5, hour: 7, minute: 3 });
    assert.equal(parseDateTimeValue(''), null);
    assert.equal(parseDateTimeValue('2026-11-20'), null);
    assert.equal(parseDateTimeValue('2026-13-20T10:00'), null);
    assert.equal(parseDateTimeValue('2026-11-20T24:00'), null);
    assert.equal(parseDateTimeValue('2026-11-20T10:60'), null);
  });

  it('formats back with zero padding', () => {
    assert.equal(formatDateTimeValue({ year: 2026, month: 1, day: 5, hour: 7, minute: 3 }), '2026-01-05T07:03');
  });

  it('round-trips through a device-zone Date without shifting the wall clock', () => {
    const parts = { year: 2026, month: 3, day: 29, hour: 23, minute: 59 };
    assert.deepEqual(dateToParts(partsToDate(parts)), parts);
  });

  it('displays dd.MM.yyyy, HH:mm in Russian and dd/MM/yyyy, HH:mm in English', () => {
    assert.equal(formatDateTimeDisplay('2026-11-20T23:59'), '20.11.2026, 23:59');
    assert.equal(formatDateTimeDisplay('2026-11-20T23:59', 'ru'), '20.11.2026, 23:59');
    assert.equal(formatDateTimeDisplay('2026-01-05T07:03', 'en'), '05/01/2026, 07:03');
    assert.equal(formatDateTimeDisplay(''), '');
    assert.equal(formatDateTimeDisplay('garbage', 'en'), '');
  });
});

describe('date-time picking rules of the site', () => {
  const now = new Date(2026, 10, 16, 14, 30);

  it('"today" is today at 23:59', () => {
    assert.equal(todayDateTimeValue(now), '2026-11-16T23:59');
  });

  it('picking a day with no value sets 23:59', () => {
    assert.equal(withPickedDate('', 2026, 12, 1), '2026-12-01T23:59');
  });

  it('picking a day keeps the chosen time', () => {
    assert.equal(withPickedDate('2026-11-20T18:15', 2026, 12, 1), '2026-12-01T18:15');
  });

  it('picking a time with no value uses today', () => {
    assert.equal(withPickedTime('', 9, 5, now), '2026-11-16T09:05');
  });

  it('picking a time keeps the chosen day', () => {
    assert.equal(withPickedTime('2026-12-01T23:59', 8, 0, now), '2026-12-01T08:00');
  });

  // Deadlines are Moscow wall clock: near midnight the device's day and the Moscow day differ.
  it('"today" follows the day the caller names, not the device day', () => {
    assert.equal(todayDateTimeValue(now, '2026-11-17'), '2026-11-17T23:59');
    assert.equal(withPickedTime('', 9, 5, now, '2026-11-17'), '2026-11-17T09:05');
    assert.equal(withPickedTime('2026-12-01T23:59', 8, 0, now, '2026-11-17'), '2026-12-01T08:00');
  });

  it('a malformed "today" falls back to the device day', () => {
    assert.equal(todayDateTimeValue(now, 'tomorrow'), '2026-11-16T23:59');
    assert.equal(todayDateTimeValue(now, ''), '2026-11-16T23:59');
  });
});

describe('«today» of the date-time field is read when it is used (#407)', () => {
  // 23:57 MSK on 18 Nov and 00:02 MSK on 19 Nov 2026.
  const BEFORE = new Date('2026-11-18T20:57:00.000Z');
  const AFTER = new Date('2026-11-18T21:02:00.000Z');
  const ZONES = ['Europe/Moscow', 'UTC', 'America/Los_Angeles', 'Asia/Vladivostok', 'Pacific/Kiritimati'];

  function inEveryZone(body: () => void) {
    const original = process.env.TZ;
    try {
      for (const zone of ZONES) {
        process.env.TZ = zone;
        body();
      }
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  }

  it('without a value the Moscow day of the moment of use is today', () => {
    inEveryZone(() => {
      assert.equal(currentToday(undefined, BEFORE), '2026-11-18');
      assert.equal(currentToday(undefined, AFTER), '2026-11-19');
      assert.equal(todayDateTimeValue(AFTER, currentToday(undefined, AFTER)), '2026-11-19T23:59');
      assert.equal(withPickedTime('', 18, 0, AFTER, currentToday(undefined, AFTER)), '2026-11-19T18:00');
    });
  });

  it('a function is called at the moment of use', () => {
    let day = '2026-11-18';
    const today = () => day;
    assert.equal(currentToday(today, BEFORE), '2026-11-18');
    day = '2026-11-19';
    assert.equal(currentToday(today, BEFORE), '2026-11-19');
  });

  it('a day computed at a render before Moscow midnight moves on to the new day after it', () => {
    inEveryZone(() => {
      const rendered = '2026-11-18'; // mskToday() of the screen's last render, at 23:57
      const anchor = { value: rendered, day: '2026-11-18' };
      assert.equal(currentToday(rendered, BEFORE, anchor), '2026-11-18');
      assert.equal(currentToday(rendered, AFTER, anchor), '2026-11-19');
      assert.equal(todayDateTimeValue(AFTER, currentToday(rendered, AFTER, anchor)), '2026-11-19T23:59');
      assert.equal(withPickedTime('', 18, 0, AFTER, currentToday(rendered, AFTER, anchor)), '2026-11-19T18:00');
      // A chosen date is never touched.
      assert.equal(withPickedTime('2026-11-25T10:00', 18, 0, AFTER, currentToday(rendered, AFTER, anchor)), '2026-11-25T18:00');
      // Across a month end.
      const late = { value: '2026-11-30', day: '2026-11-30' };
      assert.equal(currentToday('2026-11-30', new Date('2026-11-30T21:00:00.000Z'), late), '2026-12-01');
    });
  });

  it('a deliberate other day keeps its offset; a string with no anchor is taken as given', () => {
    const anchor = { value: '2026-11-20', day: '2026-11-18' };
    assert.equal(currentToday('2026-11-20', BEFORE, anchor), '2026-11-20');
    assert.equal(currentToday('2026-11-20', AFTER, anchor), '2026-11-21');
    assert.equal(currentToday('2026-11-20', AFTER), '2026-11-20');
    // An anchor of another value (the screen passed a new day) does not apply.
    assert.equal(currentToday('2026-11-19', AFTER, anchor), '2026-11-19');
  });
});
