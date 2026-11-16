// `student.home` — thin route: reads the params and renders the screen.
import { StudentHomeScreen } from '@/screens/student/StudentHomeScreen';

export { RouteErrorBoundary as ErrorBoundary } from '@/screens/shell';

export default function StudentHomeRoute() {
  return <StudentHomeScreen />;
}
