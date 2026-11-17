/**
 * Navigation by link — the React / expo-router half of `routes.ts`.
 *
 *   const nav = useAppNavigation();
 *   nav.open({ screen: "student.homework", assignmentId });   // smart: switches tab, pushes over the list
 *   nav.push({ screen: "content.topic", topicId });           // plain push in the current stack
 *   nav.replace({ screen: "planner.drafts" });                // segment switch, "after delete" redirects
 *   nav.back();                                               // back, or the role home when there is no history
 *
 *   const target = useNavTarget(notification.target);         // { canOpen, open }
 *   canOpen ? <ListRow onPress={open} …/> : <Text>…</Text>    // not registered for the role → plain text
 *
 * Screens never build paths themselves and never import `expo-router` for navigation.
 */
import { router, useIsFocused, useNavigationContainerRef, useSegments, type Href } from 'expo-router';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';

import type { NavTarget, UserRole } from '@/api/types';
import { useRole } from '@/providers/session-provider';

import {
  EXTRA_ROUTES,
  OVERLAY_SEGMENTS,
  canOpen,
  homeHref,
  hrefFor,
  planNavigation,
  positionOf,
  tabLandingHref,
  type AppHref,
  type AppLink,
  type FileViewerFile,
} from './routes';
import { normalizeRootStack, type RootStackState } from './root-stack';
import { tabsForRole } from './tabs';
import { handOverViewerFiles } from './viewer-handoff';

/**
 * The one place an `AppHref` becomes an expo-router `Href`. Patterns come from the route table, which a
 * unit test checks against the files under `src/app`; typed routes cannot follow that indirection.
 */
function toHref(href: AppHref): Href {
  return href as Href;
}

/**
 * Segments of the focused route, kept current by `useTrackPosition()` (mounted once by the root layout).
 * The imperative `navigateTo` needs them to choose between "switch tab" and "dismiss down to the tabs".
 */
let currentSegments: readonly string[] = [];

/** The part of a navigation state that `tabIsAboveItsRoot` reads. */
type NavState = { key?: string; type?: string; index?: number; routes?: readonly { key?: string; name: string; state?: NavState }[] };

/** Reads the whole navigation tree at call time; installed by `useTrackPosition()`. */
let readRootState: () => NavState | null = () => null;

/** Mount once inside the navigator: records where the user is for `navigateTo`. */
export function useTrackPosition(): void {
  const segments = useSegments() as string[];
  const container = useNavigationContainerRef();
  useEffect(() => {
    currentSegments = segments;
  }, [segments]);
  useEffect(() => {
    readRootState = () => (container.isReady() ? (container.getRootState() as unknown as NavState) : null);
    return () => {
      readRootState = () => null;
    };
  }, [container]);
}

/** The stack of the tab whose root is `root`, as it is now; null when that tab has not been created yet. */
function tabStackOf(root: AppHref, role: UserRole): NavState | null {
  const tab = tabsForRole(role).find((candidate) => {
    const href = candidate.section === 'more' ? { pathname: EXTRA_ROUTES.teacherMore } : hrefFor({ screen: candidate.section } as AppLink, role);
    return href?.pathname === root.pathname;
  });
  if (!tab) return null;
  // The role's tab navigator: on the focused branch while the tabs are on screen, under the role-stack
  // screen or the overlay otherwise (there is one tab navigator per role tree).
  const findTabs = (state: NavState | null | undefined): NavState | null => {
    if (!state) return null;
    if (state.type === 'tab') return state;
    const routes = state.routes ?? [];
    const focused = routes[state.index ?? 0];
    for (const route of [focused, ...routes.filter((candidate) => candidate !== focused)]) {
      const found = findTabs(route?.state);
      if (found) return found;
    }
    return null;
  };
  return findTabs(readRootState())?.routes?.find((route) => route.name === tab.name)?.state ?? null;
}

/**
 * Whether the tab whose root is `root` currently holds screens above its first one, i.e. whether
 * `router.dismissAll()` after selecting that tab has something to pop INSIDE the tab.
 *
 * `dismissAll` is a POP_TO_TOP for the focused stack; a stack that is already on its first screen does not
 * handle it and the action bubbles up to the root stack, which must not be popped (it holds the role tree
 * at its bottom, `useRootStackKeeper`). The pop is therefore sent only when the tab can take it.
 */
function tabIsAboveItsRoot(root: AppHref, role: UserRole): boolean {
  const stack = tabStackOf(root, role);
  if (!stack) return false;
  return (stack.index ?? (stack.routes?.length ?? 1) - 1) > 0;
}

