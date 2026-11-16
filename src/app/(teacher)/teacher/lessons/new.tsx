// `planner.lessonNew` — thin route: reads the params and renders the screen.
import { useLocalSearchParams } from 'expo-router';

import { stringParam } from '@/navigation/routes';
import { PlannerLessonNewScreen } from '@/screens/planner/PlannerLessonNewScreen';

export { RouteErrorBoundary as ErrorBoundary } from '@/screens/shell';

export default function PlannerLessonNewRoute() {
  const { groupId, studentId } = useLocalSearchParams<{ groupId?: string; studentId?: string }>();
  return <PlannerLessonNewScreen groupId={stringParam(groupId)} studentId={stringParam(studentId)} />;
}
