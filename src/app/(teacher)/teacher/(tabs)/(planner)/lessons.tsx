// `planner.lessons` — thin route: reads the params and renders the screen.
import { PlannerLessonsScreen } from '@/screens/planner/PlannerLessonsScreen';

export { RouteErrorBoundary as ErrorBoundary } from '@/screens/shell';

export default function PlannerLessonsRoute() {
  return <PlannerLessonsScreen />;
}
