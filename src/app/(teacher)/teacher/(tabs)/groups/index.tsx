// `groups.list` — thin route: reads the params and renders the screen.
import { GroupsListScreen } from '@/screens/groups/GroupsListScreen';

export { RouteErrorBoundary as ErrorBoundary } from '@/screens/shell';

export default function GroupsListRoute() {
  return <GroupsListScreen />;
}
