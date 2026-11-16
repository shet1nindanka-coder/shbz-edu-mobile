// `content.number` — thin route: reads the params and renders the screen.
import { useLocalSearchParams } from 'expo-router';

import { requiredParam } from '@/navigation/routes';
import { ContentNumberScreen } from '@/screens/content/ContentNumberScreen';

export { RouteErrorBoundary as ErrorBoundary } from '@/screens/shell';

export default function DeveloperNumberRoute() {
  const { topicId, number } = useLocalSearchParams<{ topicId?: string; number?: string }>();
  return <ContentNumberScreen topicId={requiredParam(topicId)} number={requiredParam(number)} />;
}
