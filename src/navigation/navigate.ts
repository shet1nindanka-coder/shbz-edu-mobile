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
import { router, useSegments, type Href } from 'expo-router';
import { useEffect, useMemo } from 'react';

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
  type AppHref,
  type AppLink,
  type FileViewerFile,
} from './routes';

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

/** Mount once inside the navigator: records where the user is for `navigateTo`. */
export function useTrackPosition(): void {
  const segments = useSegments() as string[];
  useEffect(() => {
    currentSegments = segments;
  }, [segments]);
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
    case 'tab':
      if (position === 'tabs') {
        // Select the tab, then return its stack to the root.
        router.navigate(toHref(plan.root));
        router.dismissAll();
      } else {
        // Pops everything above the tabs (settings, a sheet, a role-stack screen) and lands on the tab root.
        router.dismissTo(toHref(plan.root));
      }
      if (plan.replaceRoot) router.replace(toHref(plan.replaceRoot));
      // `withAnchor`: a stack that is not mounted yet is created as [its list, the detail], never the
      // detail alone. A mounted stack already has its list and simply gets the detail on top.
      if (plan.detail) router.push(toHref(plan.detail), { withAnchor: true });
      break;
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
    router.navigate(home);
    router.dismissAll();
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
        const href = hrefFor({ screen: 'shared.fileViewer', files, ...options }, role);
        if (href) router.push(toHref(href));
      },
      openDemoData: () => router.push(toHref({ pathname: EXTRA_ROUTES.demoData })),
      openTeacherMore: () => {
        if (positionOf(currentSegments) === 'tabs') {
          router.navigate(toHref({ pathname: EXTRA_ROUTES.teacherMore }));
          router.dismissAll();
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
