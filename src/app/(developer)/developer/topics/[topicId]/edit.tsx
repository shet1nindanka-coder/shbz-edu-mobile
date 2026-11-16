// `content.topicEdit` — thin route: reads the params and renders the screen.
import { useLocalSearchParams } from 'expo-router';

import { requiredParam } from '@/navigation/routes';
import { ContentTopicEditScreen } from '@/screens/content/ContentTopicEditScreen';

export { RouteErrorBoundary as ErrorBoundary } from '@/screens/shell';

export default function DeveloperTopicEditRoute() {
  const { topicId } = useLocalSearchParams<{ topicId?: string }>();
  return <ContentTopicEditScreen topicId={requiredParam(topicId)} />;
}
