// `student.number` — thin route: reads the params and renders the screen.
import { useLocalSearchParams } from 'expo-router';

import { requiredParam } from '@/navigation/routes';
import { StudentNumberScreen } from '@/screens/student/StudentNumberScreen';

export { RouteErrorBoundary as ErrorBoundary } from '@/screens/shell';

export default function StudentNumberRoute() {
  const { number } = useLocalSearchParams<{ number?: string }>();
  return <StudentNumberScreen number={requiredParam(number)} />;
}
