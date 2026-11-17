import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState, BackHandler, Platform, StyleSheet, View } from 'react-native';

import { useI18n } from '@/i18n';
import { usePreferences, useSession } from '@/providers';
import { authenticateWithBiometrics, getBiometricAvailability, shouldLockOnResume } from '@/services/biometrics';
import { makeStyles } from '@/theme';
import { Button, Icon, Logo, Notice, Text, TextButton, setOverlayCover, useWindowInsets } from '@/ui';

/**
 * Biometric lock (mobile-only; the site has nothing like it). When the user switched it on, the app asks
 * for the fingerprint / face on a cold start with a restored session and after more than a minute in the
 * background. The lock is a cover over the navigator, so the screen underneath keeps its state; the same
 * cover is repeated inside every open sheet, the in-place file viewer and the modal routes, which are
 * separate native windows above the navigator. "Sign in with password" signs out and leads to the login
 * screen — the only way past a failing sensor.
 *
 * Never locks on web, after a fresh sign-in, or when the device has no enrolled biometrics (the switch
 * is then ignored rather than locking the user out).
 */
export function LockGate({ children }: { children: ReactNode }) {
  const { preferences } = usePreferences();
  const { status, user, restored, signOut } = useSession();
  const enabled = preferences.biometricLock && Platform.OS !== 'web';
  const signedIn = status === 'signedIn';
  const usePassword = useCallback(() => void signOut(), [signOut]);

  return (
    <View style={styles.root}>
      {children}
      {signedIn && user ? (
        // One controller per session: a new sign-in starts unlocked, a restored one starts locked. It draws
        // the cover of the root window itself; sheets, the in-place file viewer and the modal routes are
        // separate native windows and repeat the cover through their own slot (`@/ui` overlay-cover).
        <LockController key={user.id} enabled={enabled} lockOnMount={restored && enabled} onUsePassword={usePassword} />
      ) : null}
    </View>
  );
}

/** Owns the lock state and the one biometric prompt; the cover it publishes is drawn in every window. */
function LockController({
  enabled,
  lockOnMount,
  onUsePassword,
}: {
  enabled: boolean;
  lockOnMount: boolean;
  onUsePassword: () => void;
}) {
  const { m } = useI18n();
  // Locked from the first frame of a restored session, so its content never flashes before the prompt.
  // Switching the lock on later in settings does not remount this component, hence does not lock at once.
  const [locked, setLocked] = useState(lockOnMount);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<'lockout' | 'failed' | null>(null);
  const backgroundedAt = useRef<number | null>(null);
  const available = useRef(false);
  const prompting = useRef(false);
  const active = locked && enabled;

  useEffect(() => {
    if (!enabled) return;
    let mounted = true;
    void getBiometricAvailability().then((availability) => {
      if (!mounted) return;
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
      mounted = false;
      subscription.remove();
    };
  }, [enabled]);

  const promptMessage = m.shell.biometrics.prompt;
  const cancelLabel = m.common.actions.cancel;
  const unlock = useCallback(async () => {
    if (prompting.current) return;
    prompting.current = true;
    setPending(true);
    setFailure(null);
    const result = await authenticateWithBiometrics({ promptMessage, cancelLabel });
    prompting.current = false;
    setPending(false);
    if (result.ok) setLocked(false);
    else if (result.reason === 'lockout') setFailure('lockout');
    else if (result.reason !== 'cancelled') setFailure('failed');
  }, [promptMessage, cancelLabel]);

  // The prompt appears by itself once per lock (`unlock` clears the previous failure itself); after a
  // cancel the user taps the button.
  useEffect(() => {
    if (!active) return;
    // After the commit, so the cover is on screen before the system prompt comes up over it.
    const timer = setTimeout(() => void unlock(), 0);
    return () => clearTimeout(timer);
    // Runs when the lock closes, not when the prompt texts change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // While locked the hardware back button does nothing: it must not pop the screens under the cover.
  // The listener is added again on the next tick so that it also sits above handlers registered in the
  // same commit (the navigator's own one on a cold start) — the last one added is asked first.
  useEffect(() => {
    if (!active) return;
    const consume = () => true;
    let subscription = BackHandler.addEventListener('hardwareBackPress', consume);
    const timer = setTimeout(() => {
      subscription.remove();
      subscription = BackHandler.addEventListener('hardwareBackPress', consume);
    }, 0);
    return () => {
      clearTimeout(timer);
      subscription.remove();
    };
  }, [active]);

  const cover = useMemo(
    () => (active ? <LockScreen pending={pending} failure={failure} onUnlock={() => void unlock()} onUsePassword={onUsePassword} /> : null),
    [active, pending, failure, unlock, onUsePassword],
  );
  // Published before paint for the other native windows (sheets, the file viewer, modal routes) …
  useLayoutEffect(() => {
    setOverlayCover(cover);
  }, [cover]);
  useEffect(() => () => setOverlayCover(null), []);

  // … and rendered right here for the root window, so a restored session is covered from its very first
  // frame (a published cover reaches its slots one commit later).
  return cover;
}

/** The cover itself: presentational, because one instance is drawn per native window. */
function LockScreen({
  pending,
  failure,
  onUnlock,
  onUsePassword,
}: {
  pending: boolean;
  failure: 'lockout' | 'failed' | null;
  onUnlock: () => void;
  onUsePassword: () => void;
}) {
  const themed = useStyles();
  // One instance is drawn per native window; in a modal the insets of the declaring place would be wrong.
  const insets = useWindowInsets();
  const { m } = useI18n();
  const t = m.shell.biometrics;
  const error = failure === 'lockout' ? t.lockout : failure === 'failed' ? t.failed : null;

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
        <Button label={t.unlock} size="field" fullWidth loading={pending} onPress={onUnlock} testID="lock-unlock" />
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
