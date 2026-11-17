import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect, useMemo, type ReactNode } from 'react';
import { AppState, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { I18nProvider } from '@/i18n';
import { FileServiceProvider } from '@/services/files';
import { startNetworkMonitor } from '@/services/network';
import { createPersistOptions, markRestoredQueriesStale } from '@/services/query';
import { ThemeProvider, useAppFonts, useTheme } from '@/theme';

import { PreferencesProvider, usePreferences } from './preferences-provider';
import { getQueryClient } from './query';
import { getAppRuntime } from './services';
import { SessionProvider } from './session-provider';
import { ShellEffects } from './shell-effects';

// The native splash stays until fonts and preferences are ready, so the first frame is already in the
// user's theme and language.
void SplashScreen.preventAutoHideAsync().catch(() => undefined);

/** Start of this run of the app: cached data older than this was restored from disk. */
const APP_STARTED_AT = Date.now();

/** The restored cache predates this run and missed every realtime event meanwhile: refetch it once. */
const onCacheRestored = () => markRestoredQueriesStale(getQueryClient(), APP_STARTED_AT);

export type AppProvidersProps = { children: ReactNode };

/**
 * The composition root (React half). Order matters: preferences decide theme and language; the query
 * cache is restored before any screen asks for data; the session wraps everything that needs a user.
 */
export function AppProviders({ children }: AppProvidersProps) {
  const runtime = getAppRuntime();

  useEffect(() => {
    startNetworkMonitor();
  }, []);

  // The mock backend coalesces its saves; leaving the foreground is the last sure moment to write them
  // out (the OS may kill a backgrounded app without notice).
  useEffect(() => {
    const mock = runtime.mock;
    if (!mock) return;
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active') void mock.flush().catch(() => undefined);
    });
    return () => subscription.remove();
  }, [runtime]);

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <PreferencesProvider store={runtime.preferences}>
          <Themed>{children}</Themed>
        </PreferencesProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function Themed({ children }: { children: ReactNode }) {
  const runtime = getAppRuntime();
  const { preferences, loaded, setLocale } = usePreferences();
  const fonts = useAppFonts();
  const persistOptions = useMemo(() => createPersistOptions(runtime.storage), [runtime.storage]);
  // A font that failed to load must not keep the splash forever: the app renders with system fonts.
  const ready = loaded && (fonts.loaded || fonts.error !== null);

  useEffect(() => {
    if (ready) SplashScreen.hide();
  }, [ready]);

  if (!ready) return null;

  return (
    <ThemeProvider mode={preferences.themeMode}>
      <SystemChrome />
      <I18nProvider locale={preferences.locale} onChangeLocale={setLocale}>
        <PersistQueryClientProvider client={getQueryClient()} persistOptions={persistOptions} onSuccess={onCacheRestored}>
          <FileServiceProvider service={runtime.files}>
            <SessionProvider>
              <ShellEffects />
              {children}
            </SessionProvider>
          </FileServiceProvider>
        </PersistQueryClientProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}

/** Status-bar icons and the window background follow the resolved theme (no white flash in dark mode). */
function SystemChrome() {
  const theme = useTheme();
  const background = theme.colors.pageBg;

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(background).catch(() => undefined);
  }, [background]);

  return <StatusBar style={theme.statusBarStyle} />;
}

const styles = StyleSheet.create({ root: { flex: 1 } });
