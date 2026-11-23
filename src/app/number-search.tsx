// `shell.numberSearch` — thin route.
import { ModalRouteFrame, NumberSearchScreen } from '@/screens/shell';

export { RouteErrorBoundary as ErrorBoundary } from '@/screens/shell';

export default function NumberSearchRoute() {
  return (
    <ModalRouteFrame presentation="fullScreen">
      <NumberSearchScreen />
    </ModalRouteFrame>
  );
}
