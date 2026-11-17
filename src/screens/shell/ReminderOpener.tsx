import { useEffect, useRef } from 'react';

import { navigateTo, useTrackPosition } from '@/navigation';
import { parseAppLink, type AppLink } from '@/navigation/routes';
import { useSession } from '@/providers';
import { localNotifications } from '@/services/notifications';

/**
 * Opens the screen a tapped local reminder points at. The payload crossed the OS as plain data, so it is
 * validated first; a link the current role cannot open is dropped. A tap that started the app waits until
 * the stored session is restored; a tap while signed out (or one whose restore ended signed out) is dropped:
 * the reminder belonged to an account that is gone, and must not lead whoever signs in next to its screen.
 * It also keeps the navigation position current for `navigateTo`.
 * Renders nothing; mounted once inside the navigator.
 */
export function ReminderOpener() {
  useTrackPosition();
  const { status, user } = useSession();
  const role = status === 'signedIn' ? (user?.role ?? null) : null;
  const roleRef = useRef(role);
  const statusRef = useRef(status);
  const waiting = useRef<AppLink | null>(null);

  useEffect(() => {
    roleRef.current = role;
    statusRef.current = status;
    if (status === 'signedOut') waiting.current = null;
    if (role !== null && waiting.current) {
      const link = waiting.current;
      waiting.current = null;
      navigateTo(link, role);
    }
  }, [role, status]);

  useEffect(
    () =>
      localNotifications.listenForOpens((raw) => {
        const link = parseAppLink(raw);
        if (!link) return;
        if (roleRef.current !== null) navigateTo(link, roleRef.current);
        // Only the stored session (still restoring, or waiting for a connection) may claim it.
        else if (statusRef.current === 'restoring' || statusRef.current === 'restoreFailed') waiting.current = link;
      }),
    [],
  );

  return null;
}
