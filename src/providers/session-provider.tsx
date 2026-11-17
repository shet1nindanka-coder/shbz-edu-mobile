import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { ApiProvider } from '@/api';
import { isApiError, isSessionExpired, type ApiError } from '@/api/errors';
import type { AuthenticatedUser, LoginRequest, UserRole } from '@/api/types';
import { clearViewerHandoff } from '@/navigation/viewer-handoff';
import { clearFileCache } from '@/services/files';
import { subscribeOnline } from '@/services/network';
import { clearOneShotNotices } from '@/services/notices';
import { localNotifications, registerRemotePush, unregisterRemotePush } from '@/services/notifications';
import { removePersistedQueries } from '@/services/query';
import { tokenStorage } from '@/services/session';

import { getPendingWrites, holdPendingWritesForExpiredSession, setPendingWritesUser } from './pending-writes';
import { getQueryClient } from './query';
import { getAppRuntime, getRequestLocale, setSessionErrorHandlers } from './services';

export type SessionStatus =
  /** Reading the stored token and asking `GET /me`. */
  | 'restoring'
  /** A token exists but the user could not be loaded (no connection on a first start). */
  | 'restoreFailed'
  | 'signedOut'
  | 'signedIn';

export type SignOutOptions = {
  /** Also delete the unsent writes of this device. Destructive: only after an explicit confirmation. */
  discardUnsentWrites?: boolean;
};

export type SessionValue = {
  status: SessionStatus;
  user: AuthenticatedUser | null;
  /** True when this session came from the stored token at start-up (the biometric lock applies to it). */
  restored: boolean;
  /** Shown on the login screen after a forced sign-out (`apiCommon.sessionExpired`, already localised). */
  notice: string | null;
  dismissNotice: () => void;
  /** Rejects with the `ApiError` of `POST /auth/login`; on success the role's tree replaces the auth stack. */
  signIn: (input: LoginRequest) => Promise<AuthenticatedUser>;
  /**
   * Deletes this session on the server (best effort) and everything it left on the device — except the
   * unsent writes (note drafts): they stay tied to this user (as after an expiry), are sent when the same
   * user signs in again and are dropped when another account signs in. Only `discardUnsentWrites: true`
   * deletes them; pass it only after the user confirmed losing them (Settings names them first).
   */
  signOut: (options?: SignOutOptions) => Promise<void>;
  /** After `PATCH /me`: the header and settings show the new name at once. */
  applyUser: (user: AuthenticatedUser) => void;
  /** After `POST /me/password`: the rotated token replaces the stored one. */
  applyRotatedToken: (token: string) => Promise<void>;
  /** Re-reads `GET /me` (after a 403: the role may have changed). */
  refreshUser: () => Promise<void>;
  /** `restoreFailed` only: try the stored token again. */
  retryRestore: () => void;
};

const SessionContext = createContext<SessionValue | null>(null);

type State = { status: SessionStatus; user: AuthenticatedUser | null; restored: boolean; notice: string | null };

const ROLE_REFRESH_MIN_INTERVAL_MS = 5000;

/**
 * Removes everything a session leaves on the device. NOT part of it: the interface preferences, and — in a
 * mock build — the files picked on this device (`local-file-store`): they are the mock server's storage,
 * so the teacher who signs in next still sees the photo the student handed in. Access to them is decided
 * by the mock backend per signed-in user; they go away with a reset of the demo dataset.
 */
