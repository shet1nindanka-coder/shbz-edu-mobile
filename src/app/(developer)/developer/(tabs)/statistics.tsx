// `stats.main` — thin route: reads the params and renders the screen.
import { useLocalSearchParams } from 'expo-router';

import { statsViewParam, stringParam } from '@/navigation/routes';
import { StatsMainScreen } from '@/screens/stats/StatsMainScreen';

export { RouteErrorBoundary as ErrorBoundary } from '@/screens/shell';

export default function DeveloperStatisticsRoute() {
  const { view, studentId } = useLocalSearchParams<{ view?: string; studentId?: string }>();
  return <StatsMainScreen view={statsViewParam(view)} studentId={stringParam(studentId)} />;
}
