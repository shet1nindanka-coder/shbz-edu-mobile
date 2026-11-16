// PLACEHOLDER of `teacher.home` — the teacher area replaces this file's body; the export name and the props stay.
// The route file under src/app already passes the params; nothing there needs to change.
import { ScreenPlaceholder } from '@/screens/shell';

export function TeacherHomeScreen() {
  return (
    <ScreenPlaceholder
      screenId="teacher.home"
      links={[{ screen: 'content.topics' }, { screen: 'teacher.students' }, { screen: 'calls.list' }, { screen: 'groups.list' }]}
    />
  );
}
