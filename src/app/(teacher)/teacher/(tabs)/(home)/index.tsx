// `teacher.home` — thin route: reads the params and renders the screen.
import { TeacherHomeScreen } from '@/screens/teacher/TeacherHomeScreen';

export { RouteErrorBoundary as ErrorBoundary } from '@/screens/shell';

export default function TeacherHomeRoute() {
  return <TeacherHomeScreen />;
}
