// `planner.draftNew` — thin route: reads the params and renders the screen.
import { useLocalSearchParams } from 'expo-router';

import { stringParam } from '@/navigation/routes';
import { PlannerDraftNewScreen } from '@/screens/planner/PlannerDraftNewScreen';

export { RouteErrorBoundary as ErrorBoundary } from '@/screens/shell';

export default function PlannerDraftNewRoute() {
  const { lessonId, groupId, studentId } = useLocalSearchParams<{ lessonId?: string; groupId?: string; studentId?: string }>();
  return (
    <PlannerDraftNewScreen
      lessonId={stringParam(lessonId)}
      groupId={stringParam(groupId)}
      studentId={stringParam(studentId)}
    />
  );
}
