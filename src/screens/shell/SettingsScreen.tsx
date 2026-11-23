import { useState } from 'react';
import { View } from 'react-native';

import { formatDate } from '@/domain/dates';
import { format, plural, useI18n } from '@/i18n';
import { useAppNavigation } from '@/navigation';
import { IS_MOCK_BUILD, useCurrentUser, usePendingWritesCount, useSession } from '@/providers';
import { makeStyles, useTheme } from '@/theme';
import { Avatar, BottomSheet, Button, Card, Dialog, Icon, ListCard, ListRow, Screen, Text, navIcons } from '@/ui';

import { DetailAppBar } from './DetailAppBar';
import { screenTitle } from './screen-titles';
import { AppSection } from './settings/AppSection';
import { InterfaceSection } from './settings/InterfaceSection';
import { PasswordSection } from './settings/PasswordSection';
import { ProfileSection } from './settings/ProfileSection';

/**
 * `shell.settings` — «Профиль» (docs/spec/01-shell-auth.md §1.5; layout: docs/design/glass-over-paper.md
 * §8): opened by the avatar of a screen header. Top to bottom: who is signed in; the rows that lead on —
 * «Баллы» for a student, «Имя и пароль», the demo data of mock builds; the interface switches; the
 * app-only blocks (biometric lock, reminders, saved data); and «Выйти».
 *
 * The forms — the display name and the password — are folded behind «Имя и пароль»: the screen starts
 * with what one looks at, not with what one rarely edits.
 *
 * Logout has no confirmation, as on the site — except when changes typed offline are still waiting to be
 * sent (mobile-only): signing out deletes them, so the user is told how many and may cancel.
 */
export function SettingsScreen() {
  const styles = useStyles();
  const theme = useTheme();
  const { locale, dict, m } = useI18n();
  const user = useCurrentUser();
  const navigation = useAppNavigation();
  const { signOut } = useSession();
  const [signingOut, setSigningOut] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  const pendingCount = usePendingWritesCount();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const logout = () => {
    if (signingOut) return;
    setConfirmOpen(false);
    setSigningOut(true);
    // The role tree unmounts when the session ends; there is no state to reset afterwards. This sign-out
    // deletes the unsent changes: they were named in the confirmation (or there are none).
    void signOut({ discardUnsentWrites: true });
  };

  // Nothing typed offline is lost silently: unsent changes are named before they are deleted.
  const requestLogout = () => {
    if (signingOut) return;
    if (pendingCount > 0) setConfirmOpen(true);
    else logout();
  };

  // "Back" leads to the role's first section; the link names it.
  const homeTitle = screenTitle(user.role === 'STUDENT' ? 'student.home' : user.role === 'TEACHER' ? 'teacher.home' : 'content.topics', m.shell.tabs);
  const rowIcon = (name: Parameters<typeof Icon>[0]['name']) => <Icon name={name} size={theme.sizes.icon.md} color="label" />;

  return (
    <Screen testID="settings-screen" header={<DetailAppBar title={m.shell.tabs.profile} backTitle={homeTitle} />}>
      <Card testID="settings-profile-row">
        <View style={styles.profile}>
          <Avatar name={user.name} size={theme.sizes.avatarLg} />
          <View style={styles.profileText}>
            <Text variant="cardTitle" numberOfLines={1}>
              {user.name}
            </Text>
            <Text variant="small" color="textMuted" numberOfLines={1} testID="settings-role">
              {user.email} · {dict.roles[user.role].toLocaleLowerCase()}
            </Text>
            <Text variant="small" color="textMuted" numberOfLines={1}>
              {format(m.shell.settings.onPlatformSince, { date: formatDate(user.createdAt, locale) })}
            </Text>
          </View>
        </View>
      </Card>

      <ListCard testID="settings-links">
        {user.role === 'STUDENT' ? (
          <ListRow
            title={m.shell.settings.scores}
            left={rowIcon(navIcons.student.info)}
            chevron
            onPress={() => navigation.open({ screen: 'student.info' })}
            testID="settings-student-info"
          />
        ) : null}
        <ListRow title={m.shell.settings.account} left={rowIcon('user')} chevron onPress={() => setAccountOpen(true)} testID="settings-account" />
        {IS_MOCK_BUILD ? (
          <ListRow title={m.shell.demo.title} left={rowIcon('database')} chevron onPress={navigation.openDemoData} testID="settings-demo-data" />
        ) : null}
      </ListCard>

      <InterfaceSection />
      <AppSection />

      <Button
        label={signingOut ? m.shell.settings.signingOut : dict.nav.logout}
        variant="danger"
        leftIcon="logout"
        fullWidth
        loading={signingOut}
        onPress={requestLogout}
        testID="settings-logout"
      />

      <BottomSheet
        visible={accountOpen}
        onClose={() => setAccountOpen(false)}
        closeLabel={m.common.actions.close}
        title={m.shell.settings.account}
        testID="settings-account-sheet"
      >
        <View style={styles.forms}>
          <ProfileSection />
          <PasswordSection />
        </View>
      </BottomSheet>

      <Dialog
        visible={confirmOpen}
        title={m.shell.settings.signOutPendingTitle}
        description={plural(locale, pendingCount, m.shell.settings.signOutPendingBodyForms)}
        confirmLabel={dict.nav.logout}
        cancelLabel={m.common.actions.cancel}
        onConfirm={logout}
        onCancel={() => setConfirmOpen(false)}
        testID="settings-logout-confirm"
      />
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  profile: { flexDirection: 'row', alignItems: 'center', gap: t.space.md },
  profileText: { flex: 1, minWidth: 0, gap: t.space.xxxs },
  forms: { gap: t.space.lg, paddingBottom: t.space.sm },
}));
