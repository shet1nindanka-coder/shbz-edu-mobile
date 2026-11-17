import { useQueryClient } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, View } from 'react-native';

import { format, plural, useI18n } from '@/i18n';
import { useAppNavigation, useRefetchOnFocus } from '@/navigation';
import { Hint, IS_MOCK_BUILD, useCurrentUser, usePendingWritesSummary, usePreferences } from '@/providers';
import { authenticateWithBiometrics, getBiometricAvailability, type BiometricAvailability } from '@/services/biometrics';
import { clearFileCache } from '@/services/files';
import { useIsOnline } from '@/services/network';
import { localNotifications, type ExactTimingState, type ReminderPermissionState } from '@/services/notifications';
import type { ReminderCategory } from '@/services/preferences';
import { makeStyles } from '@/theme';
import { Button, Card, Dialog, Divider, Icon, ListRow, Notice, SectionCard, Switch, Text, TextButton } from '@/ui';

type ReminderRow = { category: ReminderCategory; label: string; hint: string };

/**
 * The "App" block — what exists only in the mobile app (the site's settings page ends with the profile
 * status): the biometric lock, local reminders with their permission state, the data kept on the device,
 * and the entries that the site keeps in its menu (the student's «общая инфа», demo data in mock builds).
 */
export function AppSection() {
  const styles = useStyles();
  const { locale, dict, m } = useI18n();
  const t = m.shell.settings;
  const user = useCurrentUser();
  const navigation = useAppNavigation();
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
          { category: 'homeworkDeadlines', label: t.reminderHomework, hint: t.reminderHomeworkHint },
          { category: 'lessonStart', label: t.reminderLesson, hint: t.reminderLessonHint },
        ]
      : user.role === 'TEACHER'
        ? [{ category: 'parentCalls', label: dict.planner.calls.title, hint: t.reminderCallsHint }]
        : [];

  const biometricsReady = biometrics?.status === 'available';
  const biometricDescription =
    biometrics?.status === 'notEnrolled'
      ? m.shell.biometrics.notEnrolled
      : biometrics?.status === 'unavailable'
        ? m.shell.biometrics.unavailable
        : m.shell.biometrics.hint;
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
    <SectionCard title={t.app}>
      <View style={styles.panels}>
        <Card variant="soft">
          <Text variant="kickerSm">{t.lockKicker}</Text>
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
            style={styles.control}
          />
          {biometricError ? <Notice tone="error" text={biometricError} style={styles.control} /> : null}
        </Card>

        <Card variant="soft">
          <Text variant="kickerSm">{t.remindersKicker}</Text>
          {reminderRows.length === 0 ? (
            <Text variant="small" color="textMuted" style={styles.control}>
              {t.remindersNone}
            </Text>
          ) : (
            reminderRows.map((row) => (
              <Switch
                key={row.category}
                trailing
                label={row.label}
                description={row.hint}
                value={preferences.reminders[row.category] && remindersSupported && remindersAllowed}
                disabled={!remindersSupported}
                onValueChange={(value) => void toggleReminder(row.category, value)}
                testID={`settings-reminder-${row.category}`}
                style={styles.control}
              />
            ))
          )}
          {reminderRows.length > 0 && !remindersSupported ? (
            <Text variant="hint" style={styles.control} testID="settings-reminders-unavailable">
              {t.remindersUnavailable}
            </Text>
          ) : null}
          {reminderRows.length > 0 && remindersDenied ? (
            <Notice
              tone="warning"
              text={t.remindersDenied}
              action={<TextButton label={m.common.actions.openSettings} onPress={() => void Linking.openSettings()} />}
              style={styles.control}
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
              style={styles.control}
              testID="settings-reminders-inexact"
            />
          ) : null}
        </Card>

        <Card variant="soft">
          <Text variant="kickerSm">{t.dataKicker}</Text>
          <View style={[styles.row, styles.control]}>
            <Icon name={online ? 'checkCircle' : 'wifiOff'} size={16} color={online ? 'greenText' : 'yellowText'} />
            <Text variant="smallStrong" style={styles.rowText} testID="settings-connection">
              {online ? t.connectionOnline : t.connectionOffline}
            </Text>
          </View>
          {pending.waiting > 0 ? (
            <Text variant="small" color="textMuted" style={styles.line} testID="settings-pending-writes">
              {plural(locale, pending.waiting, t.pendingForms)}
            </Text>
          ) : null}
          {pending.refused > 0 ? (
            <Text variant="small" color="yellowText" style={styles.line} testID="settings-refused-writes">
              {plural(locale, pending.refused, t.refusedForms)}
            </Text>
          ) : null}
          <Hint>
            <Text variant="hint" style={styles.line}>
              {t.dataHint}
            </Text>
          </Hint>
          {cacheCleared ? <Notice tone="success" text={t.cacheCleared} style={styles.control} testID="settings-cache-cleared" /> : null}
          <Button
            label={t.clearCache}
            variant="outline"
            size="sm"
            onPress={requestClearCache}
            style={[styles.control, styles.button]}
            testID="settings-clear-cache"
          />
        </Card>

        {user.role === 'STUDENT' || IS_MOCK_BUILD ? (
          <Card variant="soft" padded={false}>
            <Text variant="kickerSm" style={styles.listKicker}>
              {dict.nav.sections}
            </Text>
            {user.role === 'STUDENT' ? (
              <ListRow
                title={m.shell.tabs.info}
                onPress={() => navigation.open({ screen: 'student.info' })}
                divider={IS_MOCK_BUILD}
                testID="settings-student-info"
              />
            ) : null}
            {IS_MOCK_BUILD ? (
              <ListRow
                title={m.shell.demo.title}
                subtitle={m.shell.demo.entryHint}
                onPress={navigation.openDemoData}
                divider={false}
                testID="settings-demo-data"
              />
            ) : null}
          </Card>
        ) : null}

        {version ? (
          <>
            <Divider />
            <Text variant="caption" color="textSoft" align="center">
              {format(t.version, { version })}
            </Text>
          </>
        ) : null}
      </View>
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
    </SectionCard>
  );
}

const useStyles = makeStyles((t) => ({
  panels: { gap: t.space.gutter },
  control: { marginTop: t.space.md },
  line: { marginTop: t.space.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: t.space.sm },
  rowText: { flex: 1 },
  button: { alignSelf: 'flex-start' },
  listKicker: { paddingHorizontal: t.space.lg, paddingTop: t.space.lg, paddingBottom: t.space.xs },
}));
