import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { View, type TextInputInstance } from 'react-native';

import { isApiError, isRateLimited, qk, useApi } from '@/api';
import { MAX_PASSWORD_LENGTH } from '@/domain/password-policy';
import { MAX_LOGIN_LENGTH } from '@/domain/text';
import { validateLoginInput } from '@/domain/account-validation';
import { format, useI18n } from '@/i18n';
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
  TitleDot,
} from '@/ui';

import { formatWait, useCountdown } from './use-countdown';

const LOCALE_OPTIONS = [
  { value: 'ru', label: 'RU' },
  { value: 'en', label: 'EN' },
] as const;

/**
 * `auth.login` (docs/spec/01-shell-auth.md §1.2, §3.1; 90-addendum-6 §7.2): login + password, nothing
 * else — no registration, no password recovery. Errors come from the server already localised; the form
 * keeps the login and clears only the password. A rate-limit refusal disables the button until the wait
 * is over or the login is changed (the client cannot tell which bucket refused).
 */
export function LoginScreen() {
  const styles = useStyles();
  const api = useApi();
  const { locale, dict, m } = useI18n();
  const { preferences, localePending, setLocale } = usePreferences();
  const { signIn, notice, dismissNotice } = useSession();
  const navigation = useAppNavigation();

  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [demoOpen, setDemoOpen] = useState(false);
  const passwordRef = useRef<TextInputInstance>(null);
  const waitSeconds = useCountdown(lockedUntil);
  const locked = waitSeconds > 0;

  const meta = useQuery({ queryKey: qk('shell', 'getMeta'), queryFn: () => api.shell.getMeta(), staleTime: 5 * 60 * 1000 });
  const helpContact = meta.data?.loginHelpContact.trim() ?? '';

  // A persona picked on the demo screen fills the form once.
  useEffect(() => {
    const apply = () => {
      const prefill = takeLoginPrefill();
      if (!prefill) return;
      setLogin(prefill.login);
      setPassword(prefill.password);
      setError(null);
      setLockedUntil(null);
    };
    apply();
    return subscribeLoginPrefill(apply);
  }, []);

  const changeLogin = (value: string) => {
    setLogin(value);
    // Another login may not be limited: let the user try it right away.
    if (lockedUntil !== null) setLockedUntil(null);
  };

  const submit = async () => {
    // A double tap must not burn rate-limit attempts.
    if (pending || locked) return;
    const input = validateLoginInput(login, password);
    if (!input.ok) {
      setError(dict.login.errors.empty);
      return;
    }
    setPending(true);
    setError(null);
    dismissNotice();
    try {
      await signIn({ login: input.login, password: input.password });
      // The session change swaps the auth stack for the role's tree; nothing to do here.
    } catch (failure) {
      setPassword('');
      if (isApiError(failure)) {
        setError(failure.message);
        if (isRateLimited(failure) && failure.retryAfterSeconds) setLockedUntil(Date.now() + failure.retryAfterSeconds * 1000);
      } else {
        setError(m.common.errors.generic);
      }
    } finally {
      setPending(false);
    }
  };

  const personas = getDemoPersonas();

  return (
    <Screen glow="login" testID="login-screen" contentContainerStyle={styles.page}>
      <View style={styles.topRow}>
        <Logo size={26} />
        <Segmented
          options={LOCALE_OPTIONS}
          value={localePending ?? preferences.locale}
          onChange={setLocale}
          disabled={localePending !== null}
          accessibilityLabel={m.shell.login.languageAria}
          testID="login-locale"
        />
      </View>

      <View style={styles.block}>
        <View style={styles.titleRow}>
          <Text variant="loginTitle" accessibilityRole="header">
            {dict.login.title}
          </Text>
          <TitleDot size={9} />
        </View>
        <Hint>
          <Text variant="body" color="textMuted" style={styles.subtitle}>
            {dict.login.subtitle}
          </Text>
        </Hint>

        {notice ? (
          <Notice
            tone="warning"
            text={notice}
            onDismiss={dismissNotice}
            dismissLabel={m.shell.login.sessionNoticeDismiss}
            style={styles.notice}
            testID="login-session-notice"
          />
        ) : null}

        <Card style={styles.card}>
          <View style={styles.form}>
            <TextField
              label={dict.login.loginLabel}
              value={login}
              onChangeText={changeLogin}
              placeholder={m.shell.login.loginPlaceholder}
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
              label={dict.login.passwordLabel}
              value={password}
              onChangeText={setPassword}
              placeholder={dict.login.passwordPlaceholder}
              showLabel={dict.login.showPassword}
              hideLabel={dict.login.hidePassword}
              maxLength={MAX_PASSWORD_LENGTH}
              returnKeyType="go"
              onSubmitEditing={() => void submit()}
              testID="password-input"
            />
            {error ? (
              <View accessibilityLiveRegion="polite">
                <Notice tone="error" text={error} testID="login-error" />
                {locked ? (
                  <Text variant="caption" color="textMuted" style={styles.wait} testID="login-wait">
                    {format(m.common.errors.retryIn, { time: formatWait(waitSeconds, locale, m.common.errors) })}
                  </Text>
                ) : null}
              </View>
            ) : null}
            <Button
              label={pending ? dict.login.submitting : dict.login.submit}
              onPress={() => void submit()}
              size="field"
              fullWidth
              loading={pending}
              disabled={locked}
              testID="login-submit"
            />
          </View>
        </Card>

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
                onPress={() => setDemoOpen((open) => !open)}
                testID="login-demo-toggle"
              />
            </View>
            {demoOpen ? (
              <>
                <Text variant="caption" color="textMuted" style={styles.demoHint}>
                  {m.shell.login.demoHint}
                </Text>
                {personas.map((persona) => (
                  <ListRow
                    key={persona.login}
                    title={persona.name || persona.login}
                    subtitle={`${persona.login} · ${persona.role ? dict.roles[persona.role] : m.shell.login.demoNoAccount}`}
                    chevron={false}
                    onPress={() => {
                      changeLogin(persona.login);
                      setPassword(persona.password);
                      setError(null);
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
      </View>
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  page: { paddingTop: t.space.lg },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  block: { width: '100%', maxWidth: 416, alignSelf: 'center', marginTop: 56 },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', gap: t.space.xs },
  subtitle: { marginTop: t.space.xs },
  notice: { marginTop: t.space.field },
  card: { marginTop: t.space.xl },
  form: { gap: t.space.field },
  wait: { marginTop: t.space.xs },
  help: { marginTop: t.space.field },
  demo: { marginTop: t.space.xl },
  demoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: t.space.gutter,
    paddingVertical: t.space.md,
  },
  demoHint: { paddingHorizontal: t.space.gutter, paddingBottom: t.space.sm },
}));
