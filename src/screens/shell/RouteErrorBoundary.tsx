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
 */
export function RouteErrorBoundary({ retry }: ErrorBoundaryProps) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { dict } = useI18n();
  const { status } = useSession();
  const navigation = useAppNavigation();
  const [retrying, setRetrying] = useState(false);
  const signedIn = status === 'signedIn';

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
        onSecondary={navigation.goHome}
      />
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  root: { flex: 1, justifyContent: 'center', paddingHorizontal: t.space.gutter, backgroundColor: t.colors.pageBg },
}));
