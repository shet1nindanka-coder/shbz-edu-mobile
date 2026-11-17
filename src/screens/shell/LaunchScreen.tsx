import { View } from 'react-native';

import { useI18n } from '@/i18n';
import { useSession } from '@/providers';
import { makeStyles } from '@/theme';
import { ErrorState, Logo, Screen, Spinner } from '@/ui';

/**
 * `auth.launch` (docs/spec/01-shell-auth.md §1.1): the bootstrap screen. While the stored token is being
 * checked it shows only the logo and a spinner. The route decides where to go next; this component only
 * adds the one state the site cannot have — a token that could not be verified because the very first
 * start had no connection.
 */
export function LaunchScreen() {
  const styles = useStyles();
  const { dict, m } = useI18n();
  const { status, notice, retryRestore, signOut } = useSession();

  if (status === 'restoreFailed') {
    return (
      <Screen scroll={false} contentContainerStyle={styles.center} testID="launch-failed">
        <ErrorState
          title={m.shell.launch.failedTitle}
          description={notice ?? m.shell.launch.failedBody}
          retryLabel={dict.common.retry}
          onRetry={retryRestore}
          secondaryLabel={m.shell.launch.signInAgain}
          // The plain sign-out keeps unsent drafts on the device for their user (sent after signing in again).
          onSecondary={() => void signOut()}
        />
      </Screen>
    );
  }

  return (
    <Screen scroll={false} glow="login" contentContainerStyle={styles.center} testID="launch">
      <View style={styles.brand} accessibilityLabel={m.shell.launch.loading} accessibilityRole="progressbar">
        <Logo size={32} />
        <Spinner size={20} color="accentSolid" />
      </View>
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  center: { justifyContent: 'center' },
  brand: { alignItems: 'center', gap: t.space.lg },
}));
