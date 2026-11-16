// PLACEHOLDER of `groups.list` — the groups area replaces this file's body; the export name and the props stay.
// The route file under src/app already passes the params; nothing there needs to change.
import { ScreenPlaceholder } from '@/screens/shell';

export function GroupsListScreen() {
  return (
    <ScreenPlaceholder
      screenId="groups.list"
      links={[{ screen: 'groups.detail', groupId: 'grp_8a' }, { screen: 'planner.lessonNew', groupId: 'grp_8a' }]}
    />
  );
}
