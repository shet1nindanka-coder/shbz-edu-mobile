// `student.lesson` — thin route: reads the params and renders the screen.
import { StudentLessonScreen } from '@/screens/student/StudentLessonScreen';

export { RouteErrorBoundary as ErrorBoundary } from '@/screens/shell';

export default function StudentLessonRoute() {
  return <StudentLessonScreen />;
}