/**
 * The href that selects the tab of `root` without pushing inside it: for a tab with segments (the teacher's
 * «занятия») the segment that is the bottom of its stack now — navigating to the other one would push a
 * second list over it (back would then walk between segments, 90-addendum-2 N1).
 */
function tabLanding(root: AppHref, role: UserRole): AppHref {
  return tabLandingHref(root, tabStackOf(root, role)?.routes?.[0]?.name);
}

/** The root layout's stack inside the container state (expo-router wraps it in a `__root` route). */
function rootStackOf(state: NavState | null): NavState | null {
  if (!state) return null;
  const only = state.routes?.length === 1 ? state.routes[0] : undefined;
  return only?.name === '__root' ? (only.state ?? null) : state;
}

/**
 * Mount once in the root layout: keeps the launch route from staying under the session's screens (see
 * `root-stack.ts`). `mounted` = the root stack navigator is rendered (the session is resolved): before
 * that the container only holds the state built from the start URL, which no navigator could change.
 * Runs on every navigation state change and when the role changes (sign-in, sign-out). Routes that stay
 * keep their keys, so nothing that is on screen remounts.
 */
export function useRootStackKeeper(role: UserRole | null, mounted: boolean): void {
  const container = useNavigationContainerRef();
  // Read when the check runs, not when it was scheduled: the state event of a sign-in can arrive before
  // this effect re-subscribes with the new role.
  const roleRef = useRef(role);
  useLayoutEffect(() => {
    roleRef.current = role;
  }, [role]);
  useEffect(() => {
    if (!mounted) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const check = () => {
      timer = null;
      if (!container.isReady()) return;
      const stack = rootStackOf(container.getRootState() as unknown as NavState);
      if (!stack?.key || !stack.routes) return;
      const next = normalizeRootStack(
        { index: stack.index ?? stack.routes.length - 1, routes: stack.routes as RootStackState['routes'] },
        roleRef.current,
      );
      if (!next) return;
      container.dispatch({ type: 'RESET', payload: { ...stack, index: next.index, routes: next.routes }, target: stack.key });
    };
    // Not inside the state event itself: the navigator may still be rendering the state that triggered it
    // (and the role of a sign-in is only known once that render is committed). A frame later is invisible:
    // the launch route is under other screens. One pending check at a time: it reads the latest state.
    const schedule = () => {
      if (timer === null) timer = setTimeout(check, 0);
    };
    schedule();
    const unsubscribe = container.addListener('state', schedule);
    return () => {
      if (timer !== null) clearTimeout(timer);
      unsubscribe();
    };
  }, [container, role, mounted]);
}

/**
 * Opens `link` for `role` following its placement rule (see the header of `routes.ts`).
 * Returns false — and does nothing — when the role cannot open it.
 *
 * expo-router facts this relies on (verified on the web export): calls are applied in order, each against
 * the state the previous one produced; `dismissTo` pops stacks but cannot switch a tab; `navigate` switches
 * a tab but pushes inside a stack; `dismissAll` returns the focused stack to its first screen; a navigator
 * that has never been shown is created from the href alone, so its list must come from `withAnchor`.
 */
export function navigateTo(link: AppLink, role: UserRole): boolean {
  const plan = planNavigation(link, role);
  if (!plan) return false;
  const position = positionOf(currentSegments);
  const overlayOpen = OVERLAY_SEGMENTS.includes(currentSegments[0] ?? '');

  switch (plan.kind) {
    case 'tab': {
      // The root the tab's stack has now (a segmented tab may start with either segment).
      const landing = tabLanding(plan.root, role);
      if (position === 'tabs') {
        // Select the tab, then return its stack to the root.
        const deep = tabIsAboveItsRoot(plan.root, role);
        router.navigate(toHref(landing));
        if (deep) router.dismissAll();
      } else {
        // Pops everything above the tabs (settings, a sheet, a role-stack screen) and lands on the tab root.
        router.dismissTo(toHref(landing));
      }
      // Then the root the link asks for replaces the one that is there (a segment switch), never pushed.
      const wanted = plan.replaceRoot ?? plan.root;
      if (wanted.pathname !== landing.pathname) router.replace(toHref(wanted));
      // `withAnchor`: a stack that is not mounted yet is created as [its list, the detail], never the
      // detail alone. A mounted stack already has its list and simply gets the detail on top.
      if (plan.detail) router.push(toHref(plan.detail), { withAnchor: true });
      break;
    }
    case 'stack':
      // A sheet or modal must not stay under the screen it leads to.
      if (overlayOpen && router.canGoBack()) router.back();
      router.push(toHref(plan.href));
      break;
    case 'overlay':
      router.push(toHref(plan.href));
      break;
  }
  return true;
}

