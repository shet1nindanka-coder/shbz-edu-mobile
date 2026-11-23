import { format, useI18n } from '@/i18n';
import { useAppNavigation } from '@/navigation';
import { useCurrentUser } from '@/providers';
import { useTheme } from '@/theme';
import { Avatar, IconButton, PressableScale, navIcons } from '@/ui';

import { useNotifications } from './use-shell-data';

/**
 * The three round buttons of a screen header (docs/design/glass-over-paper.md §5): number search, the bell
 * with its unread counter, and the avatar that leads to the profile and settings. Search opens the panel
 * at the top of the screen.
 */
export function ShellActions() {
  const theme = useTheme();
  const { dict, m } = useI18n();
  const navigation = useAppNavigation();
  const user = useCurrentUser();
  const notifications = useNotifications();
  const unread = notifications.data?.unreadCount ?? 0;
  const t = dict.student.notifications;

  return (
    <>
      <IconButton
        icon={navIcons.search}
        variant="glass"
        accessibilityLabel={dict.numberSearch.aria}
        onPress={navigation.openNumberSearch}
        testID="app-bar-search"
      />
      <IconButton
        icon={navIcons.notifications}
        variant="glass"
        accessibilityLabel={unread > 0 ? format(t.ariaUnread, { count: unread }) : t.aria}
        badge={unread}
        onPress={navigation.openNotifications}
        testID="app-bar-bell"
      />
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={m.shell.nav.profile}
        onPress={navigation.openSettings}
        testID="app-bar-settings"
        style={{ borderRadius: theme.radii.full }}
      >
        <Avatar name={user.name} />
      </PressableScale>
    </>
  );
}
