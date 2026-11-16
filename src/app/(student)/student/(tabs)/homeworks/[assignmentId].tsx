// `student.homework` — thin route: reads the params and renders the screen.
import { useLocalSearchParams } from 'expo-router';

import { requiredParam } from '@/navigation/routes';
import { StudentHomeworkScreen } from '@/screens/student/StudentHomeworkScreen';

export { RouteErrorBoundary as ErrorBoundary } from '@/screens/shell';

export default function StudentHomeworkRoute() {
  const { assignmentId } = useLocalSearchParams<{ assignmentId?: string }>();
  return <StudentHomeworkScreen assignmentId={requiredParam(assignmentId)} />;
}
