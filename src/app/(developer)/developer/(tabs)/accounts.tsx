// `developer.accounts` — thin route: reads the params and renders the screen.
import { DeveloperAccountsScreen } from '@/screens/developer/DeveloperAccountsScreen';

export { RouteErrorBoundary as ErrorBoundary } from '@/screens/shell';

export default function DeveloperAccountsRoute() {
  return <DeveloperAccountsScreen />;
}
