import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { qk, useApi } from '@/api';
import type { NavTarget, NotificationItem, NotificationsResponse } from '@/api/types';
import { formatNotificationTime } from '@/domain/dates';
import { useI18n } from '@/i18n';
import { navigateTo, useAppNavigation } from '@/navigation';
import { useRole } from '@/providers';
import { makeStyles, useTheme } from '@/theme';
import { BottomSheet, EmptyState, LoadingState, PressableScale, Text, TextButton } from '@/ui';

import { useNotifications } from './use-shell-data';

const QUERY_KEY = qk('shell', 'listNotifications');

/**
 * `shell.notifications` (docs/spec/01-shell-auth.md §1.4): the bell panel as a bottom sheet. Opening it
 * re-fetches the list; a tap on a row closes the sheet, marks the row read (optimistically — failures are
 * ignored, as on the site) and opens its target. A row whose target the current role cannot open, or
 * that has none (a broadcast), is only marked read.
 */
export function NotificationsScreen() {
  const styles = useStyles();
  const theme = useTheme();
  const api = useApi();
  const queryClient = useQueryClient();
  const { locale, dict, m } = useI18n();
  const t = dict.student.notifications;
  const role = useRole();
  const navigation = useAppNavigation();
  const notifications = useNotifications();
  const [visible, setVisible] = useState(true);
  const pendingTarget = useRef<NavTarget | null>(null);

  // Every opening re-fetches (01 §1.4 "Interactions").
  const { refetch } = notifications;
  useEffect(() => {
    void refetch();
  }, [refetch]);

  // Rows that arrive while the sheet is open are highlighted for a moment; the first load is not.
  const known = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set());
  const items = notifications.data?.notifications;
  useEffect(() => {
    if (!items) return;
    if (known.current === null) {
      known.current = new Set(items.map((item) => item.id));
      return;
    }
    const arrived = items.filter((item) => !known.current?.has(item.id)).map((item) => item.id);
    if (arrived.length === 0) return;
    arrived.forEach((id) => known.current?.add(id));
    setFresh(new Set(arrived));
    const timer = setTimeout(() => setFresh(new Set()), theme.motion.duration.freshMark);
    return () => clearTimeout(timer);
  }, [items, theme.motion.duration.freshMark]);

  const markRead = useMutation({
    mutationFn: (notificationId?: string) => api.shell.markNotificationsRead(notificationId ? { notificationId } : {}),
    onMutate: async (notificationId) => {
      // The sheet's opening refetch may still be in flight: its answer was read before this write and would
      // overwrite the optimistic rows with unread ones, while onSuccess zeroes the count and hides the button.
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const now = new Date().toISOString();
      queryClient.setQueryData<NotificationsResponse>(QUERY_KEY, (current) => {
        if (!current) return current;
        const wasUnread = notificationId
          ? current.notifications.some((item) => item.id === notificationId && item.readAt === null)
          : true;
        return {
          notifications: current.notifications.map((item) =>
            item.readAt === null && (!notificationId || item.id === notificationId) ? { ...item, readAt: now } : item,
          ),
          unreadCount: notificationId ? Math.max(0, current.unreadCount - (wasUnread ? 1 : 0)) : 0,
        };
      });
    },
    onSuccess: ({ unreadCount }) => {
      // The server's count covers rows beyond the 20 shown.
      queryClient.setQueryData<NotificationsResponse>(QUERY_KEY, (current) => (current ? { ...current, unreadCount } : current));
    },
    // A read that starts after the write is consistent with it (and restores the list a cancelled refetch
    // did not deliver).
    onSettled: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  const openRow = (item: NotificationItem) => {
    if (item.readAt === null) markRead.mutate(item.id);
    pendingTarget.current = navigation.canOpen(item.target) ? item.target : null;
    setVisible(false);
  };

  const onClosed = () => {
    const target = pendingTarget.current;
    pendingTarget.current = null;
    // Opening the target also removes this sheet's route; without a target the route simply goes away.
    if (target && role && navigateTo(target, role)) return;
    navigation.back();
  };

  const unreadCount = notifications.data?.unreadCount ?? 0;

  return (
    <BottomSheet
      visible={visible}
      onClose={() => setVisible(false)}
      onClosed={onClosed}
      closeLabel={m.common.actions.close}
      title={t.title}
      padded={false}
      testID="notifications-sheet"
    >
      {unreadCount > 0 ? (
        <View style={styles.actions}>
          <TextButton label={t.markAllRead} onPress={() => markRead.mutate(undefined)} testID="notifications-mark-all" />
        </View>
      ) : null}

      {!items ? (
        // Before the first answer: three skeleton rows. A failed first load keeps them (site behaviour).
        <LoadingState variant="list" count={3} accessibilityLabel={m.common.a11y.loading} style={styles.loading} />
      ) : items.length === 0 ? (
        <EmptyState variant="plain" title={t.empty} testID="notifications-empty" />
      ) : (
        items.map((item, index) => {
          const unread = item.readAt === null;
          return (
            <PressableScale
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={item.body ? `${item.title}. ${item.body}` : item.title}
              accessibilityState={{ selected: unread }}
              onPress={() => openRow(item)}
              scaleTo={1}
              testID={`notification-${item.id}`}
              style={[
                styles.row,
                index < items.length - 1 ? styles.rowDivider : null,
                fresh.has(item.id) ? styles.rowFresh : null,
              ]}
              pressedStyle={{ opacity: 0.6 }}
            >
              <View style={[styles.dot, unread ? styles.dotUnread : null]} />
              <View style={styles.texts}>
                <Text variant={unread ? 'bodyBold' : 'bodyStrong'}>{item.title}</Text>
                {item.body ? (
                  <Text variant="small" color="textMuted">
                    {item.body}
                  </Text>
                ) : null}
                <Text variant="small" color="textMuted">
                  {formatNotificationTime(item.createdAt, t, locale)}
                </Text>
              </View>
            </PressableScale>
          );
        })
      )}
    </BottomSheet>
  );
}

const useStyles = makeStyles((t) => ({
  actions: { alignItems: 'flex-end', paddingHorizontal: t.space.card, paddingBottom: t.space.xs },
  loading: { paddingHorizontal: t.space.card, paddingBottom: t.space.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: t.space.md,
    paddingHorizontal: t.space.card,
    paddingVertical: t.space.md,
    minHeight: t.sizes.row,
  },
  rowDivider: { borderBottomWidth: t.borders.hairline, borderBottomColor: t.colors.line },
  rowFresh: { backgroundColor: t.colors.softBg },
  // The unread mark: a small ink dot before the title (the accent is kept for actions and progress).
  dot: { width: t.space.sm, height: t.space.sm, borderRadius: t.radii.full, marginTop: t.space.sm, backgroundColor: 'transparent' },
  dotUnread: { backgroundColor: t.colors.textStrong },
  texts: { flex: 1, minWidth: 0, gap: t.space.xxxs },
}));
