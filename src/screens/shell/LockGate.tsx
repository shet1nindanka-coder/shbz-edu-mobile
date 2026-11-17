import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState, BackHandler, Platform, StyleSheet, View } from 'react-native';

import { useI18n } from '@/i18n';
import { usePreferences, useSession } from '@/providers';
import { authenticateWithBiometrics, getBiometricAvailability, shouldLockOnResume } from '@/services/biometrics';
import { makeStyles } from '@/theme';
import {
  Button,
  Icon,
  Logo,
  Notice,
  Text,
  TextButton,
  coveredAccessibilityProps,
  setOverlayCover,
  useOverlayCovered,
  useWindowInsets,
} from '@/ui';

/**
 * Biometric lock (mobile-only; the site has nothing like it). When the user switched it on, the app asks
 * for the fingerprint / face on a cold start with a restored session and after more than a minute in the
 * background. The lock is a cover over the navigator, so the screen underneath keeps its state; the same
 * cover is repeated inside every open sheet, the in-place file viewer and the modal routes, which are
 * separate native windows above the navigator. "Sign in with password" signs out and leads to the login
 * screen — the only way past a failing sensor.
 *
 * While the cover is up, what lies under it leaves the accessibility tree (TalkBack / VoiceOver must not
 * read or operate the protected screen). On iOS a plain privacy cover (no prompt) is also drawn while the
 * app is inactive or in the background, so the app-switcher snapshot does not show the protected screen.
 *
 * Never locks on web, after a fresh sign-in, or when the device cannot authenticate (nothing enrolled, no
 * passcode): the switch is then ignored rather than locking the user out — also when that changed while
 * the app was in the background.
 *
 * Known limit (iOS): system screens the app presented itself (Quick Look, the share sheet, document
 * pickers) are view controllers above every window of the app; JS in Expo Go cannot dismiss or cover them,
 * so such a screen left open stays above the cover until it is closed. Hand-offs started while the app is
 * covered must not present (`isOverlayCovered()` from `@/ui`).
 */
export function LockGate({ children }: { children: ReactNode }) {
  const { preferences } = usePreferences();
  const { status, user, restored, signOut } = useSession();
  const enabled = preferences.biometricLock && Platform.OS !== 'web';
  const signedIn = status === 'signedIn';
  const usePassword = useCallback(() => void signOut(), [signOut]);
  // The published cover (lock or privacy view): the navigator under it leaves the accessibility tree.
  const covered = useOverlayCovered();

  return (
    <View style={styles.root}>
      <View style={styles.root} {...coveredAccessibilityProps(covered)}>
        {children}
      </View>
      {signedIn && user ? (
        // One controller per session: a new sign-in starts unlocked, a restored one starts locked. It draws
        // the cover of the root window itself; sheets, the in-place file viewer and the modal routes are
        // separate native windows and repeat the cover through their own slot (`@/ui` overlay-cover).
        <LockController key={user.id} enabled={enabled} lockOnMount={restored && enabled} onUsePassword={usePassword} />
      ) : null}
    </View>
  );
}

/**
 * iOS takes the app-switcher snapshot when the app leaves the foreground; the privacy cover is drawn from
 * `inactive` on. Android has no `inactive` and its recents thumbnail needs FLAG_SECURE (not available from
 * JS in Expo Go): a cover on `background` there would only close the system date / time dialogs on every
 * glance at another app.
 */
const PRIVACY_COVER = Platform.OS === 'ios';

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
  // Privacy cover while the app is not in the foreground (no prompt, no lock by itself).
  const [shielded, setShielded] = useState(false);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<'lockout' | 'failed' | null>(null);
  const backgroundedAt = useRef<number | null>(null);
  // Bumped on every AppState change: a resume check that resolves after the app has left the foreground
  // again (a quick switch) must not take the privacy cover down.
  const appStateSeq = useRef(0);
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
      const seq = ++appStateSeq.current;
      if (next !== 'active') {
        if (next === 'background') backgroundedAt.current ??= Date.now();
        // The biometric prompt itself, Control Center or a call banner also make the app `inactive`: the
        // cover is drawn, but only a real stay in the background decides about the lock (below).
        if (PRIVACY_COVER && available.current) setShielded(true);
        return;
      }
      const since = backgroundedAt.current;
      backgroundedAt.current = null;
      if (since === null) {
        setShielded(false);
        return;
      }
      const now = Date.now();
      // The device may have lost its passcode / enrolment while the app was away: read it again, so the
      // lock is not closed with a prompt that can only fail. The privacy cover stays until then.
      void getBiometricAvailability().then((availability) => {
        if (!mounted) return;
        available.current = availability.status === 'available';
        const lock = shouldLockOnResume({ enabled, available: available.current, signedIn: true }, since, now);
        // Locking is always safe, even if the app has left again meanwhile.
        if (lock) setLocked(true);
        else if (!available.current) setLocked(false);
        // Left the foreground again before the check resolved: that newer stay keeps the cover (and decides
        // about the lock on its own return).
        if (seq !== appStateSeq.current || AppState.currentState !== 'active') return;
        setShielded(false);
      });
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
    if (!result.ok && result.reason === 'unavailable') {
      // The device can no longer authenticate (passcode or enrolment removed). Re-checked rather than
      // trusted: a transient error of the prompt must not open the app.
      const availability = await getBiometricAvailability();
      prompting.current = false;
      setPending(false);
      if (availability.status !== 'available') {
        available.current = false;
        setLocked(false);
      } else {
        setFailure('failed');
      }
      return;
    }
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

  const privacy = !active && shielded && enabled;
  const cover = useMemo(
    () =>
      active ? (
        <LockScreen pending={pending} failure={failure} onUnlock={() => void unlock()} onUsePassword={onUsePassword} />
      ) : privacy ? (
        <PrivacyScreen />
      ) : null,
    [active, privacy, pending, failure, unlock, onUsePassword],
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

/** The plain cover of an app that is not in the foreground: the logo, nothing to read or press. */
function PrivacyScreen() {
  const themed = useStyles();
  const insets = useWindowInsets();
  return (
    <View
      accessibilityViewIsModal
      testID="privacy-screen"
      style={[StyleSheet.absoluteFill, themed.cover, themed.privacy, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}
    >
      <Logo size={28} />
    </View>
  );
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
  privacy: { justifyContent: 'center' },
  center: { alignItems: 'center', gap: t.space.md, maxWidth: 360 },
  notice: { alignSelf: 'stretch', marginTop: t.space.sm },
  actions: { width: '100%', maxWidth: 416, alignItems: 'center', gap: t.space.field },
}));
