import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { View, type TextInputInstance } from 'react-native';

import { isApiError, isRateLimited, qk, useApi } from '@/api';
import { useDurationLock, useWaitText } from '@/components/retry-wait';
import { MAX_PASSWORD_LENGTH } from '@/domain/password-policy';
import { MAX_LOGIN_LENGTH } from '@/domain/text';
import { validateLoginInput } from '@/domain/account-validation';
import { useI18n } from '@/i18n';
import { useAppNavigation } from '@/navigation';
import {
  Hint,
  IS_MOCK_BUILD,
  getDemoPersonas,
  subscribeLoginPrefill,
  takeLoginPrefill,
  usePreferences,
  useSession,
} from '@/providers';
import { makeStyles } from '@/theme';
import {
  Button,
  Card,
  ListRow,
  Logo,
  Notice,
  PasswordField,
  Screen,
  Segmented,
  Text,
  TextButton,
  TextField,
} from '@/ui';

import { loginFailureOf, loginFailureText, type LoginFailure } from './login-error';

const LOCALE_OPTIONS = [
  { value: 'ru', label: 'RU' },
  { value: 'en', label: 'EN' },
] as const;

/**
 * `auth.login` (docs/spec/01-shell-auth.md §1.2, §3.1; 90-addendum-6 §7.2): login + password, nothing
 * else — no registration, no password recovery. The error line is rendered from its code (`login-error.ts`),
 * so it follows the language switch; the form keeps the login and clears only the password. A rate-limit refusal disables the button until the wait
 * is over or the login is changed (the client cannot tell which bucket refused).
 */
