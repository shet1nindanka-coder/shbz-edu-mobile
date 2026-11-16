// `teacher.students` — thin route: reads the params and renders the screen.
import { TeacherStudentsScreen } from '@/screens/teacher/TeacherStudentsScreen';

export { RouteErrorBoundary as ErrorBoundary } from '@/screens/shell';

export default function TeacherStudentsRoute() {
  return <TeacherStudentsScreen />;
}
