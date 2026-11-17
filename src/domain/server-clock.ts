/**
 * The server clock, derived from a response (docs/spec/09-data-i18n-math.md §6.2 rule 6; 03 §5.3; 05 §4.8):
 * overdue badges, lesson windows, idle chips and "N min ago" are computed with the server's time, never
 * with the raw device time.
 *
 * A response carries `serverNow`; paired with the device time at which that response ARRIVED (the query's
 * `dataUpdatedAt`) it gives the error of the device clock. Pairing it with any later moment — the time of
 * a local cache patch, for one — would make the app's "server now" run behind by the age of the response,
 * which is why cached responses are patched with `mergeQueryData` (`@/services/query`).
 *
 * Pure: no React, no RN imports.
 */

/**
 * How far the server clock is ahead of the device clock, in ms: `serverNow` minus the device time at which
 * the response arrived. Unusable input (no `serverNow`, an unparsable one, no arrival time) → 0, i.e. the
 * device clock is used as is.
 */
export function serverClockOffset(serverNow: string | null | undefined, receivedAt: number): number {
  if (!serverNow || !(receivedAt > 0)) return 0;
  const offset = Date.parse(serverNow) - receivedAt;
  return Number.isFinite(offset) ? offset : 0;
}

/** "Now" on the server: the device time corrected by the offset of the response. */
export function correctedNow(serverNow: string | null | undefined, receivedAt: number, deviceNow: number): number {
  return deviceNow + serverClockOffset(serverNow, receivedAt);
}
