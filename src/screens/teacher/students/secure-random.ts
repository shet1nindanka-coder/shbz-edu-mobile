import * as Crypto from 'expo-crypto';

/**
 * Cryptographically random index in `[0, maxExclusive)` for `generatePasswordFromName`: a suggested
 * password becomes a real one, so the domain helper's `Math.random` fallback must not be used on a device.
 * The modulo bias on alphabets of at most 14 symbols is negligible (same note as on the site).
 */
export function secureRandomInt(maxExclusive: number): number {
  const buffer = Crypto.getRandomValues(new Uint32Array(1));
  return (buffer[0] ?? 0) % maxExclusive;
}
