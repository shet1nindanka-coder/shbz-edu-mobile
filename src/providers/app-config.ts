/**
 * Build-level switches of the composition root.
 *
 * `IS_MOCK_BUILD` — the app runs on `MockApiClient` (the only implementation today). It gates what exists
 * only for demonstration: the "Demo data" screen, the demo-accounts helper on the login screen and the
 * "simulate offline" switch. When `HttpApiClient` exists, set `EXPO_PUBLIC_API_MODE=http` to build without
 * them.
 */
export const IS_MOCK_BUILD: boolean = process.env.EXPO_PUBLIC_API_MODE !== "http";
