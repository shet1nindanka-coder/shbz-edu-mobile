/**
 * The bottom of the root stack (00 §3.1: RoleRoot REPLACES the auth stack, it does not sit above it).
 *
 * The launch route (`index`, the root anchor) only redirects. It stays in the stack underneath whatever it
 * redirected to — after a sign-in `[launch, role tree]`, after a sign-out `[launch, login]`, after a deep
 * entry `[launch, overlay]` — and once it is focused again (Android back or the iOS edge swipe on a tab
 * root, `router.back()` from an overlay) its redirect builds a NEW role tree: every tab remounts and loses
 * its state, and a screen pushed right after the back is replaced by the role's home.
 *
 * `normalizeRootStack` says how to fix such a stack: a launch route that is not the focused one is swapped
 * for the session's own bottom route (the role tree, or `login` when signed out), or dropped when that route
 * is already in the stack. Pure: `navigate.ts` applies the result to the live navigation state.
 */
import type { UserRole } from "@/api/types";

/** Route name of the launch redirect (`src/app/index.tsx`). */
export const LAUNCH_ROUTE = "index";

/** Root routes that exist without a session (the guards of `src/app/_layout.tsx`). */
const SIGNED_OUT_ROUTES: readonly string[] = [LAUNCH_ROUTE, "login", "demo", "dev-ui", "dev-math", "+not-found"];

export type RootStackRoute = { key?: string; name: string; params?: object; state?: unknown };
export type RootStackState = { index: number; routes: readonly RootStackRoute[] };

/** The route that must be the bottom of the root stack for the session: the role tree, or the login form. */
export function sessionBottomRoute(role: UserRole | null): string {
  if (role === "STUDENT") return "(student)";
  if (role === "TEACHER") return "(teacher)";
  if (role === "DEVELOPER") return "(developer)";
  return "login";
}

/**
 * The root stack without a launch route under other screens; null when nothing has to change (no launch
 * route, or the launch route is the focused one and is about to redirect).
 */
export function normalizeRootStack(
  state: RootStackState,
  role: UserRole | null,
): RootStackState | null {
  const stale = state.routes.some((route, index) => route.name === LAUNCH_ROUTE && index !== state.index);
  if (!stale) return null;
  const bottom = sessionBottomRoute(role);
  // The bottom route of another session state is still there: the guards are swapping the trees (sign-in,
  // sign-out) and the launch route is about to redirect; act on the settled stack only.
  // The same while the role this was called with lags behind the guards: a signed-out stack never holds a
  // signed-in screen (settings, sheets, modals).
  const others = ["login", "(student)", "(teacher)", "(developer)"].filter((name) => name !== bottom);
  if (state.routes.some((route) => others.includes(route.name))) return null;
  if (role === null && state.routes.some((route) => !SIGNED_OUT_ROUTES.includes(route.name))) return null;
  let hasBottom = state.routes.some((route) => route.name === bottom);
  const routes: RootStackRoute[] = [];
  let focused = 0;
  state.routes.forEach((route, index) => {
    if (route.name === LAUNCH_ROUTE && index !== state.index) {
      if (hasBottom) return;
      // Created without state (the role tree starts on its own home, exactly like a cold start) and without
      // a key: the stack router mints one.
      routes.push({ name: bottom });
      hasBottom = true;
    } else {
      routes.push(route);
    }
    if (index === state.index) focused = routes.length - 1;
  });
  return { index: focused, routes };
}
