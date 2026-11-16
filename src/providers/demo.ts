/**
 * Access to the mock backend's controls for the "Demo data" screen and the demo-accounts helper of the
 * login screen (docs/spec/90-addendum-6.md §9). Screens never import `@/mock`; they get what a mock build
 * offers from here, and `null` in a build that talks to a real server.
 */
import { DEMO_PERSONAS, type DemoPersona, type MockApiClient } from '@/mock';

import { IS_MOCK_BUILD } from './app-config';
import { getAppRuntime } from './services';

export type { DemoPersona };
export type { ForcedError, ForcedPlanOutcome, MockControls, MockDatasetInfo, MockLimiterBucketInfo } from '@/mock';

/** The mock backend, or null when the build has none. */
export function getDemoBackend(): MockApiClient | null {
  return IS_MOCK_BUILD ? getAppRuntime().mock : null;
}

/** Demo accounts: which login shows which state. Empty outside mock builds. */
export function getDemoPersonas(): readonly DemoPersona[] {
  return IS_MOCK_BUILD ? DEMO_PERSONAS : [];
}

// ───────────────────────────── login prefill ─────────────────────────────

type Prefill = { login: string; password: string };

let prefill: Prefill | null = null;
const listeners = new Set<() => void>();

/** A persona was chosen on the demo screen: the login form picks the credentials up once. */
export function setLoginPrefill(value: Prefill): void {
  prefill = value;
  listeners.forEach((listener) => listener());
}

/** Takes the pending prefill (and clears it). */
export function takeLoginPrefill(): Prefill | null {
  const value = prefill;
  prefill = null;
  return value;
}

export function subscribeLoginPrefill(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
