// PLACEHOLDER of `student.homework` — the student area replaces this file's body; the export name and the props stay.
// The route file under src/app already passes the params; nothing there needs to change.
import type { ScreenParams } from '@/navigation';
import { ScreenPlaceholder } from '@/screens/shell';

/** Route params of `student.homework` (docs/spec/00-unified-contract.md §3; `ScreenParams` in src/navigation/routes.ts). */
export type StudentHomeworkScreenProps = ScreenParams['student.homework'];

export function StudentHomeworkScreen({ assignmentId }: StudentHomeworkScreenProps) {
  return <ScreenPlaceholder screenId="student.homework" params={{ assignmentId }} />;
}
