import { useEffect, useRef } from 'react';

import { navigateTo, useTrackPosition } from '@/navigation';
import { parseAppLink, type AppLink } from '@/navigation/routes';
import { useSession } from '@/providers';
import { localNotifications } from '@/services/notifications';

/**
 * Opens the screen a tapped local reminder points at. The payload crossed the OS as plain data, so it is
 * validated first; a link the current role cannot open is dropped (the reminder may belong to an account
 * that has since signed out). A tap that started the app waits until the session is restored.
 * It also keeps the navigation position current for `navigateTo`.
 * Renders nothing; mounted once inside the navigator.
 */
export function ReminderOpener() {
  useTrackPosition();
  const { status, user } = useSession();
  const role = status === 'signedIn' ? (user?.role ?? null) : null;
  const roleRef = useRef(role);
  const waiting = useRef<AppLink | null>(null);

  useEffect(() => {
    roleRef.current = role;
    if (role !== null && waiting.current) {
      const link = waiting.current;
      waiting.current = null;
      navigateTo(link, role);
    }
  }, [role]);

  useEffect(
    () =>
      localNotifications.listenForOpens((raw) => {
        const link = parseAppLink(raw);
        if (!link) return;
        if (roleRef.current !== null) navigateTo(link, roleRef.current);
        else waiting.current = link;
      }),
    [],
  );

  return null;
}
