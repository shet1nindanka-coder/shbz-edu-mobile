// PLACEHOLDER of `planner.drafts` — the planner area replaces this file's body; the export name and the props stay.
// The route file under src/app already passes the params; nothing there needs to change.
import { PlannerSegments, ScreenPlaceholder } from '@/screens/shell';

export function PlannerDraftsScreen() {
  return (
    <ScreenPlaceholder screenId="planner.drafts">
      <PlannerSegments active="drafts" />
    </ScreenPlaceholder>
  );
}
