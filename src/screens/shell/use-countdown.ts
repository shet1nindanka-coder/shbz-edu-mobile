import { useSyncExternalStore } from 'react';

import type { Locale } from '@/api/types';
import { plural } from '@/lib/i18n/format';

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
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
  // The clock is an external store: no ticking at all while nothing counts down.
  const now = useSyncExternalStore(until === null ? subscribeToNothing : subscribeToSeconds, nowSeconds, nowSeconds);
  return until === null ? 0 : Math.max(0, Math.ceil(until / 1000) - now);
}

/** «2 минуты» / «45 секунд»: whole minutes (rounded up) from a minute on, seconds below. */
export function formatWait(
  seconds: number,
  locale: Locale,
  forms: { secondForms: readonly string[]; minuteForms: readonly string[] },
): string {
  return seconds >= 60 ? plural(locale, Math.ceil(seconds / 60), forms.minuteForms) : plural(locale, Math.max(1, seconds), forms.secondForms);
}