export function LoginScreen() {
  const styles = useStyles();
  const api = useApi();
  const { locale, dict, m } = useI18n();
  const waitText = useWaitText();
  const { preferences, localePending, setLocale } = usePreferences();
  const { signIn, notice, tokenNotRemoved, dismissNotice, dismissTokenNotice } = useSession();
  const navigation = useAppNavigation();

  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  // Kept as a code, not as text: the notice must follow the language switch above the form.
  const [failure, setFailure] = useState<LoginFailure | null>(null);
  const [pending, setPending] = useState(false);
  // `pending` is the last render's value: a second submit in the same frame (return key + button) passes it.
  const inFlight = useRef(false);
  // A duration, not a deadline on the device clock: setting the clock back must not lengthen the lock.
  const lock = useDurationLock();
  const { start: startLock, clear: clearLock } = lock;
  const [demoOpen, setDemoOpen] = useState(false);
  const passwordRef = useRef<TextInputInstance>(null);
  const waitSeconds = lock.seconds;
  const locked = lock.locked;

  const meta = useQuery({ queryKey: qk('shell', 'getMeta'), queryFn: () => api.shell.getMeta(), staleTime: 5 * 60 * 1000 });
  const helpContact = meta.data?.loginHelpContact.trim() ?? '';

  // A persona picked on the demo screen fills the form once.
  useEffect(() => {
    const apply = () => {
      const prefill = takeLoginPrefill();
      if (!prefill) return;
      setLogin(prefill.login);
      setPassword(prefill.password);
      setFailure(null);
      clearLock();
    };
    apply();
    return subscribeLoginPrefill(apply);
  }, [clearLock]);

  const changeLogin = (value: string) => {
    setLogin(value);
    // Another login may not be limited: let the user try it right away.
    if (locked) clearLock();
  };

  const submit = async () => {
    // A double tap must not burn rate-limit attempts.
    if (inFlight.current || pending || locked) return;
    const input = validateLoginInput(login, password);
    if (!input.ok) {
      setFailure({ code: 'empty' });
      return;
    }
    inFlight.current = true;
    setPending(true);
    setFailure(null);
    dismissNotice();
    try {
      await signIn({ login: input.login, password: input.password });
      // The session change swaps the auth stack for the role's tree; nothing to do here.
    } catch (failure) {
      setPassword('');
      if (isApiError(failure)) {
        setFailure(loginFailureOf(failure));
        if (isRateLimited(failure) && failure.retryAfterSeconds) startLock(failure.retryAfterSeconds);
      } else {
        setFailure({ code: 'unknown' });
      }
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  };

  const personas = getDemoPersonas();
  const error = failure
    ? loginFailureText(failure, locale, { login: dict.login, network: m.common.errors.network, generic: m.common.errors.generic })
    : null;

  return (
    <Screen testID="login-screen" dock={false} contentContainerStyle={styles.page}>
      <View style={styles.block}>
        <Logo size={34} />
        <View style={styles.titles}>
          <Hint>
            <Text variant="body" color="textMuted">
              {dict.login.subtitle}
            </Text>
          </Hint>
        </View>

        {notice ? (
          <Notice
            tone="warning"
            // The only forced sign-out is an expired session; rendered from the dictionary, so it follows
            // the language switch (the stored text is in the language of the request that failed).
            text={dict.apiCommon.sessionExpired}
            onDismiss={dismissNotice}
            dismissLabel={m.shell.login.sessionNoticeDismiss}
            style={styles.notice}
            testID="login-session-notice"
          />
        ) : null}
        {tokenNotRemoved ? (
          <Notice
            tone="warning"
            text={m.shell.login.tokenNotRemoved}
            onDismiss={dismissTokenNotice}
            dismissLabel={m.shell.login.sessionNoticeDismiss}
            style={styles.notice}
            testID="login-token-notice"
          />
        ) : null}

        {/* The form sits on the page itself: the sign-in screen has one thing on it. */}
          <View style={styles.form}>
            <TextField
              size="lg"
              label={dict.login.loginLabel}
              value={login}
              onChangeText={changeLogin}
              keyboardType="email-address"
              inputMode="email"
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              autoComplete="username"
              textContentType="username"
              maxLength={MAX_LOGIN_LENGTH}
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => passwordRef.current?.focus()}
              testID="login-input"
            />
            <PasswordField
              ref={passwordRef}
              size="lg"
              label={dict.login.passwordLabel}
              value={password}
              onChangeText={setPassword}
              showLabel={dict.login.showPassword}
              hideLabel={dict.login.hidePassword}
              showAccessibilityLabel={dict.login.showPasswordAria}
              hideAccessibilityLabel={dict.login.hidePasswordAria}
              maxLength={MAX_PASSWORD_LENGTH}
              returnKeyType="go"
              onSubmitEditing={() => void submit()}
              testID="password-input"
            />
            {error ? (
              // The notice announces itself (live region on Android, `useAnnounce` on iOS); the countdown
              // under it must not be spoken at every tick.
              <View>
                <Notice tone="error" text={error} testID="login-error" />
                {locked ? (
                  <Text variant="caption" color="textMuted" style={styles.wait} testID="login-wait">
                    {waitText.retryIn(waitSeconds)}
                  </Text>
                ) : null}
              </View>
            ) : null}
            <Button
              label={pending ? dict.login.submitting : dict.login.submit}
              onPress={() => void submit()}
              size="lg"
              fullWidth
              loading={pending}
              disabled={locked}
              testID="login-submit"
            />
          </View>

        {helpContact ? (
          <Text variant="small" color="textMuted" align="center" style={styles.help}>
            {dict.login.help}{' '}
            <Text variant="smallStrong" color="textStrong">
              {helpContact}
            </Text>
          </Text>
        ) : null}

        {IS_MOCK_BUILD ? (
          <Card variant="soft" padded={false} style={styles.demo} testID="login-demo">
            <View style={styles.demoHeader}>
              <Text variant="smallBold">{m.shell.login.demoTitle}</Text>
              <TextButton
                label={demoOpen ? m.shell.login.demoHide : m.shell.login.demoShow}
                accessibilityLabel={demoOpen ? m.shell.login.demoHideAria : m.shell.login.demoShowAria}
                expanded={demoOpen}
                onPress={() => setDemoOpen((open) => !open)}
                testID="login-demo-toggle"
              />
            </View>
            {demoOpen ? (
              <>
                {personas.map((persona) => (
                  <ListRow
                    key={persona.login}
                    title={persona.name || persona.login}
                    // The login goes into the form on a tap; the row only says who this is.
                    meta={persona.role ? dict.roles[persona.role].toLocaleLowerCase() : m.shell.login.demoNoAccount}
                    accessibilityLabel={`${persona.name || persona.login}, ${persona.login}, ${persona.role ? dict.roles[persona.role] : m.shell.login.demoNoAccount}`}
                    chevron={false}
                    onPress={() => {
                      changeLogin(persona.login);
                      setPassword(persona.password);
                      setFailure(null);
                      // The list is long: folding it brings the filled form back into view.
                      setDemoOpen(false);
                    }}
                    testID={`login-demo-${persona.login}`}
                  />
                ))}
                <ListRow title={m.shell.login.demoData} onPress={navigation.openDemoData} divider={false} testID="login-demo-data" />
              </>
            ) : null}
          </Card>
        ) : null}
        <View style={styles.locale}>
          <Segmented
            options={LOCALE_OPTIONS}
            value={localePending ?? preferences.locale}
            onChange={setLocale}
            disabled={localePending !== null}
            accessibilityLabel={m.shell.login.languageAria}
            testID="login-locale"
            style={styles.localeSwitch}
          />
        </View>
      </View>
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  page: { paddingTop: t.space.xxl * 2, paddingHorizontal: t.space.xl },
  block: { width: '100%', maxWidth: 416, alignSelf: 'center', gap: t.space.lg },
  titles: { gap: t.space.xxs, marginTop: t.space.md },
  notice: {},
  form: { gap: t.space.lg },
  wait: { marginTop: t.space.xs },
  help: {},
  demo: {},
  demoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: t.space.card,
    paddingVertical: t.space.md,
  },
  locale: { alignItems: 'center', marginTop: t.space.lg },
  localeSwitch: { alignSelf: 'center' },
}));
