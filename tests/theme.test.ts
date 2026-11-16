// Node's test runner and assert are typed by referencing only their declaration files: the project does not
// load `@types/node` globally (it would change DOM / React Native globals such as the timer return types).
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { darkColors, lightColors, type ThemeColors } from '../src/theme/colors';
import {
  STREAK_COLOR_MILESTONES,
  STREAK_TIER_ORDER,
  initialsOf,
  lessonResultStatus,
  metricToneColor,
  mixHex,
  statusPalette,
  statusTone,
  streakColorMeta,
  streakPalette,
  streakTiers,
  type StreakTier,
} from '../src/theme/status';

describe('theme colours', () => {
  it('light and dark define exactly the same tokens', () => {
    assert.deepEqual(Object.keys(darkColors).sort(), Object.keys(lightColors).sort());
  });

  it('every token is a colour literal', () => {
    const colour = /^(#[0-9a-f]{6}|rgba\(\d+, \d+, \d+, (0|1|0?\.\d+)\))$/;
    for (const palette of [lightColors, darkColors]) {
      for (const [token, value] of Object.entries(palette)) {
        assert.match(value, colour, `${token} = ${value}`);
      }
    }
  });

  it('keeps the spec values of the load-bearing tokens', () => {
    const expected: [keyof ThemeColors, string, string][] = [
      ['pageBg', '#ffffff', '#0b0c0e'],
      ['cardBg', '#ffffff', '#131417'],
      ['textStrong', '#0a0a0a', '#f5f6f7'],
      ['accentSolid', '#16b07e', '#36e0a4'],
      ['greenText', '#127a4c', '#59d49d'],
      ['yellowText', '#8a5d05', '#e8b45c'],
      ['redText', '#b3202c', '#ff8f94'],
      ['dangerSolid', '#e5484d', '#ff6b70'],
      ['tabActiveBg', '#0a0a0a', '#f5f6f7'],
      ['brand', '#16c79f', '#16c79f'],
    ];
    for (const [token, light, dark] of expected) {
      assert.equal(lightColors[token], light, `light ${token}`);
      assert.equal(darkColors[token], dark, `dark ${token}`);
    }
  });
});

describe('status palette', () => {
  it('maps the traffic light to soft fill + text + border', () => {
    const light = statusPalette(lightColors);
    assert.deepEqual(light.GREEN, { bg: '#eaf7ef', text: '#127a4c', border: 'rgba(27, 158, 99, 0.25)' });
    assert.deepEqual(light.YELLOW, { bg: '#fef4e3', text: '#8a5d05', border: 'rgba(201, 138, 30, 0.3)' });
    assert.deepEqual(light.RED, { bg: '#fceded', text: '#b3202c', border: '#f3c7c9' });
    assert.deepEqual(light.none, { bg: '#f2f3f4', text: '#63676d', border: 'transparent' });
    assert.deepEqual(light.neutral, { bg: '#f2f3f4', text: '#0a0a0a', border: '#0a0a0a' });
    assert.deepEqual(light.idle, { bg: '#ffffff', text: '#14161a', border: '#e4e5e7' });
    assert.equal(statusPalette(darkColors).GREEN.text, '#59d49d');
  });

  it('a null status is the "not marked" tone', () => {
    assert.equal(statusTone(null), 'none');
    assert.equal(statusTone(undefined), 'none');
    assert.equal(statusTone('RED'), 'RED');
  });

  it('lesson results reuse the traffic light; "not reached" is neutral', () => {
    assert.deepEqual(lessonResultStatus, { SOLVED: 'GREEN', PARTIAL: 'YELLOW', NOT_SOLVED: 'RED', SKIPPED: 'neutral' });
  });

  it('metric tones resolve to status text colours', () => {
    assert.equal(metricToneColor('default', lightColors), '#0a0a0a');
    assert.equal(metricToneColor('accent', lightColors), '#16b07e');
    assert.equal(metricToneColor('success', darkColors), '#59d49d');
    assert.equal(metricToneColor('warning', lightColors), '#8a5d05');
    assert.equal(metricToneColor('danger', darkColors), '#ff8f94');
  });
});

describe('streak tiers', () => {
  it('picks the tier by the streak length and reports the next milestone', () => {
    assert.deepEqual(streakColorMeta(0), { tier: 'starter', currentThreshold: null, nextThreshold: 10, daysToNextThreshold: 10 });
    assert.deepEqual(streakColorMeta(9), { tier: 'starter', currentThreshold: null, nextThreshold: 10, daysToNextThreshold: 1 });
    assert.deepEqual(streakColorMeta(10), { tier: 'ember', currentThreshold: 10, nextThreshold: 25, daysToNextThreshold: 15 });
    assert.deepEqual(streakColorMeta(149.9), { tier: 'emerald', currentThreshold: 100, nextThreshold: 150, daysToNextThreshold: 1 });
    assert.deepEqual(streakColorMeta(1000), { tier: 'gold', currentThreshold: 1000, nextThreshold: null, daysToNextThreshold: null });
    assert.equal(streakColorMeta(-5).tier, 'starter');
    assert.equal(streakColorMeta(Number.NaN).tier, 'starter');
  });

  it('tier thresholds are the milestones, in order', () => {
    assert.deepEqual(
      STREAK_TIER_ORDER.slice(1).map((tier) => streakTiers[tier].min),
      [...STREAK_COLOR_MILESTONES],
    );
  });

  it('starter uses the theme streak tokens', () => {
    assert.deepEqual(streakPalette('starter', lightColors), {
      bgStart: '#fff3e4',
      bgEnd: '#ffe9d2',
      border: '#fbdfbe',
      text: '#b5701a',
      flame: '#f2922e',
    });
  });

  // Pre-computed color-mix() results from docs/spec/08-design-system.md §1.5.
  const table: Record<Exclude<StreakTier, 'starter'>, [string, string, string, string, string, string, string, string]> = {
    ember: ['#fdeede', '#fef7f0', '#fad6b0', '#72471a', '#37281b', '#231d19', '#684420', '#f4c99d'],
    amber: ['#faf1d8', '#fdf9ee', '#f3dea3', '#6a510b', '#342c15', '#211e16', '#614c13', '#ecd38d'],
    lime: ['#eaf4da', '#f6faef', '#cde4a7', '#3d5810', '#242e17', '#1a1f17', '#3b5217', '#bfda93'],
    emerald: ['#daf1e9', '#eff9f6', '#a6decc', '#0f513c', '#132c27', '#131e1e', '#144c3c', '#91d3be'],
    cyan: ['#d8f1f6', '#eef9fb', '#a2dee9', '#0a515e', '#122c33', '#121e23', '#104c59', '#8bd3e0'],
    blue: ['#e0ebfe', '#f1f6fe', '#b5d0fc', '#204074', '#19263b', '#161c27', '#223e6c', '#a1c2f7'],
    violet: ['#ece5fe', '#f7f4fe', '#d3c1fc', '#442f74', '#26203b', '#1b1927', '#412f6c', '#c5b1f7'],
    rose: ['#fce1e7', '#fef2f4', '#f9b9c5', '#712534', '#361c24', '#22181d', '#672735', '#f2a7b6'],
    gold: ['#f6f0dc', '#fbf8f0', '#eadcad', '#604e17', '#302b1a', '#201e18', '#584a1d', '#e1d099'],
  };

  it('derives the other tiers exactly like the site color-mix() rules', () => {
    for (const [tier, row] of Object.entries(table) as [Exclude<StreakTier, 'starter'>, (typeof table)['ember']][]) {
      const light = streakPalette(tier, lightColors);
      const dark = streakPalette(tier, darkColors);
      assert.deepEqual([light.bgStart, light.bgEnd, light.border, light.text], row.slice(0, 4), `light ${tier}`);
      assert.deepEqual([dark.bgStart, dark.bgEnd, dark.border, dark.text], row.slice(4), `dark ${tier}`);
      assert.equal(light.flame, streakTiers[tier].accent);
    }
  });

  it('mixHex is a straight sRGB blend', () => {
    assert.equal(mixHex('#000000', 0.5, '#ffffff'), '#808080');
    assert.equal(mixHex('#ff0000', 1, '#00ff00'), '#ff0000');
    assert.equal(mixHex('#ff0000', 0, '#00ff00'), '#00ff00');
  });
});

describe('initialsOf', () => {
  it('takes the first letters of the first two words, upper-cased', () => {
    assert.equal(initialsOf('Илья Петров'), 'ИП');
    assert.equal(initialsOf('  maria  '), 'M');
    assert.equal(initialsOf('анна мария фон штайн'), 'АМ');
    assert.equal(initialsOf(''), '?');
    assert.equal(initialsOf('   '), '?');
  });
});
