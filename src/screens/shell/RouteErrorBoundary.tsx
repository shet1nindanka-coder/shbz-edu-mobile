import type { ErrorBoundaryProps } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useI18n } from '@/i18n';
import { useAppNavigation } from '@/navigation';
import { useSession } from '@/providers';
import { makeStyles } from '@/theme';
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
 * provider of the app is mounted: everything here (and in `ErrorState`) must work on the context
 * defaults — the default language, the light theme, the safe-area provider of `ExpoRoot`. "Try again"
 * mounts the providers again; `onHome` comes from the route file (no session, no `useAppNavigation`).
 */
export function RootErrorBoundary({ retry, onHome }: ErrorBoundaryProps & { onHome: (retry: () => Promise<void>) => void }) {
  // The session is unknown here (its provider is gone): the generic texts, not the login form's.
  return <ErrorShell signedIn retry={retry} onHome={() => onHome(retry)} />;
}

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
