/** What kind of sensor the prompt will use — picks the icon and the wording of the settings row. */
export type BiometricKind = 'fingerprint' | 'face' | 'iris' | 'generic';

export type BiometricAvailability =
  /** Ready: hardware present and at least one fingerprint / face enrolled. */
  | { status: 'available'; kind: BiometricKind }
  /** Hardware present, nothing enrolled — the user has to set it up in the device settings. */
  | { status: 'notEnrolled' }
  /** No sensor, or the platform has no biometric API (web). */
  | { status: 'unavailable' };

export type BiometricResult =
  | { ok: true }
  /** `cancelled` — the user backed out; `lockout` — too many attempts; `failed` — anything else. */
  | { ok: false; reason: 'cancelled' | 'lockout' | 'unavailable' | 'failed' };

export type BiometricPrompt = {
  /** Title of the system prompt. */
  promptMessage: string;
  /** Label of the cancel button (Android). */
  cancelLabel: string;
};
