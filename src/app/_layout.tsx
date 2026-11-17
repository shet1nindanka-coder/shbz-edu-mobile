// Root of the app (docs/spec/00-unified-contract.md §3.1):
//
//   RootNavigator
//   ├─ AuthStack ……… `index` (auth.launch) → `login` (auth.login)      no session
//   └─ RoleRoot ………… `(student)` | `(teacher)` | `(developer)`          chosen by user.role, never mixed
//      + root-level screens above the role's tree: `settings`, `notifications` (sheet),
//        `number-search` (modal), `file-viewer` (full screen), `demo` (mock builds)
//
// The guards make a role's tree unreachable for everyone else: a guarded route does not exist for the
// navigator, so there is no "access denied" screen and no bounce — the site's `requireUser` redirect has
// no visible equivalent here (90-addendum-2 B.7).
//
// `index` is only a redirect: `useRootStackKeeper` swaps it out as soon as something is above it, so the
// session's bottom route (the role tree, or `login`) is always the first route of this stack. The bottom
// routes also turn the iOS edge swipe off: there is nothing under them to swipe back to.
import { DarkTheme, DefaultTheme, Stack, ThemeProvider as NavigationThemeProvider } from 'expo-router';
import { useMemo } from 'react';

import { useRootStackKeeper } from '@/navigation';
import { AppProviders, IS_MOCK_BUILD, useSession } from '@/providers';
import { LaunchScreen, LockGate, ReminderOpener } from '@/screens/shell';
import { OfflineBannerHost } from '@/services/network';
import { useTheme } from '@/theme';

export { RouteErrorBoundary as ErrorBoundary } from '@/screens/shell';

export const unstable_settings = { anchor: 'index' };

export default function RootLayout() {
  return (
    <AppProviders>
      <RootNavigator />
    </AppProviders>
  );
}

function RootNavigator() {
  const theme = useTheme();
  const { status, user } = useSession();
  const role = status === 'signedIn' ? (user?.role ?? null) : null;
  // The role tree (or the login form) is the bottom of this stack: the launch route never stays under it,
  // so back / the edge swipe on a tab root leaves the app instead of rebuilding the role tree.
  useRootStackKeeper(role, status === 'signedIn' || status === 'signedOut');

  // Navigator backgrounds follow the app theme, so a transition never flashes white in dark mode.
  const navigationTheme = useMemo(() => {
    const base = theme.dark ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: theme.colors.accentSolid,
        background: theme.colors.pageBg,
        card: theme.colors.cardBg,
        text: theme.colors.textStrong,
        border: theme.colors.headerBorder,
        notification: theme.colors.dangerSolid,
      },
    };
  }, [theme]);

  // Until the stored session is resolved there is no navigator at all: the guards below are first
  // evaluated with the final role, so a deep entry (web reload, reminder tap) lands on its own screen.
  if (status === 'restoring' || status === 'restoreFailed') return <LaunchScreen />;

  const signedIn = role !== null;

  return (
    <NavigationThemeProvider value={navigationTheme}>
      <OfflineBannerHost>
        <LockGate>
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors.pageBg } }}>
            <Stack.Screen name="index" options={{ animation: 'none' }} />

            <Stack.Protected guard={!signedIn}>
              <Stack.Screen name="login" options={{ animation: 'fade', gestureEnabled: false }} />
            </Stack.Protected>

            <Stack.Protected guard={role === 'STUDENT'}>
              <Stack.Screen name="(student)" options={{ animation: 'fade', gestureEnabled: false }} />
            </Stack.Protected>
            <Stack.Protected guard={role === 'TEACHER'}>
              <Stack.Screen name="(teacher)" options={{ animation: 'fade', gestureEnabled: false }} />
            </Stack.Protected>
            <Stack.Protected guard={role === 'DEVELOPER'}>
              <Stack.Screen name="(developer)" options={{ animation: 'fade', gestureEnabled: false }} />
            </Stack.Protected>

            <Stack.Protected guard={signedIn}>
              <Stack.Screen name="settings" />
              {/* The sheet animates itself; its route only keeps the tabs visible underneath. */}
              <Stack.Screen
                name="notifications"
                options={{ presentation: 'transparentModal', animation: 'none', contentStyle: { backgroundColor: 'transparent' } }}
              />
              <Stack.Screen name="number-search" options={{ presentation: 'modal' }} />
              <Stack.Screen name="file-viewer" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
            </Stack.Protected>

            <Stack.Protected guard={IS_MOCK_BUILD}>
              <Stack.Screen name="demo" />
            </Stack.Protected>

            {/* Verification galleries of the design system and of the math renderer; not linked from the app. */}
            <Stack.Screen name="dev-ui" />
            <Stack.Screen name="dev-math" />
          </Stack>
          <ReminderOpener />
        </LockGate>
      </OfflineBannerHost>
    </NavigationThemeProvider>
  );
}
