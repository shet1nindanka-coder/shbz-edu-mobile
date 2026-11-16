// `student.theory` — thin route: reads the params and renders the screen.
import { StudentTheoryScreen } from '@/screens/student/StudentTheoryScreen';

export { RouteErrorBoundary as ErrorBoundary } from '@/screens/shell';

export default function StudentTheoryRoute() {
  return <StudentTheoryScreen />;
}
