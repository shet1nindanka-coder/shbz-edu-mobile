// `planner.drafts` — thin route: reads the params and renders the screen.
import { PlannerDraftsScreen } from '@/screens/planner/PlannerDraftsScreen';

export { RouteErrorBoundary as ErrorBoundary } from '@/screens/shell';

export default function PlannerDraftsRoute() {
  return <PlannerDraftsScreen />;
}
