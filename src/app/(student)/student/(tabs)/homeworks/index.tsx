// `student.homeworks` — thin route: reads the params and renders the screen.
import { StudentHomeworksScreen } from '@/screens/student/StudentHomeworksScreen';

export { RouteErrorBoundary as ErrorBoundary } from '@/screens/shell';

export default function StudentHomeworksRoute() {
  return <StudentHomeworksScreen />;
}
