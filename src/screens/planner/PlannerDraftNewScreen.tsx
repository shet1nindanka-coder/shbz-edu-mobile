// PLACEHOLDER of `planner.draftNew` — the planner area replaces this file's body; the export name and the props stay.
// The route file under src/app already passes the params; nothing there needs to change.
import type { ScreenParams } from '@/navigation';
import { ScreenPlaceholder } from '@/screens/shell';

/** Route params of `planner.draftNew` (docs/spec/00-unified-contract.md §3; `ScreenParams` in src/navigation/routes.ts). */
export type PlannerDraftNewScreenProps = ScreenParams['planner.draftNew'];

export function PlannerDraftNewScreen({ lessonId, groupId, studentId }: PlannerDraftNewScreenProps) {
  return <ScreenPlaceholder screenId="planner.draftNew" params={{ lessonId, groupId, studentId }} />;
}