/** Resets to the role's first tab from anywhere. */
export function navigateHome(role: UserRole): void {
  const home = toHref(homeHref(role));
  if (positionOf(currentSegments) === 'tabs') {
    const deep = tabIsAboveItsRoot(homeHref(role), role);
    router.navigate(home);
    if (deep) router.dismissAll();
  } else {
    router.dismissTo(home);
  }
}

export type AppNavigation = {
  /** The current role can open this link (false → render plain text, A2 B.2). */
  canOpen: (link: AppLink | null | undefined) => boolean;
  /** Smart navigation by placement; false when the role cannot open the link. */
  open: (link: AppLink) => boolean;
  /** Plain push in the current stack (list → detail inside one tab). */
  push: (link: AppLink) => boolean;
  /** Replaces the current screen (segment switches, "after create / delete" redirects). */
  replace: (link: AppLink) => boolean;
  /** Back; falls back to the role home when there is nothing to go back to (web reload, deep entry). */
  back: () => void;
  /** Resets to the role's first tab ("home" buttons of error and not-found states). */
  goHome: () => void;
  openSettings: () => void;
  openNotifications: () => void;
  openNumberSearch: () => void;
  /** Opens the full-screen file viewer on `files` (photos of one set, or a single document). */
  openFiles: (files: FileViewerFile[], options?: { initialIndex?: number; title?: string }) => void;
  /** Mock builds only. */
  openDemoData: () => void;
  /** The teacher's «ещё» list. */
  openTeacherMore: () => void;
};

/**
 * Whether the screen that calls it is the focused one. A tab scene and the screens under a pushed one stay
 * mounted; polling, the lesson "join" call and refetch-on-focus must follow focus, not mounting
 * (docs/spec/03-student-homework-lesson.md, mobile notes of H2 and L1; 00 §2.3 "refetch on focus").
 */
export function useScreenFocused(): boolean {
  return useIsFocused();
}

/** Navigation helpers bound to the current role. */
export function useAppNavigation(): AppNavigation {
  const role = useRole();

  return useMemo<AppNavigation>(() => {
    const withHref = (link: AppLink, action: (href: Href) => void): boolean => {
      if (role === null || !canOpen(link, role)) return false;
      const href = hrefFor(link, role);
      if (!href) return false;
      action(toHref(href));
      return true;
    };
    const goHome = () => {
      if (role === null) router.replace('/' as Href);
      else navigateHome(role);
    };
    return {
      canOpen: (link) => role !== null && canOpen(link, role),
      open: (link) => role !== null && navigateTo(link, role),
      push: (link) => withHref(link, (href) => router.push(href)),
      replace: (link) => withHref(link, (href) => router.replace(href)),
      back: () => {
        if (router.canGoBack()) router.back();
        else goHome();
      },
      goHome,
      openSettings: () => router.push(toHref({ pathname: '/settings' })),
      openNotifications: () => router.push(toHref({ pathname: '/notifications' })),
      openNumberSearch: () => router.push(toHref({ pathname: '/number-search' })),
      openFiles: (files, options) => {
        if (role === null || files.length === 0) return;
        const href = hrefFor({ screen: 'shared.fileViewer', files, initialIndex: options?.initialIndex }, role);
        if (!href) return;
        // Downloaded documents and the title go to the viewer in memory; the URL carries file references only.
        handOverViewerFiles(files, options?.title);
        router.push(toHref(href));
      },
      openDemoData: () => router.push(toHref({ pathname: EXTRA_ROUTES.demoData })),
      openTeacherMore: () => {
        if (positionOf(currentSegments) === 'tabs') {
          const deep = role !== null && tabIsAboveItsRoot({ pathname: EXTRA_ROUTES.teacherMore }, role);
          router.navigate(toHref({ pathname: EXTRA_ROUTES.teacherMore }));
          if (deep) router.dismissAll();
        } else {
          router.dismissTo(toHref({ pathname: EXTRA_ROUTES.teacherMore }));
        }
      },
    };
  }, [role]);
}

/**
 * A notification / search / history target for the current role (00 §3.3). `canOpen === false` means
 * the screen is not registered for this role: render the row as plain text, never as a tappable element.
 */
export function useNavTarget(target: NavTarget | null | undefined): { canOpen: boolean; open: () => void } {
  const navigation = useAppNavigation();
  const available = navigation.canOpen(target);
  return useMemo(
    () => ({
      canOpen: available,
      open: () => {
        if (target) navigation.open(target);
      },
    }),
    [available, navigation, target],
  );
}
