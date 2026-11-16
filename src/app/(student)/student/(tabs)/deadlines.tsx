// `student.deadlines` — thin route: reads the params and renders the screen.
import { StudentDeadlinesScreen } from '@/screens/student/StudentDeadlinesScreen';

export { RouteErrorBoundary as ErrorBoundary } from '@/screens/shell';

export default function StudentDeadlinesRoute() {
  return <StudentDeadlinesScreen />;
}