async function clearSessionData(options: { keepPendingWrites: boolean }): Promise<void> {
  const runtime = getAppRuntime();
  runtime.setSessionToken(null);
  // Neither a forced expiry nor a plain sign-out (the lock screen's «use password», «sign in again» after a
  // failed start) is the user's choice to lose unsent drafts: they stay on the device, tied to their user,
  // and are sent when the same user signs in again (another account drops them). Only a sign-out that asked
  // first deletes them — the caller has to say so.
  const { keepPendingWrites } = options;
  if (!keepPendingWrites) setPendingWritesUser(null);
  getQueryClient().clear();
  clearViewerHandoff();
  clearOneShotNotices();
  try {
    clearFileCache();
  } catch {
    // The cache directory may not exist yet.
  }
  // `tokenStorage.clear()` falls back to overwriting the token and then to a signed-out marker that the
  // next start honours, so a sign-out never leaves a token that restores the session.
  await Promise.all([tokenStorage.clear(), runtime.sessionCache.clear(), keepPendingWrites ? Promise.resolve() : getPendingWrites().clear(), localNotifications.removeAll()]);
  // The cache in memory is empty already; its copy on disk is removed now, not left to the persister's
  // throttled write a second later. The removal is issued one tick after `clear()`: the persister answers
  // the first "query removed" event with an immediate write of a still half-full snapshot, and a removal
  // issued before that write would be undone by it.
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  await removePersistedQueries(runtime.storage);
}

type RestoreOutcome =
  /** No stored token. */
  | { kind: 'none' }
  /** `GET /me` answered. */
  | { kind: 'confirmed'; user: AuthenticatedUser }
  /** No answer, but the last known user is cached. */
  | { kind: 'cached'; user: AuthenticatedUser }
  /** The server no longer knows the token. */
  | { kind: 'expired'; message: string }
  /** No answer and nothing cached. */
  | { kind: 'failed'; message: string | null };

/** Start-up (docs/spec/01-shell-auth.md §1.1): read the stored token and ask `GET /me`. */
async function resolveStoredSession(): Promise<RestoreOutcome> {
  const runtime = getAppRuntime();
  // The queue of unsent writes is loaded together with the token, i.e. before any screen of a role tree
  // mounts: a note typed offline is in its field from the first frame, on every start path (also the
  // offline one, where nothing is flushed).
  const [token] = await Promise.all([tokenStorage.read(), getPendingWrites().hydrate()]);
  if (!token) return { kind: 'none' };
  runtime.setSessionToken(token);
  try {
    const { user } = await runtime.api.shell.getMe();
    return { kind: 'confirmed', user };
  } catch (error) {
    if (isSessionExpired(error)) {
      await clearSessionData({ keepPendingWrites: true });
      return { kind: 'expired', message: error.message };
    }
    const cached = await runtime.sessionCache.read();
    if (cached) return { kind: 'cached', user: cached };
    return { kind: 'failed', message: isApiError(error) ? error.message : null };
  }
}

