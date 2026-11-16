// `content.topics` — thin route: reads the params and renders the screen.
import { ContentTopicsScreen } from '@/screens/content/ContentTopicsScreen';

export { RouteErrorBoundary as ErrorBoundary } from '@/screens/shell';

export default function DeveloperTopicsRoute() {
  return <ContentTopicsScreen />;
}
