// PLACEHOLDER of `student.home` — the student area replaces this file's body; the export name and the props stay.
// The route file under src/app already passes the params; nothing there needs to change.
import { ScreenPlaceholder } from '@/screens/shell';

export function StudentHomeScreen() {
  return (
    <ScreenPlaceholder
      screenId="student.home"
      links={[{ screen: 'student.info' }, { screen: 'student.homeworks' }, { screen: 'student.homework', assignmentId: 'hw_ilya_open' }, { screen: 'student.deadlines' }]}
    />
  );
}
