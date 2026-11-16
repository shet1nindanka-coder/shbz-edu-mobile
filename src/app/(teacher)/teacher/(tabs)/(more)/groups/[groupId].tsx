// `groups.detail` — thin route: reads the params and renders the screen.
import { useLocalSearchParams } from 'expo-router';

import { requiredParam } from '@/navigation/routes';
import { GroupDetailScreen } from '@/screens/groups/GroupDetailScreen';

export { RouteErrorBoundary as ErrorBoundary } from '@/screens/shell';

export default function GroupDetailRoute() {
  const { groupId } = useLocalSearchParams<{ groupId?: string }>();
  return <GroupDetailScreen groupId={requiredParam(groupId)} />;
}
