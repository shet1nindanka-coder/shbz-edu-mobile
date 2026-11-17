// `planner.lessonNew` — thin route: reads the params and renders the screen.
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { stringParam } from '@/navigation/routes';
import { PlannerLessonNewScreen } from '@/screens/planner/PlannerLessonNewScreen';

export { RouteErrorBoundary as ErrorBoundary } from '@/screens/shell';

export default function PlannerLessonNewRoute() {
  const { groupId, studentId } = useLocalSearchParams<{ groupId?: string; studentId?: string }>();
  // While a target picked on the chooser is open, "back" (the app bar arrow, Android's back) returns to
  // the chooser inside this route. The iOS edge swipe would pop the whole route instead, so it is off
  // for that step: no back gesture may leave the screen while the visible back goes to the chooser.
  const [innerStep, setInnerStep] = useState(false);
  return (
    <>
      <Stack.Screen options={{ gestureEnabled: !innerStep }} />
      <PlannerLessonNewScreen groupId={stringParam(groupId)} studentId={stringParam(studentId)} onInnerStepChange={setInnerStep} />
    </>
  );
}
