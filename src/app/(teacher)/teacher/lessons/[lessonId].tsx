// `planner.lessonBoard` — thin route: reads the params and renders the screen.
import { useLocalSearchParams } from 'expo-router';

import { requiredParam } from '@/navigation/routes';
import { PlannerLessonBoardScreen } from '@/screens/planner/PlannerLessonBoardScreen';

export { RouteErrorBoundary as ErrorBoundary } from '@/screens/shell';

export default function PlannerLessonBoardRoute() {
  const { lessonId } = useLocalSearchParams<{ lessonId?: string }>();
  return <PlannerLessonBoardScreen lessonId={requiredParam(lessonId)} />;
}
