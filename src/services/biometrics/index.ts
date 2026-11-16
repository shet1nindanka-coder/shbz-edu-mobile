// Biometric lock: device calls (`getBiometricAvailability`, `authenticateWithBiometrics`) and the pure
// lock rules. The gate component that uses them lives in `@/providers`.
export { authenticateWithBiometrics, getBiometricAvailability } from './biometrics';
export type { BiometricAvailability, BiometricKind, BiometricPrompt, BiometricResult } from './biometrics.types';
export { BIOMETRIC_GRACE_MS, isLockActive, shouldLockOnLaunch, shouldLockOnResume, type LockInput } from './lock-policy';