/**
 * Owns the session (docs/spec/01-shell-auth.md §1.1, §4.1; 90-addendum-1 A.3): restores it at start,
 * signs in and out, and reacts centrally to `sessionExpired` (sign out + notice on the login screen) and
 * to role refusals (re-read `GET /me`). It also provides the guarded `ApiClient` to the tree.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const runtime = getAppRuntime();
  const [state, setState] = useState<State>({ status: 'restoring', user: null, restored: false, notice: null });
  // Callbacks that outlive a render (API guard, listeners) read the latest state from here.
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  /** The cached user is shown but `GET /me` has not confirmed it yet (offline cold start). */
  const unconfirmed = useRef(false);
  /** A sign-out is running: a `sessionExpired` answer to its own `logout` call is success, not a notice. */
  const signingOut = useRef(false);
  const lastRoleRefresh = useRef(0);
  /** The reconnect listener is registered once; it reaches the current `retryRestore` through this. */
  const retryRestoreRef = useRef<() => void>(() => undefined);

  const enter = useCallback((user: AuthenticatedUser, restored: boolean) => {
    setPendingWritesUser(user.id);
    setState({ status: 'signedIn', user, restored, notice: null });
    void getAppRuntime().sessionCache.write(user);
    void registerRemotePush({ locale: getRequestLocale() });
    // Drafts kept from an expired session of another account are never shown or sent to this one.
    void getPendingWrites().dropOtherUsers(user.id);
    void getPendingWrites().flush();
  }, []);

  const expire = useCallback((error: ApiError) => {
    // Several requests usually fail together; only the first one signs out.
    const { status } = stateRef.current;
    if (status === 'signedOut' || signingOut.current) return;
    stateRef.current = { ...stateRef.current, status: 'signedOut' };
    unconfirmed.current = false;
    holdPendingWritesForExpiredSession();
    void clearSessionData({ keepPendingWrites: true });
    setState({ status: 'signedOut', user: null, restored: false, notice: error.message });
  }, []);

  const refreshUser = useCallback(async () => {
    if (stateRef.current.status !== 'signedIn') return;
    try {
      const { user } = await getAppRuntime().api.shell.getMe();
      const wasUnconfirmed = unconfirmed.current;
      unconfirmed.current = false;
      const previous = stateRef.current.user;
      // Another role means another tree and other data: nothing cached for the old role may leak into it.
      if (previous && previous.role !== user.role) getQueryClient().clear();
      setPendingWritesUser(user.id);
      setState((current) => (current.status === 'signedIn' ? { ...current, user } : current));
      void getAppRuntime().sessionCache.write(user);
      // The server answers again after a start without an answer: send what was waiting.
      if (wasUnconfirmed) void getPendingWrites().flush();
    } catch (error) {
      if (isSessionExpired(error)) expire(error);
      // Any other failure keeps the current user; the next request reports for itself.
    }
  }, [expire]);

  const onRoleRefused = useCallback(() => {
    // A burst of 403s is one question to the server, not ten.
    const now = Date.now();
    if (now - lastRoleRefresh.current < ROLE_REFRESH_MIN_INTERVAL_MS) return;
    lastRoleRefresh.current = now;
    void refreshUser();
  }, [refreshUser]);

  // The client reports session-level errors to whoever is registered; that is this provider.
  useEffect(() => {
    setSessionErrorHandlers({ onSessionExpired: expire, onRoleRefused });
    return () => setSessionErrorHandlers(null);
  }, [expire, onRoleRefused]);

  const applyRestored = useCallback(
    (outcome: RestoreOutcome) => {
      switch (outcome.kind) {
        case 'none':
          setState({ status: 'signedOut', user: null, restored: false, notice: null });
          break;
        case 'confirmed':
          unconfirmed.current = false;
          enter(outcome.user, true);
          break;
        case 'cached':
          // No answer from the server: the last known user's tree opens on cached data; confirmed later.
          unconfirmed.current = true;
          setPendingWritesUser(outcome.user.id);
          setState({ status: 'signedIn', user: outcome.user, restored: true, notice: null });
          // `GET /me` got no answer, but the device may be online (a timeout, a server error): try the
          // waiting writes now; a failure without an answer re-tries them with backoff by itself.
          void getPendingWrites().dropOtherUsers(outcome.user.id);
          void getPendingWrites().flush();
          break;
        case 'expired':
          setState({ status: 'signedOut', user: null, restored: false, notice: outcome.message });
          break;
        case 'failed':
          setState({ status: 'restoreFailed', user: null, restored: false, notice: outcome.message });
          break;
      }
    },
    [enter],
  );

  useEffect(() => {
    let active = true;
    void resolveStoredSession().then((outcome) => {
      if (active) applyRestored(outcome);
    });
    return () => {
      active = false;
    };
  }, [applyRestored]);

  // Back online or back in the foreground: confirm an unconfirmed user and send what was waiting. A start
  // that failed for lack of a connection is tried again by itself.
  useEffect(() => {
    const onReachable = () => {
      if (stateRef.current.status === 'restoreFailed') {
        retryRestoreRef.current();
        return;
      }
      if (stateRef.current.status !== 'signedIn') return;
      if (unconfirmed.current) void refreshUser();
      void getPendingWrites().flush();
    };
    const unsubscribeOnline = subscribeOnline((online) => {
      if (online) onReachable();
    });
    const appState = AppState.addEventListener('change', (next) => {
      if (next === 'active') onReachable();
    });
    return () => {
      unsubscribeOnline();
      appState.remove();
    };
  }, [refreshUser]);

  const signIn = useCallback(
    async (input: LoginRequest) => {
      const response = await getAppRuntime().api.shell.login(input);
      // A previous user's cache must never be visible to the next one.
      getQueryClient().clear();
      getAppRuntime().setSessionToken(response.token);
      await tokenStorage.write(response.token);
      unconfirmed.current = false;
      enter(response.user, false);
      return response.user;
    },
    [enter],
  );

  const signOut = useCallback(async (options: SignOutOptions = {}) => {
    // Also from `restoreFailed` ("Sign in again" on the launch screen): the stored token is given up there.
    const discardUnsentWrites = options.discardUnsentWrites === true;
    const { status } = stateRef.current;
    if ((status !== 'signedIn' && status !== 'restoreFailed') || signingOut.current) return;
    signingOut.current = true;
    try {
      await unregisterRemotePush();
      await getAppRuntime().api.shell.logout();
    } catch {
      // Offline or already expired: the local sign-out still happens; the server session ends by its TTL.
    } finally {
      stateRef.current = { ...stateRef.current, status: 'signedOut' };
      unconfirmed.current = false;
      // Kept drafts — queued ones and those the editors flush as the tree unmounts — stay this user's.
      if (!discardUnsentWrites) holdPendingWritesForExpiredSession();
      await clearSessionData({ keepPendingWrites: !discardUnsentWrites });
      signingOut.current = false;
      setState({ status: 'signedOut', user: null, restored: false, notice: null });
    }
  }, []);

  const applyUser = useCallback((user: AuthenticatedUser) => {
    setState((current) => (current.status === 'signedIn' ? { ...current, user } : current));
    void getAppRuntime().sessionCache.write(user);
  }, []);

  const applyRotatedToken = useCallback(async (token: string) => {
    getAppRuntime().setSessionToken(token);
    await tokenStorage.write(token);
  }, []);

  const dismissNotice = useCallback(() => {
    setState((current) => (current.notice === null ? current : { ...current, notice: null }));
  }, []);

  const retryRestore = useCallback(() => {
    // One attempt at a time, and never over a sign-out that is clearing the stored token.
    if (stateRef.current.status !== 'restoreFailed' || signingOut.current) return;
    stateRef.current = { ...stateRef.current, status: 'restoring' };
    setState({ status: 'restoring', user: null, restored: false, notice: null });
    void resolveStoredSession().then(applyRestored);
  }, [applyRestored]);
  useEffect(() => {
    retryRestoreRef.current = retryRestore;
  }, [retryRestore]);

  const value = useMemo<SessionValue>(
    () => ({
      status: state.status,
      user: state.user,
      restored: state.restored,
      notice: state.notice,
      dismissNotice,
      signIn,
      signOut,
      applyUser,
      applyRotatedToken,
      refreshUser,
      retryRestore,
    }),
    [state, dismissNotice, signIn, signOut, applyUser, applyRotatedToken, refreshUser, retryRestore],
  );

  return (
    <SessionContext value={value}>
      <ApiProvider client={runtime.api}>{children}</ApiProvider>
    </SessionContext>
  );
}

/** The session: status, the signed-in user and the sign-in / sign-out actions. */
export function useSession(): SessionValue {
  const value = use(SessionContext);
  if (!value) throw new Error('useSession() must be called inside <SessionProvider>.');
  return value;
}

/** The signed-in user. Use only on screens of a role tree (they are mounted for signed-in users only). */
export function useCurrentUser(): AuthenticatedUser {
  const { user } = useSession();
  if (!user) throw new Error('useCurrentUser() was called on a screen that is reachable while signed out.');
  return user;
}

/** The current role, or null while signed out. */
export function useRole(): UserRole | null {
  return useSession().user?.role ?? null;
}
