// The one caption of a homework row: the deadline in its shortest exact wording, in Moscow days.
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { deadlineCaption } from "@/domain/deadline-caption";
import { getMobileDictionary } from "@/i18n/mobile";

const ru = getMobileDictionary("ru").common.deadline;
const en = getMobileDictionary("en").common.deadline;
// Wednesday 18 November 2026, 12:00 Moscow time.
const NOW = Date.parse("2026-11-18T09:00:00.000Z");
const at = (iso: string) => deadlineCaption(iso, false, NOW, "ru", ru);

describe("deadline caption", () => {
  it("names today and tomorrow with the time", () => {
    assert.deepEqual(at("2026-11-18T20:59:00.000Z"), { text: "сегодня до 23:59", attention: false });
    assert.deepEqual(at("2026-11-19T20:59:00.000Z"), { text: "до завтра, 23:59", attention: false });
  });

  it("names the weekday within a week and the date beyond it", () => {
    assert.deepEqual(at("2026-11-20T20:59:00.000Z"), { text: "до пятницы", attention: false });
    assert.deepEqual(at("2026-11-24T20:59:00.000Z"), { text: "до вторника", attention: false });
    assert.deepEqual(at("2026-11-25T20:59:00.000Z"), { text: "до 25 ноября", attention: false });
  });

  it("asks for attention only when the deadline has passed", () => {
    assert.deepEqual(at("2026-11-18T08:00:00.000Z"), { text: "просрочено сегодня", attention: true });
    assert.deepEqual(at("2026-11-16T20:59:00.000Z"), { text: "просрочено 2 дня", attention: true });
    assert.deepEqual(at("2026-11-13T20:59:00.000Z"), { text: "просрочено 5 дней", attention: true });
    assert.deepEqual(at("2026-11-17T20:59:00.000Z"), { text: "просрочено 1 день", attention: true });
  });

  it("counts Moscow days: 23:59 MSK of the 19th is «завтра» even when the device is a day ahead", () => {
    // 20:59 UTC on the 19th is 23:59 in Moscow on the 19th.
    assert.equal(at("2026-11-19T20:59:00.000Z").text, "до завтра, 23:59");
  });

  it("a finished homework and a homework without a deadline are plain facts", () => {
    assert.deepEqual(deadlineCaption("2026-11-10T20:59:00.000Z", true, NOW, "ru", ru), { text: "выполнено", attention: false });
    assert.deepEqual(deadlineCaption(null, false, NOW, "ru", ru), { text: "без срока", attention: false });
    assert.deepEqual(deadlineCaption("not a date", false, NOW, "ru", ru), { text: "без срока", attention: false });
  });

  it("has an English wording", () => {
    assert.equal(deadlineCaption("2026-11-19T20:59:00.000Z", false, NOW, "en", en).text, "due tomorrow, 23:59");
    assert.equal(deadlineCaption("2026-11-20T20:59:00.000Z", false, NOW, "en", en).text, "due Friday");
    assert.equal(deadlineCaption("2026-11-16T20:59:00.000Z", false, NOW, "en", en).text, "overdue by 2 days");
  });
});
