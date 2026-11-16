// PLACEHOLDER of `planner.lessonNew` — the planner area replaces this file's body; the export name and the props stay.
// The route file under src/app already passes the params; nothing there needs to change.
import type { ScreenParams } from '@/navigation';
import { ScreenPlaceholder } from '@/screens/shell';

/** Route params of `planner.lessonNew` (docs/spec/00-unified-contract.md §3; `ScreenParams` in src/navigation/routes.ts). */
export type PlannerLessonNewScreenProps = ScreenParams['planner.lessonNew'];

export function PlannerLessonNewScreen({ groupId, studentId }: PlannerLessonNewScreenProps) {
  return <ScreenPlaceholder screenId="planner.lessonNew" params={{ groupId, studentId }} />;
}
