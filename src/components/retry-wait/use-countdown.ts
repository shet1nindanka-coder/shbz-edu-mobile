import { useCallback, useSyncExternalStore } from 'react';

import type { Locale } from '@/api/types';
import { plural } from '@/lib/i18n/format';

/**
 * Whole seconds from `nowMs` to `until` (both epoch ms), rounded up; 0 when the moment has passed.
 *
 * The difference is taken in milliseconds and rounded once. Rounding each end to a second first made the
 * first tick one second too long whenever the wait started between two seconds: 420 s showed as 421, i.e.
 * "8 minutes" under a server notice that says 7. Rounding up (not down) keeps the control locked until the
 * wait is really over.
 */
export function secondsLeft(until: number | null, nowMs: number): number {
  return until === null ? 0 : Math.max(0, Math.ceil((until - nowMs) / 1000));
}

/** Re-renders subscribers once a second while something is counting down. */
function subscribeToSeconds(notify: () => void): () => void {
  const timer = setInterval(notify, 1000);
  return () => clearInterval(timer);
}

function subscribeToNothing(): () => void {
  return () => undefined;
}

/**
 * Seconds left until `until` (epoch ms), re-rendering once a second; 0 when the moment has passed or
 * `until` is null. Used to keep a control disabled for `retryAfterSeconds` (90-addendum-1 A.3 rule 3).
 */
export function useCountdown(until: number | null): number {
  // The clock is an external store: no ticking at all while nothing counts down. The snapshot is the
  // remaining whole seconds, which changes once a second — the ticks only make React read it again.
  const read = useCallback(() => secondsLeft(until, Date.now()), [until]);
  return useSyncExternalStore(until === null ? subscribeToNothing : subscribeToSeconds, read, read);
}

/** Plural forms of a wait: seconds from the mobile overlay, minutes from the site dictionary. */
export type WaitForms = { secondForms: readonly string[]; minuteForms: readonly string[] };

/** «2 минуты» / «45 секунд»: whole minutes (rounded up) from a minute on, seconds below. */
export function formatWait(seconds: number, locale: Locale, forms: WaitForms): string {
  return seconds >= 60 ? plural(locale, Math.ceil(seconds / 60), forms.minuteForms) : plural(locale, Math.max(1, seconds), forms.secondForms);
}
