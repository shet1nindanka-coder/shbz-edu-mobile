// `calls.list` — thin route: reads the params and renders the screen.
import { useLocalSearchParams } from 'expo-router';

import { stringParam } from '@/navigation/routes';
import { CallsListScreen } from '@/screens/calls/CallsListScreen';

export { RouteErrorBoundary as ErrorBoundary } from '@/screens/shell';

export default function TeacherCallsRoute() {
  const { studentId } = useLocalSearchParams<{ studentId?: string }>();
  return <CallsListScreen studentId={stringParam(studentId)} />;
}
