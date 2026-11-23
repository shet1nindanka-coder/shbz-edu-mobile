// Traffic-light status palette, lesson-result palette and streak colour tiers
// (docs/design/glass-over-paper.md §2). Green / yellow / red are reserved for number statuses and direct
// signals; they are never decorative.
//
// The string unions below are structural copies of the canonical API types so the theme does not import
// the API layer; a value typed with the API's `HomeworkNumberStatus` is assignable here.
import type { ThemeColors } from './colors';

export type HomeworkNumberStatus = 'GREEN' | 'YELLOW' | 'RED';
export type LessonResultValue = 'SOLVED' | 'PARTIAL' | 'NOT_SOLVED' | 'SKIPPED';
export type StatusTone = HomeworkNumberStatus | 'none' | 'neutral' | 'idle';
export type StatusColors = { bg: string; text: string; border: string; /** bars and dots */ solid: string };

export function statusPalette(c: ThemeColors): Record<StatusTone, StatusColors> {
  return {
    GREEN: { bg: c.greenSoft, text: c.greenText, border: c.greenBorder, solid: c.greenSolid },
    YELLOW: { bg: c.yellowSoft, text: c.yellowText, border: c.yellowBorder, solid: c.yellowSolid },
    RED: { bg: c.redSoft, text: c.redText, border: c.redBorder, solid: c.redSolid },
    /** `null` status: a tile or a chip without a mark */
    none: { bg: c.soft2, text: c.label, border: 'transparent', solid: c.soft2 },
    /** active "SKIPPED" lesson result */
    neutral: { bg: c.soft2, text: c.textStrong, border: c.textStrong, solid: c.textMuted },
    /** inactive status mark: white with an outline */
    idle: { bg: c.cardBg, text: c.textMuted, border: c.line2, solid: c.soft2 },
  };
}

/** Which status tone an active lesson-result option uses (`lessonResultMeta` on the site). */
export const lessonResultStatus: Record<LessonResultValue, HomeworkNumberStatus | 'neutral'> = {
  SOLVED: 'GREEN',
  PARTIAL: 'YELLOW',
  NOT_SOLVED: 'RED',
  SKIPPED: 'neutral',
};

/** Tone of a status badge: the status itself, or `none` for "not marked". */
export function statusTone(status: HomeworkNumberStatus | null | undefined): HomeworkNumberStatus | 'none' {
  return status ?? 'none';
}

/** Page-header metric tones (`PageHeader.metrics` on the site, spec §4.4). */
export type MetricTone = 'default' | 'accent' | 'success' | 'warning' | 'danger';

export function metricToneColor(tone: MetricTone, c: ThemeColors): string {
  switch (tone) {
    case 'accent':
      return c.accentSolid;
    case 'success':
      return c.greenText;
    case 'warning':
      return c.yellowText;
    case 'danger':
      return c.redText;
    default:
      return c.textStrong;
  }
}

// ── streak ────────────────────────────────────────────────────────────────────────────────────────

export type StreakTier =
  | 'starter'
  | 'ember'
  | 'amber'
  | 'lime'
  | 'emerald'
  | 'cyan'
  | 'blue'
  | 'violet'
  | 'rose'
  | 'gold';

export const STREAK_TIER_ORDER: readonly StreakTier[] = [
  'starter',
  'ember',
  'amber',
  'lime',
  'emerald',
  'cyan',
  'blue',
  'violet',
  'rose',
  'gold',
];

export const streakTiers: Record<StreakTier, { min: number; accent: string | null }> = {
  starter: { min: 0, accent: null },
  ember: { min: 10, accent: '#f2922e' },
  amber: { min: 25, accent: '#e0a80c' },
  lime: { min: 50, accent: '#7cb818' },
  emerald: { min: 100, accent: '#16a878' },
  cyan: { min: 150, accent: '#0aa8c4' },
  blue: { min: 200, accent: '#3b82f6' },
  violet: { min: 300, accent: '#8b5cf6' },
  rose: { min: 500, accent: '#ef4667' },
  gold: { min: 1000, accent: '#c9a227' },
};

export const STREAK_COLOR_MILESTONES = [10, 25, 50, 100, 150, 200, 300, 500, 1000] as const;

/** sRGB mix of two `#rrggbb` colours: `weightA` of `a`, the rest of `b` (CSS `color-mix(in srgb, …)`). */
export function mixHex(a: string, weightA: number, b: string): string {
  const parse = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const x = parse(a);
  const y = parse(b);
  return (
    '#' +
    x
      .map((v, i) =>
        Math.round(v * weightA + (y[i] ?? 0) * (1 - weightA))
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
}

export type StreakPalette = { bgStart: string; bgEnd: string; border: string; text: string; flame: string };

/**
 * Colours of the «огонёк». The design has one streak colour (`.fl`: #fff1e0 / #8a4a00, flame #f2922e), so
 * every tier paints the same; the tiers still drive the «next goal» text (`streakColorMeta`).
 */
export function streakPalette(_tier: StreakTier, colors: ThemeColors): StreakPalette {
  return {
    bgStart: colors.streakBgStart,
    bgEnd: colors.streakBgEnd,
    border: colors.streakBorder,
    text: colors.streakText,
    flame: colors.streakFlame,
  };
}

export type StreakColorMeta = {
  tier: StreakTier;
  currentThreshold: number | null;
  nextThreshold: number | null;
  daysToNextThreshold: number | null;
};

/** Same rule as `getStudentStreakColorMeta()` in the site's lib/student-streak-colors.ts. */
export function streakColorMeta(currentStreak: number): StreakColorMeta {
  const n = Math.max(0, Math.floor(Number.isFinite(currentStreak) ? currentStreak : 0));
  const tier = [...STREAK_TIER_ORDER].reverse().find((t) => n >= streakTiers[t].min) ?? 'starter';
  const currentThreshold = streakTiers[tier].min > 0 ? streakTiers[tier].min : null;
  const nextThreshold = STREAK_COLOR_MILESTONES.find((m) => n < m) ?? null;
  return {
    tier,
    currentThreshold,
    nextThreshold,
    daysToNextThreshold: nextThreshold === null ? null : nextThreshold - n,
  };
}

/**
 * Same rule as `initialsOf()` in the site's components/dashboard-nav.tsx, but by code point: the site's
 * `charAt(0)` cuts an emoji (or any letter outside the BMP) into a lone surrogate that renders as "�".
 */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return parts
    .slice(0, 2)
    .map((part) => (Array.from(part)[0] ?? '').toUpperCase())
    .join('');
}
