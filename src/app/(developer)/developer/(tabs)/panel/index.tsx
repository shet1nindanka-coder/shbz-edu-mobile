// `developer.panel` — thin route: reads the params and renders the screen.
import { useLocalSearchParams } from 'expo-router';

import { panelTabParam } from '@/navigation/routes';
import { DeveloperPanelScreen } from '@/screens/developer/DeveloperPanelScreen';

export { RouteErrorBoundary as ErrorBoundary } from '@/screens/shell';

export default function DeveloperPanelRoute() {
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  return <DeveloperPanelScreen tab={panelTabParam(tab)} />;
}
