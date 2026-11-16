import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useI18n } from '@/i18n';
import { usePreferences, useSession } from '@/providers';
import { authenticateWithBiometrics, getBiometricAvailability, shouldLockOnResume } from '@/services/biometrics';
import { makeStyles } from '@/theme';
import { Button, Icon, Logo, Notice, Text, TextButton } from '@/ui';

/**
 * Biometric lock (mobile-only; the site has nothing like it). When the user switched it on, the app asks
 * for the fingerprint / face on a cold start with a restored session and after more than a minute in the
 * background. The lock is a cover over the navigator, so the screen underneath keeps its state. "Sign in
 * with password" signs out and leads to the login screen — the only way past a failing sensor.
 *
 * Never locks on web, after a fresh sign-in, or when the device has no enrolled biometrics (the switch
 * is then ignored rather than locking the user out).
 */
export function LockGate({ children }: { children: ReactNode }) {
  const { preferences } = usePreferences();
  const { status, user, restored, signOut } = useSession();
  const enabled = preferences.biometricLock && Platform.OS !== 'web';
  const signedIn = status === 'signedIn';

  return (
    <View style={styles.root}>
      {children}
      {signedIn && user ? (
        // One controller per session: a new sign-in starts unlocked, a restored one starts locked.
        <LockController key={user.id} enabled={enabled} lockOnMount={restored && enabled} onUsePassword={() => void signOut()} />
      ) : null}
    </View>
  );
}

function LockController({
  enabled,
  lockOnMount,
  onUsePassword,
}: {
  enabled: boolean;
  lockOnMount: boolean;
  onUsePassword: () => void;
}) {
  // Locked from the first frame of a restored session, so its content never flashes before the prompt.
  // Switching the lock on later in settings does not remount this component, hence does not lock at once.
  const [locked, setLocked] = useState(lockOnMount);
  const backgroundedAt = useRef<number | null>(null);
  const available = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    void getBiometricAvailability().then((availability) => {
      if (!active) return;
      available.current = availability.status === 'available';
      // Nothing enrolled any more: the switch is ignored rather than locking the user out.
      if (!available.current) setLocked(false);
    });
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'background') {
        backgroundedAt.current = Date.now();
      } else if (next === 'active') {
        const lock = shouldLockOnResume({ enabled, available: available.current, signedIn: true }, backgroundedAt.current, Date.now());
        backgroundedAt.current = null;
        if (lock) setLocked(true);
      }
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, [enabled]);

  return locked && enabled ? <LockScreen onUnlocked={() => setLocked(false)} onUsePassword={onUsePassword} /> : null;
}

function LockScreen({ onUnlocked, onUsePassword }: { onUnlocked: () => void; onUsePassword: () => void }) {
  const themed = useStyles();
  const insets = useSafeAreaInsets();
  const { m } = useI18n();
  const t = m.shell.biometrics;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unlock = async () => {
    if (pending) return;
    setPending(true);
    setError(null);
    const result = await authenticateWithBiometrics({ promptMessage: t.prompt, cancelLabel: m.common.actions.cancel });
    setPending(false);
    if (result.ok) onUnlocked();
    else if (result.reason === 'lockout') setError(t.lockout);
    else if (result.reason !== 'cancelled') setError(t.failed);
  };

  // The prompt appears by itself once; after a cancel the user taps the button.
  const prompted = useRef(false);
  useEffect(() => {
    if (prompted.current) return;
    prompted.current = true;
    void unlock();
    // Runs once on mount by design.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View
      accessibilityViewIsModal
      testID="lock-screen"
      style={[StyleSheet.absoluteFill, themed.cover, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}
    >
      <Logo size={28} />
      <View style={themed.center}>
        <Icon name="lock" size={32} color="kicker" />
        <Text variant="dialogTitle" align="center" accessibilityRole="header">
          {t.lockedTitle}
        </Text>
        <Text variant="body" color="textMuted" align="center">
          {t.lockedBody}
        </Text>
        {error ? <Notice tone="error" text={error} style={themed.notice} /> : null}
      </View>
      <View style={themed.actions}>
        <Button label={t.unlock} size="field" fullWidth loading={pending} onPress={() => void unlock()} testID="lock-unlock" />
        <TextButton label={t.usePassword} tone="muted" onPress={onUsePassword} testID="lock-use-password" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });

const useStyles = makeStyles((t) => ({
  cover: {
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: t.space.gutter,
    backgroundColor: t.colors.pageBg,
  },
  center: { alignItems: 'center', gap: t.space.md, maxWidth: 360 },
  notice: { alignSelf: 'stretch', marginTop: t.space.sm },
  actions: { width: '100%', maxWidth: 416, alignItems: 'center', gap: t.space.field },
}));
