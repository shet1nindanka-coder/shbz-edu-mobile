// Node's test runner and assert are typed by referencing only their declaration files: the project does not
// load `@types/node` globally (it would change DOM / React Native globals such as the timer return types).
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
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
