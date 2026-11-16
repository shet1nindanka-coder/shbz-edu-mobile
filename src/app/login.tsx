// `auth.login` — thin route.
import { LoginScreen } from '@/screens/shell';

export { RouteErrorBoundary as ErrorBoundary } from '@/screens/shell';

export default function LoginRoute() {
  return <LoginScreen />;
}
