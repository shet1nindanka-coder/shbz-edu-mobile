// The browser has no biometric API the app could rely on: the lock is reported as unavailable, the
// settings row is disabled and the gate never closes.
import type { BiometricAvailability, BiometricPrompt, BiometricResult } from './biometrics.types';

export async function getBiometricAvailability(): Promise<BiometricAvailability> {
  return { status: 'unavailable' };
}

// The prompt is unused here; the parameter keeps the signature identical to the native module.
export async function authenticateWithBiometrics(_prompt: BiometricPrompt): Promise<BiometricResult> {
  return { ok: false, reason: 'unavailable' };
}
