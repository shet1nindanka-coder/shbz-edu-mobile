// `student.info` — thin route: reads the params and renders the screen.
import { StudentInfoScreen } from '@/screens/student/StudentInfoScreen';

export { RouteErrorBoundary as ErrorBoundary } from '@/screens/shell';

export default function StudentInfoRoute() {
  return <StudentInfoScreen />;
}
