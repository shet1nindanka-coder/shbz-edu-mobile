import type { ErrorBoundaryProps } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { I18nProvider, useI18n } from '@/i18n';
import { useAppNavigation } from '@/navigation';
import { useSession } from '@/providers';
import { getInterfaceSnapshot } from '@/services/preferences';
import { ThemeProvider, makeStyles } from '@/theme';
import { ErrorState } from '@/ui';

/**
 * Error shell of a route (docs/spec/01-shell-auth.md §1.6): shown when a screen throws while rendering.
 * "Try again" re-mounts the route; "Home" resets to the role's first tab. Every route file re-exports it
 * as `ErrorBoundary`, so one broken screen never takes the tab bar or the other screens down.
 *
 * Not for the root layout: its boundary sits outside `AppProviders` (expo-router wraps the layout itself),
 * where `useSession` / `useAppNavigation` throw — see `RootErrorBoundary`.
 */
export function RouteErrorBoundary({ retry }: ErrorBoundaryProps) {
  const { status } = useSession();
  const navigation = useAppNavigation();
  return <ErrorShell signedIn={status === 'signedIn'} retry={retry} onHome={navigation.goHome} />;
}

/**
 * Error shell of the root layout: a render error in anything above the routes (the providers, the lock,
 * the offline strip, the root stack). expo-router renders this boundary in place of `RootLayout`, so no
 * provider of the app is mounted (one of them may be what threw). The shell brings its own theme and
 * language providers, fed from the module-level copy of the user's choice (`getInterfaceSnapshot`, ru /
 * system until the preferences have loaded; `system` follows the OS scheme), and the safe-area provider
 * of `ExpoRoot`. "Try again" mounts the providers again; `onHome` comes from the route file (no session,
 * no `useAppNavigation`).
 */
export function RootErrorBoundary({ retry, onHome }: ErrorBoundaryProps & { onHome: (retry: () => Promise<void>) => void }) {
  const { locale, themeMode } = getInterfaceSnapshot();
  return (
    <ThemeProvider mode={themeMode}>
      <I18nProvider locale={locale} onChangeLocale={ignoreLocaleChange}>
        {/* The session is unknown here (its provider is gone): the generic texts, not the login form's. */}
        <ErrorShell signedIn retry={retry} onHome={() => onHome(retry)} />
      </I18nProvider>
    </ThemeProvider>
  );
}

/** Nobody owns the preference while the providers are down: the shell has no language switch anyway. */
function ignoreLocaleChange(): void {}

function ErrorShell({ signedIn, retry, onHome }: { signedIn: boolean; retry: () => Promise<void>; onHome: () => void }) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { dict } = useI18n();
  const [retrying, setRetrying] = useState(false);

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]} testID="route-error">
      <ErrorState
        title={signedIn ? dict.shells.errorTitle : dict.shells.loginErrorTitle}
        description={signedIn ? dict.shells.errorDescription : dict.shells.loginErrorDescription}
        retryLabel={dict.common.retry}
        retrying={retrying}
        onRetry={() => {
          setRetrying(true);
          void retry().finally(() => setRetrying(false));
        }}
        secondaryLabel={dict.common.home}
        onSecondary={onHome}
      />
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  root: { flex: 1, justifyContent: 'center', paddingHorizontal: t.space.gutter, backgroundColor: t.colors.pageBg },
}));
