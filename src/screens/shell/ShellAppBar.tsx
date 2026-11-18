import { useWindowDimensions, View } from 'react-native';

import { streakForDay } from '@/domain/student-streak';
import { format, useI18n } from '@/i18n';
import { useAppNavigation } from '@/navigation';
import { useRole } from '@/providers';
import { makeStyles } from '@/theme';
import { AppBar, IconButton, Logo, MAX_FONT_SCALE, PressableScale, Text, navIcons } from '@/ui';

import { StreakBadge } from './StreakBadge';
import { useNotifications, useStreakToday, useStudentStreak } from './use-shell-data';

/**
 * Narrowest window (at the regular font size) in which a section title and the streak pill fit next to
 * the three round buttons. Below it the pill gives way: the title is what names the screen, and the streak
 * is one tap away on the overview. Verified at 320 («Дедлайны», «Теория») and 360.
 */
const STREAK_PILL_MIN_WIDTH = 360;

export type ShellAppBarProps = {
  /**
   * Section title of the tab root. Omit it on the role's home tab: the bar then shows the logo, as the
   * site's header does (a tap leads home).
   */
  title?: string;
  testID?: string;
};

/**
 * Top app bar of every tab root (docs/spec/00-unified-contract.md §3.1): logo or section title, then the
 * three shell actions — number search, the bell with its unread counter, the settings gear. A student
 * also sees the streak pill next to a section title (the overview shows the full widget instead); on the
 * narrowest phones the pill is left out so the title stays readable.
 *
 * Usage: `<Screen header={<ShellAppBar title={m.shell.tabs.homeworks} />} bottomInset={false}>`.
 */
export function ShellAppBar({ title, testID }: ShellAppBarProps) {
  const styles = useStyles();
  const { dict } = useI18n();
  const navigation = useAppNavigation();
  const role = useRole();
  const notifications = useNotifications();
  const streak = useStudentStreak();
  // A cached streak from an earlier day is counted on today, as the overview's widget counts it.
  const streakToday = useStreakToday();
  const unread = notifications.data?.unreadCount ?? 0;
  const t = dict.student.notifications;
  const window = useWindowDimensions();
  // Larger system text needs proportionally more room for the same title.
  const roomForStreak = window.width >= STREAK_PILL_MIN_WIDTH * Math.min(Math.max(window.fontScale, 1), MAX_FONT_SCALE);

  const left =
    title === undefined ? (
      <PressableScale accessibilityRole="button" accessibilityLabel={dict.common.home} onPress={navigation.goHome} scaleTo={1} hitSlop={10}>
        <Logo size={24} />
      </PressableScale>
    ) : (
      <View style={styles.titleRow}>
        <Text variant="cardTitle" numberOfLines={1} accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
        {role === 'STUDENT' && streak.data && roomForStreak ? (
          <StreakBadge
            currentStreak={streakForDay(streak.data, streakToday).currentStreak}
            onPress={() => navigation.open({ screen: 'student.home' })}
            testID="app-bar-streak"
          />
        ) : null}
      </View>
    );

  return (
    <AppBar
      testID={testID ?? 'shell-app-bar'}
      left={left}
      right={
        <>
          <IconButton
            icon={navIcons.search}
            accessibilityLabel={dict.numberSearch.aria}
            onPress={navigation.openNumberSearch}
            testID="app-bar-search"
          />
          <IconButton
            icon={navIcons.notifications}
            accessibilityLabel={unread > 0 ? format(t.ariaUnread, { count: unread }) : t.aria}
            badge={unread}
            onPress={navigation.openNotifications}
            testID="app-bar-bell"
          />
          <IconButton
            icon={navIcons.settings}
            accessibilityLabel={dict.nav.settings}
            onPress={navigation.openSettings}
            testID="app-bar-settings"
          />
        </>
      }
    />
  );
}

const useStyles = makeStyles((t) => ({
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: t.space.sm, maxWidth: '100%' },
  title: { flexShrink: 1 },
}));
