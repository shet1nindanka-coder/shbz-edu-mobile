// Session plumbing: secure token storage, the cached user for offline cold starts, and the API guard that
// reports `sessionExpired` / role refusals. The session itself (`useSession`) lives in `@/providers`.
export { guardApiClient, type SessionErrorHandlers } from './guard-api-client';
export { SESSION_USER_KEY, createSessionCache, parseCachedUser, type SessionCache } from './session-cache';
export { tokenStorage } from './token-storage';
export type { TokenStorage } from './token-storage.types';
