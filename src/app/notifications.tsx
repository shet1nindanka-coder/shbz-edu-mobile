// `shell.notifications` — thin route.
import { ModalRouteFrame, NotificationsScreen } from '@/screens/shell';

export { RouteErrorBoundary as ErrorBoundary } from '@/screens/shell';

export default function NotificationsRoute() {
  return (
    <ModalRouteFrame presentation="fullScreen">
      <NotificationsScreen />
    </ModalRouteFrame>
  );
}
