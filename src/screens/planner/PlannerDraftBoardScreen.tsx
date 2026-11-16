// PLACEHOLDER of `planner.draftBoard` — the planner area replaces this file's body; the export name and the props stay.
// The route file under src/app already passes the params; nothing there needs to change.
import type { ScreenParams } from '@/navigation';
import { ScreenPlaceholder } from '@/screens/shell';

/** Route params of `planner.draftBoard` (docs/spec/00-unified-contract.md §3; `ScreenParams` in src/navigation/routes.ts). */
export type PlannerDraftBoardScreenProps = ScreenParams['planner.draftBoard'];

export function PlannerDraftBoardScreen({ planId }: PlannerDraftBoardScreenProps) {
  return (
    <ScreenPlaceholder
      screenId="planner.draftBoard"
      params={{ planId }}
      links={[{ screen: 'planner.drafts' }]}
    />
  );
}
