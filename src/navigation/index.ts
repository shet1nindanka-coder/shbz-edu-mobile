// Navigation of the app. Pure parts (`registry`, `targets`, `routes`, `tabs`) are importable from tests
// by their own paths; this barrel adds the React / expo-router half.
//
//   useAppNavigation()   open / push / replace / back / goHome / openFiles / openSettings …
//   useNavTarget(target) { canOpen, open } for notification, search and history targets
//   navigateTo(link, role)   imperative form (reminder taps)
//   useScreenFocused()       the screen is the focused one (joins, keep-awake)
//   useScreenLive()          focused AND the app is in the foreground (interval polling)
//   useStillHere()           () => still mounted and focused: ask it before navigating when a request ends
//   useRefetchOnFocus(queries, { always? })   refetch on return to the screen
export {
  navigateHome,
  navigateTo,
  useAppNavigation,
  useNavTarget,
  useRootStackKeeper,
  useScreenFocused,
  useTrackPosition,
  type AppNavigation,
} from './navigate';
export {
  EXTRA_ROUTES,
  canOpen,
  homeHref,
  hrefFor,
  hrefToPath,
  parseAppLink,
  planNavigation,
  positionOf,
  routeFor,
  type AppHref,
  type AppLink,
  type FileViewerFile,
  type NavigationPlan,
  type RouteDefinition,
  type RoutePlacement,
  type ScreenParams,
} from './routes';
export { LAUNCH_ROUTE, normalizeRootStack, sessionBottomRoute } from './root-stack';
export { RoleTabBar, type RoleTabBarProps } from './tab-bar';
export { useRefetchOnFocus, type FocusQuery, type RefetchOnFocusOptions } from './use-refetch-on-focus';
export { useScreenLive } from './use-screen-live';
export { useStillHere } from './use-still-here';
export { MORE_TAB_NAME, moreSections, navItemOf, navLabel, tabsForRole, type TabDefinition } from './tabs';
