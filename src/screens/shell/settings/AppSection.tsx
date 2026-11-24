import { useQueryClient } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, View } from 'react-native';

import { format, plural, useI18n } from '@/i18n';
import { useRefetchOnFocus } from '@/navigation';
import { Hint, useCurrentUser, useHintsEnabled, usePendingWritesSummary, usePreferences } from '@/providers';
import { authenticateWithBiometrics, getBiometricAvailability, type BiometricAvailability } from '@/services/biometrics';
import { clearFileCache } from '@/services/files';
import { useIsOnline } from '@/services/network';
import { localNotifications, type ExactTimingState, type ReminderPermissionState } from '@/services/notifications';
import type { ReminderCategory } from '@/services/preferences';
import { makeStyles } from '@/theme';
import { Button, Card, Dialog, Icon, Notice, SectionCaption, Switch, Text, TextButton } from '@/ui';

type ReminderRow = { category: ReminderCategory; label: string; hint: string };

/**
 * The app-only blocks of the profile screen — what exists only in the mobile app: the biometric lock,
 * local reminders with their permission state, and the data kept on the device. Each is a captioned card.
 */
export function AppSection() {
  const styles = useStyles();
  const { locale, dict, m } = useI18n();
  const t = m.shell.settings;
  const hints = useHintsEnabled();
  const user = useCurrentUser();
  const queryClient = useQueryClient();
  const { preferences, setBiometricLock, setReminder } = usePreferences();
  const online = useIsOnline();
  // Refused writes are not «waiting»: the queue never sends them by itself (the student retries in the editor).
  const pending = usePendingWritesSummary();

  const [biometrics, setBiometrics] = useState<BiometricAvailability | null>(null);
  const [biometricError, setBiometricError] = useState<string | null>(null);
  const [permission, setPermission] = useState<ReminderPermissionState | null>(null);
  const [exactTiming, setExactTiming] = useState<ExactTimingState | null>(null);
  const [cacheCleared, setCacheCleared] = useState(false);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);

  // Bumped by every read: an older read that resolves after a newer one must not overwrite it.
  const permissionSeq = useRef(0);
  const mounted = useRef(true);

  // The notification permission, the biometric enrolment and the exact-alarm access can all change in the
  // system settings — the screen's own notices send the user there — while this screen stays mounted.
  const readDeviceState = useCallback(() => {
    void getBiometricAvailability().then((value) => {
      if (mounted.current) setBiometrics(value);
    });
    const seq = ++permissionSeq.current;
    void localNotifications.getPermission().then((value) => {
      if (mounted.current && seq === permissionSeq.current) setPermission(value);
    });
    void localNotifications.getExactTiming().then((value) => {
      if (mounted.current) setExactTiming(value);
    });
  }, []);

  useEffect(() => {
    mounted.current = true;
    readDeviceState();
    // Back from the system settings (or any other app).
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') readDeviceState();
    });
    return () => {
      mounted.current = false;
      subscription.remove();
    };
  }, [readDeviceState]);
  // Back on this screen from one pushed above it.
  useRefetchOnFocus(readDeviceState);

  const allowExactTiming = async () => {
    setExactTiming(await localNotifications.requestExactTiming());
  };

  const toggleBiometricLock = async (enabled: boolean) => {
    setBiometricError(null);
    if (!enabled) {
      setBiometricLock(false);
      return;
    }
    // Switching the lock on is itself confirmed, so a passer-by cannot lock the owner out.
    const result = await authenticateWithBiometrics({
      promptMessage: m.shell.biometrics.confirmEnable,
      cancelLabel: m.common.actions.cancel,
    });
    if (result.ok) setBiometricLock(true);
    else if (result.reason !== 'cancelled') {
      setBiometricError(result.reason === 'lockout' ? m.shell.biometrics.lockout : m.shell.biometrics.failed);
    }
  };

  const toggleReminder = async (category: ReminderCategory, enabled: boolean) => {
    if (!enabled) {
      setReminder(category, false);
      return;
    }
    // The OS prompt appears the first time a category is switched on, never at start-up. Its answer is the
    // newest state (a re-read on the return from the prompt reads the same).
    const state = permission?.status === 'granted' ? permission : await localNotifications.requestPermission();
    setPermission(state);
    if (state.status === 'granted') setReminder(category, true);
  };

  // Offline the saved data is the only thing the app can show: clearing it asks first.
  const requestClearCache = () => {
    if (online) clearCache();
    else setClearConfirmOpen(true);
  };

  const clearCache = () => {
    setClearConfirmOpen(false);
    queryClient.clear();
    try {
      clearFileCache();
    } catch {
      // Nothing cached yet.
    }
    setCacheCleared(true);
  };

  const reminderRows: ReminderRow[] =
    user.role === 'STUDENT'
      ? [
          // Under «Напоминания» a row needs one word: what the reminder is about.
          { category: 'homeworkDeadlines', label: m.shell.tabs.deadlines, hint: t.reminderHomeworkHint },
          { category: 'lessonStart', label: m.shell.tabs.lesson, hint: t.reminderLessonHint },
        ]
      : user.role === 'TEACHER'
        ? [{ category: 'parentCalls', label: dict.planner.calls.title, hint: t.reminderCallsHint }]
        : [];

  const biometricsReady = biometrics?.status === 'available';
  // A reason is said when the switch cannot be used; how the lock works is a hint (design doc §1a).
  const biometricDescription =
    biometrics?.status === 'notEnrolled'
      ? m.shell.biometrics.notEnrolled
      : biometrics?.status === 'unavailable'
        ? m.shell.biometrics.unavailable
        : hints
          ? m.shell.biometrics.hint
          : undefined;
  // A device without a sensor has nothing to offer here (unless a stored lock must be switched off).
  const lockShown = biometrics?.status !== 'unavailable' || preferences.biometricLock;
  const remindersSupported = localNotifications.supported && permission?.status !== 'unavailable';
  // Refused for good: only the device settings can allow it. Not asked yet (Android 13+ reports that as
  // "denied" too, see `permissionStateOf`) is not a refusal: a tap on a switch shows the OS prompt.
  const remindersDenied = permission?.status === 'denied';
  // A switch is on only while reminders can actually be delivered (the stored wish may outlive a revoke).
  const remindersAllowed = permission === null || permission.status === 'granted';
  // Android 12+ without the "alarms & reminders" access: the OS may deliver a reminder late.
  const remindersInexact =
    exactTiming?.status === 'denied' &&
    remindersSupported &&
    !remindersDenied &&
    reminderRows.some((row) => preferences.reminders[row.category]);
  const version = Constants.expoConfig?.version ?? '';

  return (
    <View style={styles.sections}>
      {lockShown ? (
        <Card style={styles.card}>
          <Switch
            trailing
            label={m.shell.biometrics.title}
            description={biometricDescription}
            // The lock can always be switched OFF, even if the sensor has since become unavailable: the
            // switch shows the stored value, and only switching it on needs a ready sensor.
            value={preferences.biometricLock}
            disabled={!biometricsReady && !preferences.biometricLock}
            onValueChange={(value) => void toggleBiometricLock(value)}
            testID="settings-biometric-lock"
          />
          {biometricError ? <Notice tone="error" text={biometricError} /> : null}
        </Card>
      ) : null}

      {reminderRows.length > 0 ? (
      <View style={styles.section}>
        <SectionCaption>{t.remindersKicker}</SectionCaption>
        <Card style={styles.card}>
          {reminderRows.map((row) => (
            <Switch
              key={row.category}
              trailing
              label={row.label}
              description={hints ? row.hint : undefined}
              value={preferences.reminders[row.category] && remindersSupported && remindersAllowed}
              disabled={!remindersSupported}
              onValueChange={(value) => void toggleReminder(row.category, value)}
              testID={`settings-reminder-${row.category}`}
            />
          ))}
          {!remindersSupported ? (
            <Text variant="hint" testID="settings-reminders-unavailable">
              {t.remindersUnavailable}
            </Text>
          ) : null}
          {remindersDenied ? (
            <Notice
              tone="warning"
              text={t.remindersDenied}
              action={<TextButton label={m.common.actions.openSettings} onPress={() => void Linking.openSettings()} />}
              testID="settings-reminders-denied"
            />
          ) : null}
          {remindersInexact ? (
            <Notice
              tone="warning"
              text={t.remindersInexact}
              action={
                exactTiming?.canAskAgain ? <TextButton label={t.remindersExactAllow} onPress={() => void allowExactTiming()} testID="settings-reminders-exact-allow" /> : undefined
              }
              testID="settings-reminders-inexact"
            />
          ) : null}
        </Card>
      </View>
      ) : null}

        <Card style={styles.card}>
          {/* A working connection is not news: the row appears when it is lost. */}
          {online ? null : (
            <View style={styles.row}>
              <Icon name="wifiOff" size={20} color="yellowText" />
              <Text variant="bodyStrong" style={styles.rowText} testID="settings-connection">
                {t.connectionOffline}
              </Text>
            </View>
          )}
          {pending.waiting > 0 ? (
            <Text variant="small" color="textMuted" testID="settings-pending-writes">
              {plural(locale, pending.waiting, t.pendingForms)}
            </Text>
          ) : null}
          {pending.refused > 0 ? (
            <Text variant="small" color="yellowText" testID="settings-refused-writes">
              {plural(locale, pending.refused, t.refusedForms)}
            </Text>
          ) : null}
          <Hint>
            <Text variant="hint">{t.dataHint}</Text>
          </Hint>
          {cacheCleared ? <Notice tone="success" text={t.cacheCleared} testID="settings-cache-cleared" /> : null}
          <Button
            label={t.clearCache}
            variant="outline"
            size="sm"
            onPress={requestClearCache}
            style={styles.button}
            testID="settings-clear-cache"
          />
        </Card>

      {version ? (
        <Text variant="small" color="textMuted" align="center" accessibilityLabel={format(t.version, { version })}>
          {version}
        </Text>
      ) : null}
      <Dialog
        visible={clearConfirmOpen}
        title={t.clearCacheOfflineTitle}
        description={t.clearCacheOfflineBody}
        confirmLabel={t.clearCache}
        cancelLabel={m.common.actions.cancel}
        onConfirm={clearCache}
        onCancel={() => setClearConfirmOpen(false)}
        testID="settings-clear-cache-confirm"
      />
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  sections: { gap: t.space.block },
  section: { gap: t.space.sm },
  card: { gap: t.space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: t.space.sm },
  rowText: { flex: 1 },
  button: { alignSelf: 'flex-start' },
}));
