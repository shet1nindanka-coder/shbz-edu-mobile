// PLACEHOLDER of `groups.detail` — the groups area replaces this file's body; the export name and the props stay.
// The route file under src/app already passes the params; nothing there needs to change.
import type { ScreenParams } from '@/navigation';
import { ScreenPlaceholder } from '@/screens/shell';

/** Route params of `groups.detail` (docs/spec/00-unified-contract.md §3; `ScreenParams` in src/navigation/routes.ts). */
export type GroupDetailScreenProps = ScreenParams['groups.detail'];

export function GroupDetailScreen({ groupId }: GroupDetailScreenProps) {
  return (
    <ScreenPlaceholder
      screenId="groups.detail"
      params={{ groupId }}
      links={[{ screen: 'planner.lessonNew', groupId }, { screen: 'planner.draftNew', groupId }, { screen: 'teacher.student.review', studentId: 'usr_ilya' }]}
    />
  );
}
