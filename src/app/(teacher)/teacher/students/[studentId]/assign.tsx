// `teacher.student.assign` — thin route: reads the params and renders the screen.
import { useLocalSearchParams } from 'expo-router';

import { requiredParam } from '@/navigation/routes';
import { TeacherStudentScreen } from '@/screens/teacher/TeacherStudentScreen';

export { RouteErrorBoundary as ErrorBoundary } from '@/screens/shell';

export default function TeacherStudentAssignRoute() {
  const { studentId } = useLocalSearchParams<{ studentId?: string }>();
  return <TeacherStudentScreen segment="assign" studentId={requiredParam(studentId)} />;
}
