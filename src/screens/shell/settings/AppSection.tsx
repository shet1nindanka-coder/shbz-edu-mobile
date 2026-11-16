import { useQueryClient } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { useEffect, useState } from 'react';
import { Linking, View } from 'react-native';

import { format, plural, useI18n } from '@/i18n';
import { useAppNavigation } from '@/navigation';
import { Hint, IS_MOCK_BUILD, useCurrentUser, usePendingWritesCount, usePreferences } from '@/providers';
import { authenticateWithBiometrics, getBiometricAvailability, type BiometricAvailability } from '@/services/biometrics';
import { clearFileCache } from '@/services/files';
import { useIsOnline } from '@/services/network';
import { localNotifications, type ReminderPermissionState } from '@/services/notifications';
import type { ReminderCategory } from '@/services/preferences';
import { makeStyles } from '@/theme';
import { Button, Card, Divider, Icon, ListRow, Notice, SectionCard, Switch, Text, TextButton } from '@/ui';

type ReminderRow = { category: ReminderCategory; label: string; hint: string };

/**
 * The "App" block — what exists only in the mobile app (the site's settings page ends with the profile
 * status): the biometric lock, local reminders with their permission state, the data kept on the device,
 * and the entries that the site keeps in its menu (the student's «общая инфа», demo data in mock builds).
 */
export function AppSection() {
  const styles = useStyles();
  const { locale, m } = useI18n();
  const t = m.shell.settings;
  const user = useCurrentUser();
  const navigation = useAppNavigation();
  const queryClient = useQueryClient();
  const { preferences, setBiometricLock, setReminder } = usePreferences();
  const online = useIsOnline();
  const pendingCount = usePendingWritesCount();

  const [biometrics, setBiometrics] = useState<BiometricAvailability | null>(null);
  const [biometricError, setBiometricError] = useState<string | null>(null);
  const [permission, setPermission] = useState<ReminderPermissionState | null>(null);
  const [cacheCleared, setCacheCleared] = useState(false);

  useEffect(() => {
    let active = true;
    void getBiometricAvailability().then((value) => {
      if (active) setBiometrics(value);
    });
    void localNotifications.getPermission().then((value) => {
      if (active) setPermission(value);
    });
    return () => {
      active = false;
    };
  }, []);

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
    // The OS prompt appears the first time a category is switched on, never at start-up.
    const state = permission?.status === 'granted' ? permission : await localNotifications.requestPermission();
    setPermission(state);
    if (state.status === 'granted') setReminder(category, true);
  };

  const clearCache = () => {
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
        ? [{ category: 'parentCalls', label: t.reminderCalls, hint: t.reminderCallsHint }]
        : [];

  const biometricsReady = biometrics?.status === 'available';
  const biometricDescription =
    biometrics?.status === 'notEnrolled'
      ? m.shell.biometrics.notEnrolled
      : biometrics?.status === 'unavailable'
        ? m.shell.biometrics.unavailable
        : m.shell.biometrics.hint;
  const remindersSupported = localNotifications.supported && permission?.status !== 'unavailable';
  const remindersDenied = permission?.status === 'denied';
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
            // The lock can always be switched OFF, even if the sensor has since become unavailable.
            value={preferences.biometricLock && biometricsReady}
            disabled={!biometricsReady}
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
                value={preferences.reminders[row.category] && remindersSupported && !remindersDenied}
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
        </Card>

        <Card variant="soft">
          <Text variant="kickerSm">{t.dataKicker}</Text>
          <View style={[styles.row, styles.control]}>
            <Icon name={online ? 'checkCircle' : 'wifiOff'} size={16} color={online ? 'greenText' : 'yellowText'} />
            <Text variant="smallStrong" style={styles.rowText} testID="settings-connection">
              {online ? t.connectionOnline : t.connectionOffline}
            </Text>
          </View>
          {pendingCount > 0 ? (
            <Text variant="small" color="textMuted" style={styles.line} testID="settings-pending-writes">
              {plural(locale, pendingCount, t.pendingForms)}
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
            onPress={clearCache}
            style={[styles.control, styles.button]}
            testID="settings-clear-cache"
          />
        </Card>

        {user.role === 'STUDENT' || IS_MOCK_BUILD ? (
          <Card variant="soft" padded={false}>
            <Text variant="kickerSm" style={styles.listKicker}>
              {t.moreKicker}
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
