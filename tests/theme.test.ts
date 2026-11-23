// Node's test runner and assert are typed by referencing only their declaration files: the project does not
// load `@types/node` globally (it would change DOM / React Native globals such as the timer return types).
/// <reference path="../node_modules/@types/node/assert.d.ts" />
/// <reference path="../node_modules/@types/node/assert/strict.d.ts" />
/// <reference path="../node_modules/@types/node/test.d.ts" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { darkColors, gradients, lightColors, type ThemeColors } from '../src/theme/colors';
import { layoutClassFor, radii, sizes, spaceFor } from '../src/theme/metrics';
import { typographyFor } from '../src/theme/typography';
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

  it('keeps the values of the approved design for the load-bearing tokens', () => {
    const expected: [keyof ThemeColors, string, string][] = [
      ['pageBg', '#f4f6f6', '#0b0c0e'],
      ['cardBg', '#ffffff', '#131417'],
      ['textStrong', '#0a0a0a', '#f2f3f4'],
      ['label', '#2c2e33', '#d5d8dc'],
      ['textMuted', '#5f646b', '#a3a8b0'],
      ['line', '#ececee', '#24272c'],
      ['softBg', '#f4f5f6', '#191b1f'],
      ['soft2', '#eceef0', '#24272c'],
      ['accentSolid', '#0d7a57', '#5fe6ac'],
      ['onAccent', '#06281c', '#06281c'],
      ['greenText', '#0f6b41', '#5fe6ac'],
      ['yellowText', '#7d5200', '#f3c56f'],
      ['redText', '#a8262f', '#ff8f97'],
      ['greenSolid', '#1b9e63', '#36e0a4'],
      ['yellowSolid', '#e8b04a', '#e8b04a'],
      ['redSolid', '#c2313c', '#ff6b75'],
      ['streakBgStart', '#fff1e0', '#33230f'],
      ['streakText', '#8a4a00', '#ffb561'],
      ['brand', '#16c79f', '#16c79f'],
    ];
    for (const [token, light, dark] of expected) {
      assert.equal(lightColors[token], light, `light ${token}`);
      assert.equal(darkColors[token], dark, `dark ${token}`);
    }
  });

  it('has one accent: the mint gradient', () => {
    assert.deepEqual(gradients.accent.colors, ['#5ac8ea', '#36e0a4']);
    assert.deepEqual(gradients.accentFlat.colors, gradients.accent.colors);
    assert.deepEqual(gradients.accentDiag.colors, gradients.accent.colors);
  });
});

describe('scales', () => {
  it('uses only the four control heights', () => {
    assert.deepEqual(sizes.control, { xs: 28, sm: 36, md: 44, lg: 52 });
    assert.deepEqual([sizes.chip, sizes.buttonSm, sizes.button, sizes.buttonLg], [28, 36, 44, 52]);
    assert.deepEqual([sizes.field, sizes.fieldLg, sizes.tile, sizes.iconCircle], [44, 52, 44, 44]);
    assert.deepEqual([sizes.avatarSm, sizes.avatar, sizes.avatarLg], [36, 44, 52]);
  });

  it('uses only the radius steps 8 · 12 · 16 · 24 · round', () => {
    const allowed = new Set([8, 12, 16, 24, 999]);
    for (const [token, value] of Object.entries(radii)) assert.ok(allowed.has(value), `radii.${token} = ${value}`);
    assert.deepEqual([radii.sm, radii.md, radii.lg, radii.xl, radii.full], [8, 12, 16, 24, 999]);
  });

  it('uses only the spacing steps 2 · 4 · 8 · 12 · 16 · 24 · 32', () => {
    const allowed = new Set([2, 4, 8, 12, 16, 24, 32]);
    for (const layout of ['phone', 'tablet'] as const) {
      for (const [token, value] of Object.entries(spaceFor(layout))) assert.ok(allowed.has(value), `${layout} space.${token} = ${value}`);
    }
    assert.equal(spaceFor('phone').gutter, 16);
    assert.equal(spaceFor('tablet').gutter, 24);
  });

  it('uses only the type sizes 34 · 24 · 20 · 17 · 15 · 13 · 12 · 11', () => {
    const allowed = new Set([34, 24, 20, 17, 15, 13, 12, 11]);
    for (const layout of ['phone', 'tablet'] as const) {
      for (const [variant, style] of Object.entries(typographyFor(layout))) {
        assert.ok(allowed.has(style.fontSize), `${layout} ${variant} = ${style.fontSize}`);
        assert.ok(!('textTransform' in style), `${variant} must not be upper-cased`);
      }
    }
    assert.equal(typographyFor('phone').pageTitle.fontSize, 24);
    assert.equal(typographyFor('tablet').pageTitle.fontSize, 34);
    assert.equal(typographyFor('phone').sectionTitle.fontSize, 17);
    assert.equal(typographyFor('tablet').sectionTitle.fontSize, 20);
    assert.equal(typographyFor('phone').dock.fontSize, 11);
  });

  it('switches to the tablet layout from 768 points of width', () => {
    assert.equal(layoutClassFor(767), 'phone');
    assert.equal(layoutClassFor(768), 'tablet');
    assert.equal(layoutClassFor(1194), 'tablet');
  });
});

describe('status palette', () => {
  it('maps the traffic light to soft fill + text + solid', () => {
    const light = statusPalette(lightColors);
    assert.deepEqual(light.GREEN, { bg: '#e6f6ed', text: '#0f6b41', border: 'rgba(0, 0, 0, 0)', solid: '#1b9e63' });
    assert.deepEqual(light.YELLOW, { bg: '#fdf1dc', text: '#7d5200', border: 'rgba(0, 0, 0, 0)', solid: '#e8b04a' });
    assert.deepEqual(light.RED, { bg: '#fbe9ea', text: '#a8262f', border: 'rgba(0, 0, 0, 0)', solid: '#c2313c' });
    assert.deepEqual(light.none, { bg: '#eceef0', text: '#2c2e33', border: 'transparent', solid: '#eceef0' });
    assert.deepEqual(light.neutral, { bg: '#eceef0', text: '#0a0a0a', border: '#0a0a0a', solid: '#5f646b' });
    assert.deepEqual(light.idle, { bg: '#ffffff', text: '#5f646b', border: '#dcdee1', solid: '#eceef0' });
    assert.equal(statusPalette(darkColors).GREEN.text, '#5fe6ac');
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
    assert.equal(metricToneColor('accent', lightColors), '#0d7a57');
    assert.equal(metricToneColor('success', darkColors), '#5fe6ac');
    assert.equal(metricToneColor('warning', lightColors), '#7d5200');
    assert.equal(metricToneColor('danger', darkColors), '#ff8f97');
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

  it('paints every tier with the one streak colour of the design', () => {
    // The tiers still drive the «next goal» text; the palette no longer changes hue with them: the design
    // has one accent, and the «огонёк» has one colour of its own.
    const expected = { bgStart: '#fff1e0', bgEnd: '#fff1e0', border: 'rgba(0, 0, 0, 0)', text: '#8a4a00', flame: '#f2922e' };
    for (const tier of STREAK_TIER_ORDER) assert.deepEqual(streakPalette(tier, lightColors), expected, tier);
    assert.equal(streakPalette('gold', darkColors).text, '#ffb561');
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

  it('keeps a character outside the BMP whole (no lone surrogate)', () => {
    assert.equal(initialsOf('😀 Эмодзи Имя'), '😀Э');
    assert.equal(initialsOf('𝒜lice 𝔅ob'), '𝒜𝔅');
  });
});
