/**
 * Small input-validation helpers shared by the mock members. A mock method receives typed arguments, but —
 * like a server — it must not trust them: screens can pass anything a text field or a route param held.
 * The field rules themselves (names, logins, passwords, numbers, uploads) are the ported domain helpers.
 */
import type { IsoDateTime } from "@/api/types";

export interface MockValidation {
  /** A trimmed non-empty string, or null (also for a non-string value). */
  text(value: unknown): string | null;
  /** A trimmed string cut to `maxLength`, "" for a non-string value. */
  clip(value: unknown, maxLength: number): string;
  /** An id-like value: a trimmed non-empty string, or null. */
  id(value: unknown): string | null;
  /** Unique non-empty trimmed strings of an array (anything else → an empty list). */
  ids(value: unknown): string[];
  /** A request instant: an `IsoDateTime` that parses to a finite date, normalised with `toISOString()`; else null. */
  instant(value: unknown): IsoDateTime | null;
  /** An integer inside [min, max], or null. Accepts a number or a numeric string. */
  integer(value: unknown, min: number, max: number): number | null;
  /** An integer clamped into [min, max]; `fallback` when the value is not a finite number (how the site clamps settings). */
  clampInteger(value: unknown, min: number, max: number, fallback: number): number;
  /** True when the value is one of the allowed literals (enum membership). */
  oneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T;
  /** Digits only, 1..`maxDigits` of them (number search, number routes). */
  digits(value: unknown, maxDigits: number): string | null;
}

export const validation: MockValidation = {
  text(value) {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  },
  clip(value, maxLength) {
    return typeof value === "string" ? value.trim().slice(0, Math.max(0, maxLength)) : "";
  },
  id(value) {
    return validation.text(value);
  },
  ids(value) {
    if (!Array.isArray(value)) return [];
    const result: string[] = [];
    for (const entry of value) {
      const id = validation.text(entry);
      if (id && !result.includes(id)) result.push(id);
    }
    return result;
  },
  instant(value) {
    if (typeof value !== "string" || !value.trim()) return null;
    const time = new Date(value).getTime();
    return Number.isFinite(time) ? new Date(time).toISOString() : null;
  },
  integer(value, min, max) {
    const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
    return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : null;
  },
  clampInteger(value, min, max, fallback) {
    const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, Math.round(parsed)));
  },
  oneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
    return typeof value === "string" && (allowed as readonly string[]).includes(value);
  },
  digits(value, maxDigits) {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return /^\d+$/.test(trimmed) && trimmed.length <= maxDigits ? trimmed : null;
  },
};
