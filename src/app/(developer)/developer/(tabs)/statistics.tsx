// `stats.main` — thin route: reads the params and renders the screen.
import { StatsMainScreen } from '@/screens/stats/StatsMainScreen';

export { RouteErrorBoundary as ErrorBoundary } from '@/screens/shell';

export default function DeveloperStatisticsRoute() {
  return <StatsMainScreen />;
}
