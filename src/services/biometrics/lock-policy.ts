/**
 * When the biometric lock closes (pure rules; the device calls live in `biometrics.ts`).
 *
 * - Cold start with a restored session → locked.
 * - Return from the background → locked only after the grace period, so a glance at another app (the
 *   camera for a solution photo, the share sheet, the OS permission prompt) does not ask again.
 */

/** How long the app may stay in the background without asking for the fingerprint / face again. */
export const BIOMETRIC_GRACE_MS = 60_000;

export type LockInput = {
  /** The user switched the lock on in settings. */
  enabled: boolean;
  /** The device can authenticate right now (hardware present and something enrolled). */
  available: boolean;
  signedIn: boolean;
};

/** Whether a lock applies at all. Without enrolled biometrics the switch is ignored rather than locking the user out. */
export function isLockActive({ enabled, available, signedIn }: LockInput): boolean {
  return enabled && available && signedIn;
}

/** Lock state right after a cold start with a restored session. */
export function shouldLockOnLaunch(input: LockInput): boolean {
  return isLockActive(input);
}

/** Lock state when the app becomes active again; `backgroundedAt` is null when it never left the foreground. */
export function shouldLockOnResume(
  input: LockInput,
  backgroundedAt: number | null,
  now: number,
  graceMs: number = BIOMETRIC_GRACE_MS,
): boolean {
  if (!isLockActive(input) || backgroundedAt === null) return false;
  // A clock that went backwards must not unlock the app.
  const away = now - backgroundedAt;
  return away < 0 || away >= graceMs;
}
