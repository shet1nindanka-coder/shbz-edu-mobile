// `shell.settings` — thin route.
import { SettingsScreen } from '@/screens/shell';

export { RouteErrorBoundary as ErrorBoundary } from '@/screens/shell';

export default function SettingsRoute() {
  return <SettingsScreen />;
}
