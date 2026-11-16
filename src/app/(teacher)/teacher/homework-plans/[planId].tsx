// `planner.draftBoard` — thin route: reads the params and renders the screen.
import { useLocalSearchParams } from 'expo-router';

import { requiredParam } from '@/navigation/routes';
import { PlannerDraftBoardScreen } from '@/screens/planner/PlannerDraftBoardScreen';

export { RouteErrorBoundary as ErrorBoundary } from '@/screens/shell';

export default function PlannerDraftBoardRoute() {
  const { planId } = useLocalSearchParams<{ planId?: string }>();
  return <PlannerDraftBoardScreen planId={requiredParam(planId)} />;
}
