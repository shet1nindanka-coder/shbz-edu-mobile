// `teacher.student.review` — thin route: reads the params and renders the screen.
import { useLocalSearchParams } from 'expo-router';

import { requiredParam, stringParam } from '@/navigation/routes';
import { TeacherStudentScreen } from '@/screens/teacher/TeacherStudentScreen';

export { RouteErrorBoundary as ErrorBoundary } from '@/screens/shell';

export default function TeacherStudentReviewRoute() {
  const { studentId, assignmentId } = useLocalSearchParams<{ studentId?: string; assignmentId?: string }>();
  return (
    <TeacherStudentScreen
      studentId={requiredParam(studentId)}
      assignmentId={stringParam(assignmentId)}
      segment="review"
    />
  );
}
