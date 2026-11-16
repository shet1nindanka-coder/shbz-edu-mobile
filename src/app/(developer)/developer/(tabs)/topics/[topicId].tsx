// `content.topic` — thin route: reads the params and renders the screen.
import { useLocalSearchParams } from 'expo-router';

import { requiredParam } from '@/navigation/routes';
import { ContentTopicScreen } from '@/screens/content/ContentTopicScreen';

export { RouteErrorBoundary as ErrorBoundary } from '@/screens/shell';

export default function DeveloperTopicRoute() {
  const { topicId } = useLocalSearchParams<{ topicId?: string }>();
  return <ContentTopicScreen topicId={requiredParam(topicId)} />;
}
