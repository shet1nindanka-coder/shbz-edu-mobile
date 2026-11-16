/**
 * REMOTE PUSH — THE ONE INTEGRATION POINT.
 *
 * Remote push is impossible on the mock backend (there is no server to send it) and `ApiClient` v1 has no
 * method for it (docs/spec/00-unified-contract.md §2.2 "Client status"). When the real server exists:
 *
 * 1. `ShellApi` gains `registerDevice(input: PushDeviceRequest)` and `unregisterDevice(pushToken)`
 *    (`POST /devices`, `DELETE /devices/{pushToken}`; 112 → 114 methods).
 * 2. `registerRemotePush` obtains the device token (`Notifications.getDevicePushTokenAsync()` in a
 *    development build — Expo Go cannot receive remote push) and calls `registerDevice` with the platform
 *    and the interface language.
 * 3. `unregisterRemotePush` calls `unregisterDevice` BEFORE `POST /auth/logout`.
 *
 * The session provider already calls both functions at the right moments (after a successful sign-in or
 * session restore; before logout), so nothing else has to change. A tap on a remote push carries the same
 * `NavTarget` as the bell row and goes through `navigateTo` like a local reminder does.
 */
import type { Locale } from "@/api/types";

export type RemotePushRegistration =
  /** No push service is wired in this build. */
  | { status: "unsupported" }
  | { status: "registered"; pushToken: string };

export type RemotePushContext = { locale: Locale };

/** Called after sign-in / session restore. A no-op until the server supports push. */
// The context is unused until the integration lands; the parameter fixes the call site's shape.
export async function registerRemotePush(_context: RemotePushContext): Promise<RemotePushRegistration> {
  return { status: "unsupported" };
}

/** Called before logout. A no-op until the server supports push. */
export async function unregisterRemotePush(): Promise<void> {
  // Intentionally empty — see the header.
}
