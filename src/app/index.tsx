// `auth.launch` — root redirect (docs/spec/01-shell-auth.md §1.1): signed in → the role's home,
// otherwise → login. The bootstrap spinner itself is shown by the root layout while the session restores.
import { Redirect, type Href } from 'expo-router';

import { homeHref } from '@/navigation';
import { useSession } from '@/providers';
import { LaunchScreen } from '@/screens/shell';

export { RouteErrorBoundary as ErrorBoundary } from '@/screens/shell';

export default function LaunchRoute() {
  const { status, user } = useSession();
  if (status === 'signedIn' && user) return <Redirect href={homeHref(user.role) as Href} />;
  if (status === 'signedOut') return <Redirect href={'/login' as Href} />;
  return <LaunchScreen />;
}
