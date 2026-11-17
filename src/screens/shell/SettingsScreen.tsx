import { useState } from 'react';
import { View } from 'react-native';

import { formatDate } from '@/domain/dates';
import { plural, useI18n } from '@/i18n';
import { useCurrentUser, usePendingWritesCount, useSession } from '@/providers';
import { makeStyles } from '@/theme';
import { Avatar, Button, Card, Dialog, Screen, SectionCard, Text } from '@/ui';

import { DetailAppBar } from './DetailAppBar';
import { AppSection } from './settings/AppSection';
import { InterfaceSection } from './settings/InterfaceSection';
import { PasswordSection } from './settings/PasswordSection';
import { ProfileSection } from './settings/ProfileSection';

/**
 * `shell.settings` (docs/spec/01-shell-auth.md §1.5; 00 §3.1): pushed from the gear. Top to bottom, as on
 * the site: interface → personal information → change password → profile status; then the app-only block,
 * and at the very bottom the profile row with "Log out" — on the site those two live in the header menu.
 * Logout has no confirmation, as on the site — except when changes typed offline are still waiting to be
 * sent (mobile-only): signing out deletes them, so the user is told how many and may cancel.
 */
export function SettingsScreen() {
  const styles = useStyles();
  const { locale, dict, m } = useI18n();
  const t = dict.settings;
  const user = useCurrentUser();
  const { signOut } = useSession();
  const [signingOut, setSigningOut] = useState(false);

  const pendingCount = usePendingWritesCount();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const logout = () => {
    if (signingOut) return;
    setConfirmOpen(false);
    setSigningOut(true);
    // The role tree unmounts when the session ends; there is no state to reset afterwards.
    void signOut();
  };

  // Nothing typed offline is lost silently: unsent changes are named before they are deleted.
  const requestLogout = () => {
    if (signingOut) return;
    if (pendingCount > 0) setConfirmOpen(true);
    else logout();
  };

  return (
    <Screen testID="settings-screen" header={<DetailAppBar title={t.title} subtitle={t.kicker} />}>
      <View style={styles.sections}>
        <InterfaceSection />
        <ProfileSection />
        <PasswordSection />

        <SectionCard title={t.profileStatus}>
          <View style={styles.tiles}>
            <Card variant="soft" style={styles.tile}>
              <Text variant="statLabel">{t.role}</Text>
              <Text variant="bodyBold" style={styles.tileValue} testID="settings-role">
                {dict.roles[user.role]}
              </Text>
            </Card>
            <Card variant="soft" style={styles.tile}>
              <Text variant="statLabel">{t.onPlatform}</Text>
              <Text variant="bodyBold" style={styles.tileValue}>
                {formatDate(user.createdAt, locale)}
              </Text>
            </Card>
          </View>
        </SectionCard>

        <AppSection />

        <Card testID="settings-profile-row">
          <View style={styles.profile}>
            <Avatar name={user.name} />
            <View style={styles.profileText}>
              <Text variant="smallBold" numberOfLines={1}>
                {user.name}
              </Text>
              <Text variant="caption" color="textSoft" numberOfLines={1}>
                {dict.roles[user.role]}
              </Text>
            </View>
          </View>
          <Button
            label={signingOut ? m.shell.settings.signingOut : dict.nav.logout}
            variant="outline"
            leftIcon="logout"
            fullWidth
            loading={signingOut}
            onPress={requestLogout}
            style={styles.logout}
            testID="settings-logout"
          />
        </Card>
      </View>
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
  sections: { gap: t.space.sectionGap },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.md },
  // Wide enough for the longest date («05 сентября 2026 г.») on one line: on a phone the two tiles stack,
  // as the site's grid does below 640 px; a tablet shows them side by side.
  tile: { flexGrow: 1, flexBasis: 200 },
  tileValue: { marginTop: t.space.xs },
  profile: { flexDirection: 'row', alignItems: 'center', gap: t.space.md },
  profileText: { flex: 1, minWidth: 0 },
  logout: { marginTop: t.space.field },
}));
