// Biometric unlock through expo-local-authentication (works in Expo Go; on iOS, Expo Go itself falls back
// to the device passcode because Face ID needs the app's own usage string). Metro picks
// `biometrics.web.ts` on web, where the feature does not exist.
import * as LocalAuthentication from 'expo-local-authentication';

import type { BiometricAvailability, BiometricKind, BiometricPrompt, BiometricResult } from './biometrics.types';

function kindOf(types: LocalAuthentication.AuthenticationType[]): BiometricKind {
  if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) return 'face';
  if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) return 'fingerprint';
  if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) return 'iris';
  return 'generic';
}

/** Whether the lock can be offered right now. Never throws. */
export async function getBiometricAvailability(): Promise<BiometricAvailability> {
  try {
    if (!(await LocalAuthentication.hasHardwareAsync())) return { status: 'unavailable' };
    if (!(await LocalAuthentication.isEnrolledAsync())) return { status: 'notEnrolled' };
    return { status: 'available', kind: kindOf(await LocalAuthentication.supportedAuthenticationTypesAsync()) };
  } catch {
    return { status: 'unavailable' };
  }
}

/** Shows the system prompt. The device passcode stays available as the OS-level fallback. */
export async function authenticateWithBiometrics(prompt: BiometricPrompt): Promise<BiometricResult> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: prompt.promptMessage,
      cancelLabel: prompt.cancelLabel,
      disableDeviceFallback: false,
    });
    if (result.success) return { ok: true };
    switch (result.error) {
      case 'user_cancel':
      case 'system_cancel':
      case 'app_cancel':
      case 'user_fallback':
        return { ok: false, reason: 'cancelled' };
      case 'lockout':
        return { ok: false, reason: 'lockout' };
      case 'not_enrolled':
      case 'not_available':
      case 'passcode_not_set':
        return { ok: false, reason: 'unavailable' };
      default:
        return { ok: false, reason: 'failed' };
    }
  } catch {
    return { ok: false, reason: 'failed' };
  }
}
